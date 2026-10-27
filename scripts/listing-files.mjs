/**
 * listing-files.mjs — 把 CHROMEWEBSTORE.md 里的商店文案拆成「按 locale 分好的粘贴件」。
 *
 * ## 为什么需要这个脚本
 *
 * 商店文案**只能人工去 Dashboard 粘贴**（CWS API 的 v1.1 与 v2 都只有
 * upload / publish / fetchStatus / cancelSubmission，没有 metadata 字段）。
 * 而 Dashboard 里 zh_CN 与 en 是**两个独立的输入框**——
 * 于是「先把中英拼在一份文档里、粘贴时再拆开」这件事，天然会出错：
 *
 * - 2026-10-23 实读：线上中文那份还写着能控制**音频**（与事实相反），
 *   英文那份还写着「4 个快捷键」「跨域 iframe 不可控」；
 * - 2026-10-27 实读：连**短描述**都还是旧的（`_locales` 里的那一版），
 *   仓库里 2026-10-20 改写过的 115 字符新版**从未贴过**。
 *
 * 也就是说：漂的不是「文案写错了」，而是「**贴的那一下**没有闸门」。
 * 这个脚本把「拆」这一步从**手工**变成**脚本产出**：
 * `CHROMEWEBSTORE.md` 仍是唯一来源，粘贴件由它生成，守卫盯着两者一致。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/listing-files.mjs            # 生成/更新 store-assets/listing/*.txt
 * node scripts/listing-files.mjs --check    # 只校验，不写（CI / 提交前用）
 * ```
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export const SOURCE_DOC = resolve(root, 'CHROMEWEBSTORE.md');
export const OUT_DIR = resolve(root, 'store-assets/listing');

/** 粘贴件的文件名 → 这个文件该贴到 Dashboard 的哪一栏。 */
export const FILES = {
  'short-description-zh_CN.txt': 'Short Description（zh_CN 那一栏）',
  'short-description-en.txt': 'Short Description（en 那一栏）',
  'description-zh_CN.txt': 'Detailed Description（zh_CN 那一栏）',
  'description-en.txt': 'Detailed Description（en 那一栏）',
};

/** CWS 的字段上限（见 .memory/cws-api-v1-deadline.md）。 */
export const LIMITS = {
  shortDescription: 132,
  detailedDescription: 16_000,
};

/**
 * 去掉 HTML 注释块。
 *
 * 为什么必须去：文档里每一栏后面都跟着一大段 `<!-- … -->` 的说明
 * （为什么这么写、历史上踩过什么坑）。那些说明**不能**被贴进商店，
 * 而它们里有 `**`、有 `--`、还有整段的中文 —— 留着它们当粘贴件，
 * 贴出去就是灾难。
 */
const stripComments = (lines) => {
  const out = [];
  let inside = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inside) {
      if (trimmed.includes('-->')) inside = false;
      continue;
    }
    if (trimmed.startsWith('<!--')) {
      if (!trimmed.includes('-->')) inside = true;
      continue;
    }
    out.push(line);
  }
  return out;
};

/**
 * 取某一栏的值。
 *
 * 形态约定：`**栏名** [REQUIRED]` 之后可以跟注释块，然后是空行，
 * 再往后就是值。值可能是单行（Short Description / Category），
 * 也可能是多行（Detailed Description —— 中英两段之间有段落空行，
 * 所以不能拿「空行」当结束标记）。
 *
 * 结束标记有三种，都不会出现在值里面：
 * - `**…**` —— 下一栏的标题
 * - `>` —— 值后面那段维护者备注（引用块）
 * - `#` —— 下一个小节
 */
const fieldValue = (lines, label) => {
  const index = lines.findIndex((line) => line.trim().startsWith(`**${label}**`));
  if (index < 0) {
    throw new Error(`CHROMEWEBSTORE.md 里找不到 **${label}** 这一栏`);
  }

  const body = stripComments(lines.slice(index + 1));
  const collected = [];
  for (const line of body) {
    const trimmed = line.trim();
    if (trimmed.startsWith('>') || trimmed.startsWith('**') || trimmed.startsWith('#')) break;
    collected.push(line);
  }

  const value = collected.join('\n').trim();
  if (value === '') {
    throw new Error(`**${label}** 这一栏是空的`);
  }
  return value;
};

/**
 * 短描述是「中英拼在一行」的（自检按「中英拼接后一起算」计数）。
 * 拆成两半：中文到第一个句号为止，剩下是英文。
 */
const splitShortDescription = (text) => {
  const stop = text.indexOf('。');
  if (stop < 0) return { zh: text, en: '' };
  return { zh: text.slice(0, stop + 1), en: text.slice(stop + 1).trim() };
};

/** 详细描述用单独一行 `---` 分隔中英两段。 */
const splitDetailedDescription = (text) => {
  const lines = text.split('\n');
  const separator = lines.findIndex((line) => line.trim() === '---');
  if (separator < 0) {
    throw new Error('详细描述里找不到单独一行 `---` —— 中英两段的分隔标记不见了');
  }
  return {
    zh: lines.slice(0, separator).join('\n').trim(),
    en: lines.slice(separator + 1).join('\n').trim(),
  };
};

/**
 * 从 CHROMEWEBSTORE.md 解析出全部要贴的字段。
 * 抛出的每一条错误都在说「哪一栏不见了」，而不是一个栈。
 */
export const parseListing = (markdown) => {
  const lines = markdown.split('\n');
  const short = splitShortDescription(fieldValue(lines, 'Short Description'));
  const detailed = splitDetailedDescription(fieldValue(lines, 'Detailed Description'));

  return {
    name: fieldValue(lines, 'Extension Name'),
    shortDescription: short,
    detailedDescription: detailed,
    category: fieldValue(lines, 'Category'),
    singlePurpose: fieldValue(lines, 'Single Purpose'),
    primaryLanguage: fieldValue(lines, 'Primary Language'),
  };
};

/** 生成「文件名 → 内容」的映射。 */
export const buildFiles = (markdown) => {
  const listing = parseListing(markdown);
  return {
    'short-description-zh_CN.txt': `${listing.shortDescription.zh}\n`,
    'short-description-en.txt': `${listing.shortDescription.en}\n`,
    'description-zh_CN.txt': `${listing.detailedDescription.zh}\n`,
    'description-en.txt': `${listing.detailedDescription.en}\n`,
  };
};

/** 把解析结果与生成结果合成一段可打印的核对表。 */
export const describeFiles = (files) =>
  Object.entries(files)
    .map(([name, content]) => {
      const chars = [...content.replace(/\n$/, '')].length;
      return `${name.padEnd(30)} ${String(chars).padStart(6)} 字符  → ${FILES[name]}`;
    })
    .join('\n');

/** 写入粘贴件。返回实际写盘的文件名列表。 */
export const writeFiles = (files) => {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(OUT_DIR, name), content, 'utf8');
  }
  return Object.keys(files);
};

/** 只校验：粘贴件与来源是否一致。返回不一致的文件名列表。 */
export const checkFiles = (files) => {
  const drift = [];
  for (const [name, content] of Object.entries(files)) {
    const path = join(OUT_DIR, name);
    if (!existsSync(path)) {
      drift.push(`${name}（不存在）`);
      continue;
    }
    if (readFileSync(path, 'utf8') !== content) {
      drift.push(`${name}（内容与 CHROMEWEBSTORE.md 不一致）`);
    }
  }
  return drift;
};

// ---- CLI ------------------------------------------------------------------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checkOnly = process.argv.includes('--check');
  const markdown = readFileSync(SOURCE_DOC, 'utf8');
  const files = buildFiles(markdown);

  console.log('== 粘贴件 ==');
  console.log(describeFiles(files));

  if (checkOnly) {
    const drift = checkFiles(files);
    if (drift.length > 0) {
      console.error('\n❌ 粘贴件与 CHROMEWEBSTORE.md 已经跑偏：');
      for (const item of drift) console.error(`   ${item}`);
      console.error('   跑 `node scripts/listing-files.mjs` 重新生成。');
      process.exit(1);
    }
    console.log('\n✅ 四个粘贴件与 CHROMEWEBSTORE.md 逐字一致。');
  } else {
    const written = writeFiles(files);
    console.log(`\n✅ 已写入 ${written.length} 个文件到 ${OUT_DIR}`);
  }
}
