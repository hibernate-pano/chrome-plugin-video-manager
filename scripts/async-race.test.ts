import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ts from 'typescript';

/**
 * 异步竞态不变式的**结构守卫**。
 *
 * ## 它守的是什么
 *
 * docs/ARCHITECTURE.md「拿着快照跨过一次 await：版本号闸门」记着一条不变式：
 *
 * > **采样点钉在第一次 await 之前；比较点钉在动手的那一行之前（中间不许再夹 await）。**
 *
 * 那条不变式管的是一类**具体的**缺陷：
 * 拿着一个快照，跨过一次 `await`，然后按那个快照去改状态 ——
 * 等待期间到达的**更��**事实会被旧快照盖掉（标题开始说一个假的倍速）。
 *
 * ## 为什么它值得用**静态**守卫，而不是只靠行为测试
 *
 * 行为测试（src/background/title.test.ts 的「读数版本号」那几组）守的是
 * 「新读数赢过旧判据」这个**结果**。但那几条路径各有各的判据组合，
 * 行为测试无法回答「这一处**新加**的异步路径有没有踩同一个坑」——
 * 而这正是缺陷复发的地方（实测：五道闸门补齐到七道，每一道都是
 * 事后才发现漏了同一种形状）。
 *
 * 静态守卫守的是**形状**：只要新写了一条异步路径，
 * 忘了在 await 之前采样、或者在比较之后又插了一次 await，
 * 这里当场变红。
 *
 * ## 两条规则各自的失败形态
 *
 * - **采样点在 await 之后** → 从取样点到比较点之间一个 await 都没有，
 *   版本号**不可能变** → 闸门永远成立，是**死代码**；
 *   而且它只挡住后半截窗口，前半截无人看守。
 * - **比较点与动手之间夹了 await** → 最后那一小段窗口无人看守：
 *   新读数正好在那段里到达，照样被旧快照盖掉。
 *
 * ⚠️ 两条都是**静默**的：代码照样编译、照样跑、照样显示一个（错的）倍速。
 * 所以它们必须有一个不依赖运行时的守卫。
 *
 * ## 这条守卫**看不到**什么（诚实的边界）
 *
 * 它认的是 `await` 表达式，**不认 `.then()` 链** ——
 * 一个写成 `.then()` 的异步续段，这里的 `firstOwnAwait` 找不到，于是规则一
 * 会判「这个函数没有 await → 取样点无所谓」而**放过**它。
 *
 * 现状：仓里唯一的 `.then()` 闸门路径（`clearStaleMark`）的取样点本来就落在
 * `.then()` **之前**，是对的；所以这条边界现在没造成漏守。
 * 以后若有人把一条新异步路径写成 `.then()` 而采样点落在了回调**里面**，
 * 这里不会响 —— 要扩这条守卫，就把 `firstOwnAwait` 换成
 * 「await 表达式 **或** `.then(`/`.catch(` 调用」的并集。
 */

const repoRoot = resolve(__dirname, '..');

/** 采样点：这个函数名一出现，就说明这里要采一份「读数版本号」。 */
const CAPTURE = 'captureRateRevision';
/** 比较点：这个函数名一出现，就说明这里要核对「期间有没有新读数到过」。 */
const CHECK = 'rateRevisionUnchanged';

/** 递归收集 src/ 下的 .ts 源文件（不含 .test.ts）。 */
const sourceFiles = (dir = join(repoRoot, 'src')): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
};

type CallSite = {
  file: string;
  line: number;
  /** 所在的函数（箭头函数/函数声明）；null = 模块顶层。 */
  fn: ts.Node | null;
  /** 所在函数的 body（Block）；null = 表达式体箭头函数。 */
  fnBody: ts.Block | null;
  node: ts.CallExpression;
};

const isFunctionNode = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n);

/**
 * 收集一个函数体里**属于它自己**的调用点。
 *
 * ⚠️ **不能**钻进嵌套函数：嵌套函数有自己的 await 序列 ——
 * 外层函数的 await 不「挡住」内层，内层也不「挡住」外层。
 * 把内层的调用算到外层头上，会凭空造出「比较点在 await 之后」的假阳性。
 */
const callsWithin = (fnBody: ts.Block, fnNode: ts.Node): CallSite[] => {
  const found: CallSite[] = [];
  const visit = (n: ts.Node) => {
    // ⚠️ 嵌套函数**不进来**：它有自己的 await 序列，
    // 外层的 await 不「挡住」内层，内层的也不「挡住」外层。
    // 把内层的调用算到外层头上，会凭空造出「比较点在 await 之后」的假阳性，
    // 而且同一次调用会被**记两遍**（外层记一次、内层自己记一次）。
    if (n !== fnBody && isFunctionNode(n)) return;

    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      if (n.expression.text === CAPTURE || n.expression.text === CHECK) {
        found.push({
          file: '',
          line: 0,
          fn: fnNode,
          fnBody,
          node: n,
        });
      }
    }
    n.forEachChild(visit);
  };
  fnBody.forEachChild(visit);
  return found;
};

/** 函数体里**属于它自己**的第一个 await（不钻进嵌套函数）。 */
const firstOwnAwait = (fnBody: ts.Block): ts.AwaitExpression | null => {
  let found: ts.AwaitExpression | null = null;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (n !== fnBody && isFunctionNode(n)) return;
    if (ts.isAwaitExpression(n)) {
      found = n;
      return;
    }
    n.forEachChild(visit);
  };
  fnBody.forEachChild(visit);
  return found;
};

/** 一个语句里（含它自己的后代，但不含嵌套函数）有没有 await。 */
const containsOwnAwait = (n: ts.Node): boolean => {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (node !== n && isFunctionNode(node)) return;
    if (ts.isAwaitExpression(node)) {
      found = true;
      return;
    }
    node.forEachChild(visit);
  };
  n.forEachChild(visit);
  return found;
};

const parse = (file: string) =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

/** 收集一个文件里全部与版本号闸门有关的调用点。 */
const collect = (file: string): CallSite[] => {
  const sf = parse(file);
  const sites: CallSite[] = [];

  const record = (fnNode: ts.FunctionLikeDeclaration, fnBody: ts.Block) => {
    for (const call of callsWithin(fnBody, fnNode)) {
      call.file = file;
      call.line = sf.getLineAndCharacterOfPosition(call.node.getStart(sf)).line + 1;
      sites.push(call);
    }
  };

  const visit = (n: ts.Node) => {
    if (isFunctionNode(n) && n.body && ts.isBlock(n.body)) {
      record(n, n.body);
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return sites;
};

/** 相对仓库根的路径 —— 报错信息要能让人一眼找到那行。 */
const rel = (file: string) => file.replace(`${repoRoot}/`, '');

describe('异步竞态：版本号闸门的取样点与比较点', () => {
  const files = sourceFiles();
  const allSites = files.flatMap(collect);
  const captures = allSites.filter((s) => s.node.expression.getText() === CAPTURE);
  const checks = allSites.filter((s) => s.node.expression.getText() === CHECK);

  it('这套闸门真的在用（否则守卫是在守一个不存在的东西）', () => {
    expect(
      captures.length,
      `全仓找不到 ${CAPTURE}() 的调用点 —— 版本号闸门被拆掉了？` +
        '那这组守卫守的就是一个不存在的东西，请连同文档一起处理。',
    ).toBeGreaterThan(0);
    expect(checks.length, `全仓找不到 ${CHECK}() 的调用点`).toBeGreaterThan(0);
  });

  it('采样点钉在第一次 await 之前（否则闸门是死代码）', () => {
    const violations: string[] = [];

    for (const site of captures) {
      if (!site.fnBody) {
        violations.push(
          `${rel(site.file)}:${site.line} —— ${CAPTURE}() 在表达式体箭头函数里，` +
            '那里没有 await 可言（要采样就得起一个 async 函数）。',
        );
        continue;
      }

      const awaitNode = firstOwnAwait(site.fnBody);
      if (!awaitNode) continue; // 没有 await → 取样点无所谓

      if (site.node.getStart() > awaitNode.getStart()) {
        violations.push(
          `${rel(site.file)}:${site.line} —— ${CAPTURE}() 落在本函数第一次 await **之后**。\n` +
            `  从取样点到比较点之间一个 await 都没有，版本号不可能变 → 闸门永远成立（死代码），\n` +
            '  而且「读存储那一次 await」这段窗口无人看守。',
        );
      }
    }

    expect(
      violations,
      `版本号闸门的取样点必须在第一次 await 之前：\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('比较点钉在动手的那一行之前（中间不许再夹 await）', () => {
    const violations: string[] = [];

    for (const site of checks) {
      const sf = parse(site.file);

      // 比较点必须长成 `if (!rateRevisionUnchanged(...)) { ... }` 这一形状。
      //
      // ⚠️ 调用点的**直接父节点**不是 if —— 中间隔着一层 `!`
      // （`!rateRevisionUnchanged(...)`）或一层括号。
      // 所以要往上找到那个 if 为止。
      let parent: ts.Node = site.node;
      while (
        parent.parent &&
        !ts.isIfStatement(parent.parent) &&
        (ts.isPrefixUnaryExpression(parent.parent) ||
          ts.isParenthesizedExpression(parent.parent))
      ) {
        parent = parent.parent;
      }

      if (!ts.isIfStatement(parent.parent)) {
        violations.push(
          `${rel(site.file)}:${site.line} —— ${CHECK}() 不是用在一道 if 守卫里。\n` +
            '  这道闸门必须明确地「不成立就不动手」，否则「不成立」这件事没人看得见。',
        );
        continue;
      }

      const guard = parent.parent;

      // 找到这个 if 所在的语句块，取它**后面**的那条语句 ——
      // 那就是「动手」的那一行。
      const block = guard.parent;
      if (!ts.isBlock(block)) {
        violations.push(
          `${rel(site.file)}:${site.line} —— 这道 if 守卫不在一个语句块里，判不出「动手」的那一行。`,
        );
        continue;
      }

      const index = block.statements.indexOf(guard);
      const next = block.statements[index + 1];
      if (!next) {
        violations.push(
          `${rel(site.file)}:${site.line} —— 这道 if 守卫之后没有任何语句，判不出「动手」的那一行。`,
        );
        continue;
      }

      if (containsOwnAwait(next)) {
        violations.push(
          `${rel(site.file)}:${site.line} —— 比较点与「动手」的那一行之间**夹了 await**。\n` +
            `  后面那条语句是：${next.getText(sf).split('\n')[0].slice(0, 80)}\n` +
            '  最后那一小段窗口无人看守：新读数正好在那段里到达，照样被旧快照盖掉。',
        );
      }
    }

    expect(
      violations,
      `版本号闸门的比较点必须紧贴着「动手」的那一行：\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
