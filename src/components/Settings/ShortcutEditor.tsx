import { useState } from 'react';
import { SHORTCUT_DEFINITIONS, ShortcutSettings } from '../../core/types';
import { useSettingsStore } from '../../stores/settingsStore';

interface Props {
  shortcuts: ShortcutSettings;
}

const formatShortcut = (shortcut: string) => shortcut === ' ' ? 'Space' : shortcut;
const formatShortcutLabel = (shortcut: string) =>
  shortcut
    .split('+')
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

const toShortcutString = (event: React.KeyboardEvent<HTMLInputElement>) => {
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
  parts.push(event.key);
  return parts.join('+');
};

export default function ShortcutEditor({ shortcuts }: Props) {
  const { updateShortcut } = useSettingsStore();
  const [recording, setRecording] = useState<keyof ShortcutSettings | null>(null);

  return (
    <div className="space-y-3">
      {SHORTCUT_DEFINITIONS.map((definition) => (
        <div key={definition.id} className="flex items-center justify-between gap-4 rounded-xl border border-cyan-400/20 bg-slate-950/50 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-white">{definition.displayLabel}</div>
            <div className="text-xs text-slate-400">{definition.category}</div>
          </div>
          <input
            type="text"
            readOnly
            value={recording === definition.id ? '按下新的快捷键' : formatShortcutLabel(formatShortcut(shortcuts[definition.id]))}
            onFocus={() => setRecording(definition.id)}
            onBlur={() => setRecording((current) => current === definition.id ? null : current)}
            onKeyDown={(event) => {
              event.preventDefault();
              const nextShortcut = toShortcutString(event);
              updateShortcut(definition.id, nextShortcut);
              setRecording(null);
              event.currentTarget.blur();
            }}
            className="w-40 rounded-lg border border-cyan-400/30 bg-slate-900 px-3 py-2 text-center font-mono text-sm text-cyan-100 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30"
          />
        </div>
      ))}
    </div>
  );
}
