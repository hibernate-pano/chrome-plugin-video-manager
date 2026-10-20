/**
 * 轻量 i18n：优先使用 chrome.i18n（扩展上下文，跟随浏览器语言），
 * 缺失时回退到中文文案（开发/测试环境无 chrome 时也能工作）。
 *
 * 占位符一律由这里负责解析，调用方不用自己 replace：
 * - Chrome 原生形式：`$1`..`$9`（配合 messages.json 里的 placeholders 声明）
 * - 具名 token：`{up}`，按出现顺序与 substitutions 一一对应
 *
 * 最重要的一条不变式：**有 chrome.i18n 与没有 chrome.i18n 时，渲染结果必须一致。**
 * locale 消息用 `$1 / $2`、调用点还留在旧写法 `.replace('{up}', x)` 时，
 * 两条路径都得渲染出「= / - 调速」，不能一边正常一边露出占位符。
 */

/** Chrome 最多支持 9 个位置占位符（$1..$9），多传 getMessage 会直接返回 undefined。 */
const MAX_SUBSTITUTIONS = 9;

/**
 * 语言标记键。
 *
 * 每个 locale 文件里都放一条，值就是该 locale 的 BCP 47 标签。
 * `currentLocale()` 读它来判断 Chrome 实际选了哪个目录。
 *
 * ⚠️ 它必须存在于**每一个** locale 文件里 —— 少一个，那个语言就退回默认值，
 * 于是 `<html lang>` 又会跟实际渲染的内容对不上。
 */
const LOCALE_MARKER_KEY = '__vscLocale';

/** 抽出 `{name}` 形式的具名 token，保持出现顺序并去重。 */
const namedTokens = (text: string): string[] => {
  const matches = text.match(/\{[A-Za-z0-9_]+\}/g);
  return matches ? [...new Set(matches)] : [];
};

/** 位置占位符 `$N` 的个数（取最大编号）。 */
const positionalCount = (text: string): number => {
  const matches = text.match(/\$([1-9])(?!\d)/g);
  if (!matches) {
    return 0;
  }

  return matches.reduce((max, match) => Math.max(max, Number(match.slice(1))), 0);
};

/** `$N` 位置占位符，或 `{name}` 具名占位符。 */
const PLACEHOLDER = /\$([1-9])(?!\d)|\{([A-Za-z0-9_]+)\}/g;

/**
 * 替换文本里的占位符（单趟扫描）。
 *
 * 单趟是必须的：逐个 replace 会让「替换值里含有另一个占位符」的情况被二次替换
 * （先把 $1 换成 "$2"，再把那个 $2 换掉）。回调式 replacer 也不会把替换值里的
 * `$&` / `$1` 当成特殊替换序列——直接传字符串时 replace 会解释这些记号。
 *
 * @param text 要处理的文本
 * @param values 替换值，按位置对应 $1/$2/...，也按出现顺序对应 {name}
 * @param withPositional 是否处理 `$N` 形式。
 *   Chrome 返回的文案里位置占位符已经被它自己替换过了，再替一次会误伤
 *   替换值里恰好写着 "$1" 的情况。
 */
const substitute = (text: string, values: string[], withPositional: boolean): string => {
  const tokens = namedTokens(text);

  return text.replace(PLACEHOLDER, (match, dollarIndex: string | undefined, tokenName: string | undefined) => {
    if (dollarIndex !== undefined) {
      if (!withPositional) {
        return match;
      }
      return values[Number(dollarIndex) - 1] ?? match;
    }

    if (tokenName === undefined) {
      return match;
    }

    // 具名 token 按它在**原文**里的出现顺序对应 values——
    // 不能在位置占位符替换完之后再数，否则混合写法的文案会错位。
    const index = tokens.indexOf(`{${tokenName}}`);
    return index >= 0 ? values[index] ?? match : match;
  });
};

/**
 * 调用方没给 replacements 时，从回落文案里推出「占位符该填什么」。
 *
 * - 有 `{name}` token：把 token 本身当替换值传下去。于是 Chrome 会把 locale 里的
 *   `$1` 填成 "{up}"，调用方后面对返回串做的 `.replace('{up}', x)` 依然有效，
 *   旧调用点不需要为了迁移而改动。
 * - 只有 `$N`：用空串占位。否则 Chrome 不会消费位置占位符（不传 substitutions 时
 *   `$1` 原样留下），界面上就会露出 "$1"。
 */
const deriveValues = (fallback: string): string[] => {
  const named = namedTokens(fallback);
  if (named.length > 0) {
    return named;
  }

  return Array.from({ length: positionalCount(fallback) }, () => '');
};

/**
 * 当前**实际渲染**用的 locale。
 *
 * 为什么不能直接用 `chrome.i18n.getUILanguage()`：
 *
 * `getUILanguage()` 返回的是**浏览器界面语言**（界面长什么样），而 Chrome
 * 挑 `_locales` 下的哪个目录，是另一条路径 —— 它受**系统/地区设置**影响。
 * 两者可以不一致，而这种组合在 macOS 上很常见：系统语言是中文，
 * 但用户把 Chrome 界面单独设成了英文。
 *
 * 实测（Chrome 116+ / Chromium，macOS 系统 locale=zh_CN，浏览器 UI=en-US）：
 *   chrome.i18n.getUILanguage()  -> "en-US"
 *   chrome.i18n.getMessage(...)  -> "快捷键"   ← 实际渲染的是中文
 *
 * 如果拿 `getUILanguage()` 去设 `<html lang>`，就会得到
 * `lang="en-US"` 配一屏中文 —— 屏幕阅读器会用英文语音朗读中文内容。
 * 这类错误**没有视觉症状**，只能靠对比"声明的语言"与"实际渲染的语言"发现。
 *
 * 所以这里不猜 Chrome 的匹配规则，而是**直接读答案**：在每个 locale 文件里
 * 放一个语言标记键，读出它的值就知道 Chrome 选中了哪个目录。
 * 无论 Chrome 的真实规则是什么，读出来的值都与实际渲染的内容一致。
 *
 * 回落到 `navigator.language`：它同样不可靠（也是 UI 语言），但总比写死好；
 * 真正可靠的兜底是"英文"，因为 `default_locale` 是 en，Chrome 永远有 en 可用。
 */
export const currentLocale = (): string => {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
      const marker = chrome.i18n.getMessage(LOCALE_MARKER_KEY);
      if (marker) {
        return marker;
      }
    }
  } catch {
    // 忽略并回落。
  }

  return 'en';
};

/**
 * 取一条本地化文案。
 *
 * @param key chrome.i18n 的消息键
 * @param fallback 找不到消息时的本地文案，同时充当占位符替换的模板
 * @param substitutions 占位符替换值，最多 9 个（Chrome 的上限）
 */
export const t = (key: string, fallback: string, substitutions?: string[]): string => {
  const explicit = substitutions !== undefined;
  const values = explicit ? substitutions : deriveValues(fallback);
  const args = values.length > 0 ? values.slice(0, MAX_SUBSTITUTIONS) : undefined;

  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
      const message: string | undefined = chrome.i18n.getMessage(key, args);
      // 显式判空，而不是用真值判断：
      // Chrome 对「不存在的 key」返回空串，对「调用不合法」（替换值超过 9 个）返回 undefined。
      // 两种都得回退到本地文案，所以两个都要显式排除——
      // 只写 `!== ''` 的话，undefined 会被当成「取到了」，界面上就会显示字面量 undefined。
      if (message !== undefined && message !== '') {
        // 位置占位符 Chrome 已经替过了，这里只补具名 token。
        return substitute(message, values, false);
      }
    }
  } catch {
    // 忽略并回退。
  }

  // 回落文案：位置占位符只在调用方**明确**给了 replacements 时才替，
  // 没给的时候保留 "$1" 字面量 —— 留个明显的破绽，比悄悄渲染成空串要好。
  return substitute(fallback, values, explicit);
};
