import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ShortcutSettings, DEFAULT_SHORTCUTS } from '../core/types';

interface SettingsState {
  shortcuts: ShortcutSettings;
  presets: number[];

  updateShortcut: (key: keyof ShortcutSettings, value: string) => void;
  resetShortcuts: () => void;
  setPresets: (presets: number[]) => void;
  addPreset: (speed: number) => void;
  removePreset: (speed: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      shortcuts: DEFAULT_SHORTCUTS,
      presets: [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0],

      updateShortcut: (key, value) =>
        set((state) => ({
          shortcuts: { ...state.shortcuts, [key]: value },
        })),

      resetShortcuts: () => set({ shortcuts: DEFAULT_SHORTCUTS }),

      setPresets: (presets) => set({ presets }),

      addPreset: (speed) =>
        set((state) => ({
          presets: [...new Set([...state.presets, speed])].sort((a, b) => a - b),
        })),

      removePreset: (speed) =>
        set((state) => ({
          presets: state.presets.filter((p) => p !== speed),
        })),
    }),
    {
      name: 'vsc-settings',
    }
  )
);
