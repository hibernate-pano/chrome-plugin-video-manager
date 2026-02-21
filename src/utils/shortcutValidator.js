/**
 * Shortcut conflict detection utility
 */

export class ShortcutValidator {
  constructor() {
    this.reservedKeys = [
      'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+z', 'ctrl+y',
      'ctrl+a', 'ctrl+s', 'ctrl+w', 'ctrl+t', 'ctrl+n',
      'ctrl+tab', 'ctrl+shift+tab', 'ctrl+pageup', 'ctrl+pagedown',
      'alt+tab', 'alt+f4', 'cmd+q', 'cmd+w', 'cmd+n', 'cmd+t',
    ];
  }

  validateShortcuts(shortcuts) {
    const errors = [];
    const values = Object.values(shortcuts);
    const duplicates = values.filter((val, idx) => values.indexOf(val) !== idx);

    if (duplicates.length > 0) {
      errors.push({
        type: 'duplicate',
        message: 'Duplicate shortcuts detected',
        keys: duplicates,
      });
    }

    const emptyKeys = Object.entries(shortcuts).filter(([, val]) => !val || val.trim() === '');
    if (emptyKeys.length > 0) {
      errors.push({
        type: 'empty',
        message: 'Empty shortcut detected',
        keys: emptyKeys.map(([k]) => k),
      });
    }

    for (const [action, shortcut] of Object.entries(shortcuts)) {
      if (this.reservedKeys.includes(shortcut.toLowerCase())) {
        errors.push({
          type: 'reserved',
          message: `Shortcut conflicts with browser reserved key: ${shortcut}`,
          action,
          shortcut,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  isValidShortcut(shortcut) {
    return shortcut && !this.reservedKeys.includes(shortcut.toLowerCase());
  }
}
