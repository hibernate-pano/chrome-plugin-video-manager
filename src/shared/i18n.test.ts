import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { currentLocale, t } from './i18n';

const repoRoot = process.cwd();

const readMessages = (locale: string): Record<string, { message?: string }> =>
  JSON.parse(
    readFileSync(path.join(repoRoot, '_locales', locale, 'messages.json'), 'utf8'),
  ) as Record<string, { message?: string }>;

describe('locale 文件', () => {
  it('en 与 zh_CN 的 key 集合完全一致', () => {
    const en = Object.keys(readMessages('en')).sort();
    const zh = Object.keys(readMessages('zh_CN')).sort();

    // 少一个 key 的表现是「英文界面里某块文案变成一串 key 名」，
    // 多一个 key 则是「中文界面里某块文案永远是英文」。
    // 两种都很难在浏览器里一眼看出来，所以在这里锁死。
    expect(
      zh.filter((key) => !en.includes(key)),
      `zh_CN 多出 en 没有的 key：${zh.filter((key) => !en.includes(key)).join(', ')}`,
    ).toEqual([]);
    expect(
      en.filter((key) => !zh.includes(key)),
      `en 多出 zh_CN 没有的 key：${en.filter((key) => !zh.includes(key)).join(', ')}`,
    ).toEqual([]);
  });

  it('每条消息都有非空内容', () => {
    (['en', 'zh_CN'] as const).forEach((locale) => {
      const messages = readMessages(locale);
      Object.entries(messages).forEach(([key, value]) => {
        expect(value.message, `${locale}/${key} 的 message 是空的`).toBeTruthy();
      });
    });
  });

  it('hintSpeed 用 Chrome 原生占位符，并声明了 placeholders', () => {
    (['en', 'zh_CN'] as const).forEach((locale) => {
      const messages = readMessages(locale) as Record<
        string,
        { message?: string; placeholders?: Record<string, { content?: string }> }
      >;
      const hintSpeed = messages.hintSpeed;

      expect(hintSpeed?.message, `${locale}/hintSpeed 还在用旧的 {up} 写法`).toContain('$1');
      expect(hintSpeed?.message).toContain('$2');
      expect(hintSpeed?.placeholders?.up?.content).toBe('$1');
      expect(hintSpeed?.placeholders?.down?.content).toBe('$2');
    });
  });

  it('每个 key 都真的被代码用上：没有悬空的文案', () => {
    // 悬空的 key 不会报错，只是永远不会被显示——
    // 它们会在 locale 文件里越攒越多，最后没人敢删（因为不知道谁在用）。
    //
    // 扫描范围包含 **src/ 与 manifest.json**：
    // manifest 里的 `description: "__MSG_xxx__"` 也是合法引用
    // （Chrome 会替换它），只看 src/ 会把它误判成悬空。
    const source = [
      readSourceFiles(path.join(repoRoot, 'src')),
      readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'),
    ].join('\n');

    // 匹配单引号**和**双引号：只认单引号的话，有人改用双引号写调用点，
    // 这条检测就会静默失效 —— 而"静默失效的守护"比没有守护更危险。
    const unused = Object.keys(readMessages('en')).filter(
      (key) =>
        !new RegExp(`['"\`]${key}['"\`]`).test(source) &&
        !source.includes(`__MSG_${key}__`),
    );

    expect(
      unused,
      `这些 locale key 在 src/ 与 manifest.json 里都找不到任何引用：${unused.join(', ')}\n` +
        '要么删掉，要么把调用点补上。',
    ).toEqual([]);
  });
});

/** 递归读取 src/ 下的所有 .ts 源码，拼成一个大字符串。 */
const readSourceFiles = (dir: string): string => {
  const parts: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      parts.push(readSourceFiles(full));
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      parts.push(readFileSync(full, 'utf8'));
    }
  }

  return parts.join('\n');
};

describe('t() 的占位符与回落', () => {
  /** 装一个 chrome mock，返回给定的 getMessage 实现。 */
  const withChrome = (getMessage: unknown, run: () => void) => {
    const original = (globalThis as Record<string, unknown>).chrome;
    (globalThis as Record<string, unknown>).chrome = { i18n: { getMessage } };

    try {
      run();
    } finally {
      (globalThis as Record<string, unknown>).chrome = original;
    }
  };

  it('没有 chrome.i18n 时回落到本地文案', () => {
    const original = (globalThis as Record<string, unknown>).chrome;
    (globalThis as Record<string, unknown>).chrome = {};

    try {
      expect(t('someKey', '本地文案')).toBe('本地文案');
    } finally {
      (globalThis as Record<string, unknown>).chrome = original;
    }
  });

  it('chrome.i18n 返回空串时回落到本地文案', () => {
    // 旧实现用 `if (message)` 判断：空串会被当成「取到了」，
    // 于是界面上显示的是空字符串而不是本地文案 —— 一片空白比文案错误更难排查。
    withChrome(() => '', () => {
      expect(t('someKey', '本地文案')).toBe('本地文案');
    });
  });

  it('chrome.i18n 返回 undefined 时回落到本地文案', () => {
    // Chrome 在调用不合法时（例如替换值超过 9 个）返回 undefined。
    // 只判 `!== ''` 的话 undefined 会被当成「取到了」，界面上显示字面量 undefined。
    withChrome(() => undefined, () => {
      expect(t('someKey', '本地文案')).toBe('本地文案');
    });
  });

  it('按位置替换 $1 / $2', () => {
    // mock 模拟 Chrome 的行为：位置占位符由 Chrome 自己替换掉。
    withChrome(
      (_key: string, substitutions?: string[]) =>
        '$1 / $2 调速'.replace('$1', substitutions?.[0] ?? '').replace('$2', substitutions?.[1] ?? ''),
      () => {
        expect(t('hintSpeed', '调速', ['=', '-'])).toBe('= / - 调速');
      },
    );
  });

  it('替换值里的 $ 不会被当成特殊替换序列', () => {
    // String.replace 的替换值里 $& / $1 有特殊含义。
    // 原来的手工 replace 会把替换值里的 $& 展开成被匹配的原文。
    const original = (globalThis as Record<string, unknown>).chrome;
    (globalThis as Record<string, unknown>).chrome = {};

    try {
      expect(t('k', '$1 and $2', ['$&', '$1'])).toBe('$& and $1');
    } finally {
      (globalThis as Record<string, unknown>).chrome = original;
    }
  });

  it('具名 token {up} 按出现顺序替换', () => {
    const original = (globalThis as Record<string, unknown>).chrome;
    (globalThis as Record<string, unknown>).chrome = {};

    try {
      expect(t('k', '{up} / {down} 调速', ['=', '-'])).toBe('= / - 调速');
    } finally {
      (globalThis as Record<string, unknown>).chrome = original;
    }
  });

  it('没传 replacements 时，具名 token 原样保留（供调用方自己 replace）', () => {
    withChrome(
      // 模拟 Chrome 把 $1 填成 token 本身的样子。
      () => '{up} / {down} 调速',
      () => {
        expect(t('hintSpeed', '{up} / {down} 调速')).toBe('{up} / {down} 调速');
      },
    );
  });

  it('没传 replacements 时，回落文案里的位置占位符原样保留', () => {
    const original = (globalThis as Record<string, unknown>).chrome;
    (globalThis as Record<string, unknown>).chrome = {};

    try {
      // 保留 "$1" 字面量比悄悄替换成空串好：空串会让界面看起来像渲染坏了。
      expect(t('k', '$1 / $2 调速')).toBe('$1 / $2 调速');
    } finally {
      (globalThis as Record<string, unknown>).chrome = original;
    }
  });

  it('替换值里含有占位符时不会被二次替换', () => {
    const original = (globalThis as Record<string, unknown>).chrome;
    (globalThis as Record<string, unknown>).chrome = {};

    try {
      // 逐个 replace 会先把 $1 换成 "$2"，再把那个 $2 换掉 —— 结果是 "$1"。
      expect(t('k', '$1 / $2', ['$2', 'X'])).toBe('$2 / X');
    } finally {
      (globalThis as Record<string, unknown>).chrome = original;
    }
  });

  it('有 chrome.i18n 与没有 chrome.i18n 时渲染结果一致', () => {
    // 这是本模块最重要的一条不变式：
    // locale 用 "$1 / $2"、调用点还留在旧写法 `.replace('{up}', x)` 时，
    // 两条路径都得渲染出「= / - 调速」，不能一边正常一边露出占位符。
    const fallback = '{up} / {down} 调速';

    const withoutChrome = (() => {
      const original = (globalThis as Record<string, unknown>).chrome;
      (globalThis as Record<string, unknown>).chrome = {};
      try {
        return t('hintSpeed', fallback);
      } finally {
        (globalThis as Record<string, unknown>).chrome = original;
      }
    })();

    // Chrome 把 locale 的 "$1 / $2" 填成 token 本身（因为传进去的就是 token）。
    const withI18n = (() => {
      const original = (globalThis as Record<string, unknown>).chrome;
      (globalThis as Record<string, unknown>).chrome = {
        i18n: { getMessage: () => '{up} / {down} 调速' },
      };
      try {
        return t('hintSpeed', fallback);
      } finally {
        (globalThis as Record<string, unknown>).chrome = original;
      }
    })();

    expect(withI18n).toBe(withoutChrome);
    // 旧调用点后面对返回串做的 replace 依然有效。
    expect(withoutChrome.replace('{up}', '=').replace('{down}', '-')).toBe('= / - 调速');
  });
});

describe('currentLocale()：<html lang> 必须与实际渲染的语言一致', () => {
  const withChrome = (getMessage: unknown, run: () => void) => {
    const original = (globalThis as Record<string, unknown>).chrome;
    (globalThis as Record<string, unknown>).chrome = { i18n: { getMessage } };

    try {
      run();
    } finally {
      (globalThis as Record<string, unknown>).chrome = original;
    }
  };

  it('读语言标记键，而不是 getUILanguage()', () => {
    // 场景：macOS 系统语言是中文，Chrome 界面是英文。
    // Chrome 此时选中的是 _locales/zh_CN（实测：getMessage 返回中文），
    // 但 getUILanguage() 给的是 "en-US"。
    // 如果拿 getUILanguage() 去设 lang，就会 lang="en-US" 配一屏中文 ——
    // 屏幕阅读器用英文语音朗读中文内容。这类错误没有任何视觉症状。
    const getMessage = (key: string) => (key === '__vscLocale' ? 'zh-CN' : '快捷键');
    withChrome(getMessage, () => {
      expect(currentLocale()).toBe('zh-CN');
    });
  });

  it('读不到标记键时回落到 en（default_locale 一定是它）', () => {
    withChrome(() => '', () => {
      expect(currentLocale()).toBe('en');
    });
  });

  it('没有 chrome.i18n 时回落到 en', () => {
    const original = (globalThis as Record<string, unknown>).chrome;
    (globalThis as Record<string, unknown>).chrome = {};

    try {
      expect(currentLocale()).toBe('en');
    } finally {
      (globalThis as Record<string, unknown>).chrome = original;
    }
  });

  it('每个 locale 文件都必须有语言标记键', () => {
    // 少一个语言，那个语言就退回默认值 —— lang 又会跟实际渲染的内容对不上。
    (['en', 'zh_CN'] as const).forEach((locale) => {
      const messages = readMessages(locale) as Record<string, { message?: string }>;
      expect(
        messages.__vscLocale?.message,
        `${locale}/messages.json 缺少 __vscLocale —— currentLocale() 会读不到它`,
      ).toBeTruthy();
    });
  });

  it('语言标记键的值是 BCP 47 标签，不是要翻译的文案', () => {
    const en = readMessages('en') as Record<string, { message?: string }>;
    const zh = readMessages('zh_CN') as Record<string, { message?: string }>;

    // 它会被直接写进 <html lang>，所以必须是合法语言标签。
    expect(en.__vscLocale?.message).toMatch(/^[a-z]{2}(-[A-Za-z0-9]+)*$/);
    expect(zh.__vscLocale?.message).toMatch(/^[a-z]{2}(-[A-Za-z0-9]+)*$/);
    // 两个文件不能是同一个值 —— 那就分不出语言了。
    expect(en.__vscLocale?.message).not.toBe(zh.__vscLocale?.message);
  });
});
