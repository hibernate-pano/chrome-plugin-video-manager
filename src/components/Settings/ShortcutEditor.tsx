import { useSettingsStore } from '../../stores/settingsStore';
import { ShortcutSettings } from '../../core/types';

interface Props {
  shortcuts: ShortcutSettings;
}

export default function ShortcutEditor({ shortcuts }: Props) {
  const { updateShortcut } = useSettingsStore();

  const labels: Record<keyof ShortcutSettings, string> = {
    increaseSpeed: '加速',
    decreaseSpeed: '减速',
    resetSpeed: '重置速度',
    playPause: '播放/暂停',
    fullscreen: '网页全屏',
    seekForward: '快进 10s',
    seekBackward: '快退 10s',
    volumeUp: '音量增加',
    volumeDown: '音量减少',
    muteToggle: '静音切换',
  };

  return (
    <div className="space-y-2">
      {(Object.keys(shortcuts) as Array<keyof ShortcutSettings>).map((key) => (
        <div key={key} className="flex items-center gap-4">
          <span className="w-32">{labels[key]}</span>
          <input
            type="text"
            value={shortcuts[key]}
            onChange={(e) => updateShortcut(key, e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded w-24 text-center font-mono"
          />
        </div>
      ))}
    </div>
  );
}
