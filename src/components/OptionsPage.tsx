import { useSettingsStore } from '../stores/settingsStore';
import ShortcutEditor from './Settings/ShortcutEditor';

export default function OptionsPage() {
  const { shortcuts, resetShortcuts, presets, addPreset, removePreset } = useSettingsStore();

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8 font-['Orbitron'] text-[#00f3ff]">
        Video Speed Controller
      </h1>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">快捷键设置</h2>
        <ShortcutEditor shortcuts={shortcuts} />
        <button
          onClick={resetShortcuts}
          className="mt-4 px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
        >
          重置为默认
        </button>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">速度预设</h2>
        <div className="flex gap-2 flex-wrap">
          {presets.map((speed) => (
            <button
              key={speed}
              onClick={() => removePreset(speed)}
              className="px-4 py-2 bg-[#00f3ff]/20 border border-[#00f3ff] rounded hover:bg-[#00f3ff]/40"
            >
              {speed}x
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          {[0.25, 0.5, 3, 4].map((speed) => (
            <button
              key={speed}
              onClick={() => addPreset(speed)}
              className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
            >
              + {speed}x
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
