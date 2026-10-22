import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as types from './types';

/**
 * 消息协议的**真源**守卫。
 *
 * 背景：这个扩展的内容脚本与 background 之间靠 8 类消息通信，
 * 而消息的「字符串值」（`vsc-xxx`）写在 `src/shared/types.ts` 里。
 * 那边漂了，这里不会有人告诉你 —— 表现是**静默失败**：
 * 一方改了名字，另一方还在等旧名字，于是「按 f 没反应」「标题不更新」。
 *
 * 这个仓库已经吃过一次这种亏：
 * - `vsc-tab-rate` 写进 `storage.session` 却**从来没有一处读回**，
 *   于是 service worker 一回收，「视频没了 → 标题复位」这条链路就断了
 *   （注释还写着「storage.session 活得比它久，重启后仍能回答」）。
 * - 两个协议类型（`FrameFocusMessage` / `VideoOwnerReportMessage`）
 *   声明了却**没人 import**，等于只有注释没有约束 ——
 *   协议形状改了，没有任何一处会报错。
 *
 * 所以这里守三条：
 * 1. 每个协议常量都被**至少两个**生产文件用到（一端发、一端收）；
 * 2. 每个协议常量的**线上取值**互不相同（撞名会让一条消息被另一条吃掉）；
 * 3. 每条**带载荷**的协议都有类型声明，且那个声明**真的被生产代码用上了**
 *    （不许有孤儿类型，也不许有「只有注释没有约束」的类型）。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcRoot = join(repoRoot, 'src');

/** 递归列出 src 下的所有 .ts 文件。 */
const listTypeScriptFiles = (dir: string): string[] => {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listTypeScriptFiles(full));
    } else if (entry.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
};

/**
 * 生产文件清单。
 *
 * ⚠️ **排除测试文件**：测试里引用一个常量，不能证明产品代码在用它 ——
 * 那正是「协议声明了但没人用」的那种假覆盖。
 */
const productionFiles = listTypeScriptFiles(srcRoot).filter(
  (file) => !file.endsWith('.test.ts') && file !== join(srcRoot, 'shared', 'types.ts'),
);

/**
 * types.ts 的全部导出。
 *
 * ⚠️ 显式标成 `[string, unknown]`：直接用 `Object.entries(types)` 的话，
 * 值的类型是所有导出的**联合**（含 ShortcutSettings 之类），
 * 类型谓词没法把 `[string, string]` 收窄成它的子类型 —— 那是 TS2677。
 */
const exportedValues = Object.entries(types) as Array<[string, unknown]>;

/** 协议常量：名字以 _MESSAGE / _COMMAND / _EVENT 结尾的字符串常量。 */
const protocolConstants = exportedValues.filter(
  (entry): entry is [string, string] =>
    typeof entry[1] === 'string' && /_(MESSAGE|COMMAND|EVENT)$/.test(entry[0]),
);

const protocolNames = protocolConstants.map(([name]) => name);

/**
 * 协议常量 → 它的类型声明（按命名约定推导）。
 *
 * 约定：`FRAME_FOCUS_MESSAGE` → `FrameFocusMessage`，
 * `VIDEO_OWNER_REPORT_MESSAGE` → `VideoOwnerReportMessage` ——
 * 去掉 `_MESSAGE` / `_COMMAND` / `_EVENT` 后缀，剩下的下划线分段各自首字母大写。
 */
const typeNameFor = (protocolName: string): string => {
  const base = protocolName.replace(/_(MESSAGE|COMMAND|EVENT)$/, '');
  return `${base
    .split('_')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join('')}Message`;
};

/**
 * types.ts 里**声明**的消息类型。
 *
 * ⚠️ 不能用 `Object.keys(types)` 去找它们：**interface 是编译期的东西**，
 * 运行时模块对象里根本没有它（`export interface` 被完全擦掉）。
 * 所以只能扫源码。
 */
const typesSource = readFileSync(join(srcRoot, 'shared', 'types.ts'), 'utf8');
const declaredMessageTypes = [...typesSource.matchAll(/export interface (\w+Message)\b/g)].map(
  (match) => match[1],
);

/**
 * **不带载荷**的协议：它们的「形状」就是一个 type 字符串，不需要类型声明。
 *
 * 每一行都要写清楚为什么 —— 这张表本身就是协议文档。
 * 新增协议时：如果它带载荷，就**别**进这张表，给它写一个类型声明。
 */
const PAYLOAD_LESS = new Map<string, string>([
  ['TOGGLE_FULLSCREEN_MESSAGE', '只是一条「切换全屏」的指令，没有任何载荷'],
  ['VIDEO_OWNER_ASK_MESSAGE', '一次广播式的问询，各 frame 各自回答，不带内容'],
  ['VIDEO_OWNER_QUERY_MESSAGE', '「别的 frame 有没有视频」的问询，不带内容'],
  ['OPEN_OPTIONS_COMMAND', '它不是消息，是 chrome.commands 的命令名'],
  ['SPEED_CHANGE_EVENT', '它不是消息，是派发在 DOM 上的事件名'],
]);

describe('消息协议的真源', () => {
  it('协议常量一个都不能少（这份清单就是协议本身）', () => {
    const names = protocolNames.slice().sort();

    // ⚠️ 这份清单是**字面量**：新增或删除一条协议，必须同时改这里。
    // 目的不是「不许改协议」，而是「改协议时必须有人看一眼清单」——
    // docs/ARCHITECTURE.md 的消息表是照着它写的，两边会一起漂。
    expect(names).toEqual([
      'FRAME_FOCUS_MESSAGE',
      'OPEN_OPTIONS_COMMAND',
      'SPEED_CHANGE_EVENT',
      'SPEED_REPORT_MESSAGE',
      'TOGGLE_FULLSCREEN_MESSAGE',
      'VIDEO_OWNER_ASK_MESSAGE',
      'VIDEO_OWNER_QUERY_MESSAGE',
      'VIDEO_OWNER_REPORT_MESSAGE',
    ]);
  });

  it('每个协议常量都被至少两个生产文件用到（一端发、一端收）', () => {
    const dead = protocolConstants
      .filter(([name]) => {
        const users = productionFiles.filter((file) => readFileSync(file, 'utf8').includes(name));
        return users.length < 2;
      })
      .map(([name]) => name);

    expect(
      dead,
      '这些协议常量只有 0~1 个生产文件在用 —— 要么没人处理（静默失败），' +
        '要么只剩声明（那它就是一段注释，不是协议）。' +
        '要么把接收端接回去，要么把它删掉。',
    ).toEqual([]);
  });

  it('协议常量的线上取值互不相同（撞名会让一条消息被另一条吃掉）', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];

    for (const [name, value] of protocolConstants) {
      const previous = seen.get(value);
      if (previous) {
        collisions.push(`${previous} 与 ${name} 都用了 "${value}"`);
      } else {
        seen.set(value, name);
      }
    }

    expect(collisions, '协议取值撞名了').toEqual([]);
  });

  it('每条带载荷的协议都有类型声明', () => {
    const missing = protocolNames
      .filter((name) => !PAYLOAD_LESS.has(name))
      .filter((name) => !declaredMessageTypes.includes(typeNameFor(name)))
      .map((name) => `${name} → 应该有 ${typeNameFor(name)} 类型声明`);

    expect(
      missing,
      '这些协议带载荷却没有类型声明 —— 载荷形状（字段叫什么）漂了没人会报错，' +
        '症状是静默失败。要么补类型声明，要么把它挪进 PAYLOAD_LESS（并写清理由）。',
    ).toEqual([]);
  });

  it('PAYLOAD_LESS 里的每一条都真的不带载荷（表不能有陈旧条目）', () => {
    const stale = [...PAYLOAD_LESS.keys()].filter((name) => !protocolNames.includes(name));

    expect(
      stale,
      'PAYLOAD_LESS 里写着的协议常量已经不存在了 —— 这张表会骗人。',
    ).toEqual([]);
  });

  it('没有孤儿类型（每个类型声明都对应一条真实协议）', () => {
    const orphans = declaredMessageTypes.filter(
      (typeName) => !protocolNames.some((name) => typeNameFor(name) === typeName),
    );

    expect(
      orphans,
      '这些类型声明没有对应的协议常量 —— 它们是「形状写在代码里、却没有协议」的孤儿，' +
        '要么补上协议，要么删掉声明。',
    ).toEqual([]);
  });

  it('类型声明真的被生产代码用上了（不许「只有注释没有约束」）', () => {
    const unused = declaredMessageTypes.filter(
      (typeName) => !productionFiles.some((file) => readFileSync(file, 'utf8').includes(typeName)),
    );

    expect(
      unused,
      '这些协议类型声明了却没有任何生产文件 import —— 等于只有注释没有约束：' +
        '形状改了不会有任何一处报错。把它接到发送端或接收端去。',
    ).toEqual([]);
  });
});
