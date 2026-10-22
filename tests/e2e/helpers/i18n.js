import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { DIST } from './launch.js';

/**
 * 与**机器语言无关**的文案断言。
 *
 * 为什么需要它：`chrome.i18n` 挑 `_locales` 下的哪个目录，跟着的是**系统 locale**
 * —— 不是 `--lang`，也不是浏览器界面语言。实测（Chromium，macOS）：
 *
 *   --lang=en-US      → getMessage('optSubtitle') 仍然是中文
 *   LANG=en_US.UTF-8  → 同上
 *
 * 也就是说：写死中文的断言**只在中文系统的机器上成立**。开发机是中文系统，
 * CI 容器（ubuntu-latest）是英文环境 —— 于是「本地过、CI 挂」。
 * 这个坑本仓库已经踩过两次（见 2026-10-06 那次提交「接管提示断言不再依赖机器
 * 语言」），但那次只补了**一条**断言，没有解决**结构**问题，于是下一次新增
 * 断言又踩一遍。
 *
 * 这里的解法是结构性的：断言不再写死某一种语言，而是**接受任意一种已翻译文案**。
 * 它仍然验的是「界面显示的是这条消息对应的内容」—— 只是不关心它被翻译成了哪种
 * 语言。消息键才是契约，翻译不是。
 */

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 读出构建产物里所有 locale 的某条消息。 */
const messagesOf = (locale) => {
  const file = join(DIST, '_locales', locale, 'messages.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
};

/** 构建产物里有哪些 locale。 */
export const availableLocales = () => {
  const dir = join(DIST, '_locales');
  if (!existsSync(dir)) {
    throw new Error(`找不到构建产物里的 _locales：${dir}（先跑 pnpm build）`);
  }
  return readdirSync(dir).filter((name) => existsSync(join(dir, name, 'messages.json')));
};

/**
 * 一条消息在**任意语言**下的正则。
 *
 * 用法：
 *   await expect(page.locator('#status')).toHaveText(anyLocale('optUnsaved'));
 *   expect(hint.text).not.toMatch(anyLocale('hintToolbar'));
 *
 * 正则带 `^...$` 锚点，所以既能用于 `toHaveText`（全等），也能用于
 * `toMatch`（子串）。**否定断言必须用 `not.toMatch`**，不能用
 * `not.toContain` —— 后者只接受字符串。
 *
 * @param key chrome.i18n 的消息键
 * @param substitutions 可选的替换值，用来填消息里的 $1 / $2
 */
export const anyLocale = (key, substitutions) => {
  const alternatives = availableLocales()
    .map((locale) => {
      const message = messagesOf(locale)[key]?.message;
      if (!message) return null;
      let filled = message;
      if (substitutions) {
        substitutions.forEach((value, index) => {
          filled = filled.replace(new RegExp(`\\$${index + 1}`, 'g'), value);
        });
      }
      return escapeRegExp(filled);
    })
    .filter(Boolean);

  if (alternatives.length === 0) {
    throw new Error(`消息键 ${key} 在任何 locale 里都不存在 —— 断言会永远失败`);
  }

  // ⚠️ 带占位符的消息**不能**用全等断言：渲染出来的值是替换后的内容
  // （"按 ⌘⇧, 打开设置页"），而正则里留着 "$1"，永远匹配不上。
  // 这种消息要用 anyLocaleFragment（占位符会变成通配）。
  const hasPlaceholder = availableLocales().some(
    (locale) => /\$\d/.test(messagesOf(locale)[key]?.message ?? ''),
  );
  if (hasPlaceholder && !substitutions) {
    throw new Error(
      `消息键 ${key} 带占位符 —— 不能用全等断言，请改用 anyLocaleFragment('${key}')`,
    );
  }

  return new RegExp(`^(?:${alternatives.join('|')})$`);
};

/**
 * 某条消息在**任意语言**下的**子串**正则（不锚定）。
 *
 * 用于「这段文字里**不该**出现某条消息」这类否定断言，
 * 以及「这段文字里**应该**出现某条消息的一部分」这类断言。
 *
 * 消息里的占位符 `$1 / $2` 会被换成通配 `.+?` —— 替换值（快捷键、秒数…）
 * 在不同版本、不同机器上可能不同，断言不该绑死它。
 */
export const anyLocaleFragment = (key) => {
  const alternatives = availableLocales()
    .map((locale) => {
      const message = messagesOf(locale)[key]?.message;
      if (!message) return null;
      // ⚠️ 占位符必须在**转义之前**换掉：先 escapeRegExp 的话，`$1` 会被
      // 变成 `\$1`，后面再找 `$1` 就找不到了（通配符永远替换不进去）。
      return message
        .split(/\$\d/)
        .map(escapeRegExp)
        .join('.+?');
    })
    .filter(Boolean);

  if (alternatives.length === 0) {
    throw new Error(`消息键 ${key} 在任何 locale 里都不存在 —— 断言会永远失败`);
  }

  return new RegExp(alternatives.join('|'));
};
