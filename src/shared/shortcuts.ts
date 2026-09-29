import { DEFAULT_SHORTCUTS, ShortcutSettings } from './types';

const MODIFIER_KEYS = new Set(['ctrl', 'control', 'alt', 'shift', 'meta', 'os']);

const normalizeMainKey = (value: string) => {
  if (value === '' || value === ' ' || value === 'Space' || value === 'Spacebar') {
    return ' ';
  }

  if (value.length === 1) {
    return value.toLowerCase();
  }

  return value;
};

/**
 * 规范化快捷键字符串：
 * - 修饰键小写（ctrl/alt/shift/meta）
 * - 主键统一（'Space'/'Spacebar'/' ' -> ' '）
 * - 空串原样返回（非法输入不产生有效快捷键）
 */
export const normalizeShortcut = (value: string) => {
  if (value === '') {
    return '';
  }

  return value
    .split('+')
    .map((part) => part.trim())
    .filter((part, index, parts) => part !== '' || index === parts.length - 1)
    .map((part, index, parts) => {
      if (index < parts.length - 1) {
        return part.toLowerCase();
      }

      return normalizeMainKey(part);
    })
    .join('+');
};

/** 末段主键归一化后落在修饰键集合里（历史脏数据 'shift+Shift' 之类），视为非法绑定。 */
const hasModifierMainKey = (shortcut: string) => {
  const parts = shortcut.split('+').filter(Boolean);
  const mainKey = parts[parts.length - 1];

  return mainKey !== undefined && MODIFIER_KEYS.has(normalizeMainKey(mainKey).toLowerCase());
};

/** 归一化单条绑定；主键是修饰键时回落到默认值，避免脏绑定被原样存盘后吞键。 */
const normalizeBinding = (value: string | undefined, fallback: string) => {
  const normalized = normalizeShortcut(value ?? fallback);

  return hasModifierMainKey(normalized) ? normalizeShortcut(fallback) : normalized;
};

export const normalizeShortcutSettings = (
  value?: Partial<ShortcutSettings> | null,
): ShortcutSettings => ({
  increaseSpeed: normalizeBinding(value?.increaseSpeed, DEFAULT_SHORTCUTS.increaseSpeed),
  decreaseSpeed: normalizeBinding(value?.decreaseSpeed, DEFAULT_SHORTCUTS.decreaseSpeed),
  resetSpeed: normalizeBinding(value?.resetSpeed, DEFAULT_SHORTCUTS.resetSpeed),
  fullscreen: normalizeBinding(value?.fullscreen, DEFAULT_SHORTCUTS.fullscreen),
});

export const keyboardEventToShortcut = (event: KeyboardEvent) => {
  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push('ctrl');
  }
  if (event.altKey) {
    parts.push('alt');
  }
  if (event.shiftKey) {
    parts.push('shift');
  }
  if (event.metaKey) {
    parts.push('meta');
  }

  const key = normalizeMainKey(event.key);
  if (MODIFIER_KEYS.has(key.toLowerCase())) {
    return null;
  }

  parts.push(key);
  return parts.join('+');
};

export const formatShortcut = (value: string) =>
  normalizeShortcut(value)
    .split('+')
    .filter(Boolean)
    .map((part) => {
      if (part === ' ') {
        return 'Space';
      }
      if (part === 'ctrl') {
        return 'Ctrl';
      }
      if (part === 'alt') {
        return 'Alt';
      }
      if (part === 'shift') {
        return 'Shift';
      }
      if (part === 'meta') {
        return 'Meta';
      }
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join('+');

export const matchesShortcut = (event: KeyboardEvent, shortcut: string) => {
  const normalized = normalizeShortcut(shortcut);
  const parts = normalized.split('+').filter(Boolean);
  const expectedKey = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));

  return normalizeMainKey(event.key) === expectedKey
    && event.ctrlKey === modifiers.has('ctrl')
    && event.altKey === modifiers.has('alt')
    && event.shiftKey === modifiers.has('shift')
    && event.metaKey === modifiers.has('meta');
};

export const isBrowserReservedShortcut = (shortcut: string) => {
  const value = normalizeShortcut(shortcut).toLowerCase();
  const reservedShortcuts = new Set([
    'ctrl+t',
    'ctrl+n',
    'ctrl+w',
    'ctrl+f',
    'ctrl+s',
    'ctrl+p',
    'ctrl+r',
    'ctrl+l',
    'ctrl+k',
    'ctrl+j',
    'ctrl+h',
    'ctrl+d',
    'ctrl+0',
    'ctrl+1',
    'ctrl+2',
    'ctrl+3',
    'ctrl+4',
    'ctrl+5',
    'ctrl+6',
    'ctrl+7',
    'ctrl+8',
    'ctrl+9',
    'ctrl+shift+n',
    'ctrl+tab',
    'ctrl+shift+tab',
    'f1',
    'f5',
    'f11',
    'meta+t',
    'meta+n',
    'meta+w',
    'meta+f',
    'meta+s',
    'meta+p',
    'meta+r',
    'meta+l',
    'meta+k',
    'meta+j',
    'meta+h',
    'meta+d',
    'meta+0',
    'meta+1',
    'meta+2',
    'meta+3',
    'meta+4',
    'meta+5',
    'meta+6',
    'meta+7',
    'meta+8',
    'meta+9',
    'meta+shift+n',
  ]);

  return reservedShortcuts.has(value);
};
