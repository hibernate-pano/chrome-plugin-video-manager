import { create } from 'zustand';
import {
  DEFAULT_SHORTCUTS,
  DEFAULT_SPEED_PROFILES,
  ShortcutSettings,
  SpeedProfile,
} from '../core/types';
import { extensionStorage } from '../utils/extensionStorage';

const STORAGE_KEY = 'vsc-settings';

const normalizeShortcut = (value: string) =>
  value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index, parts) => {
      if (index < parts.length - 1) {
        return part.toLowerCase();
      }

      return part === 'Space' ? ' ' : part;
    })
    .join('+');

const normalizePreset = (speed: number) => Number(speed.toFixed(2));

interface PersistedSettings {
  shortcuts: ShortcutSettings;
  presets: number[];
  activeProfileId: string;
  resumeEnabled: boolean;
}

interface SettingsState extends PersistedSettings {
  speedProfiles: SpeedProfile[];
  hasHydrated: boolean;
  hydrate: () => Promise<void>;
  updateShortcut: (key: keyof ShortcutSettings, value: string) => void;
  resetShortcuts: () => void;
  setPresets: (presets: number[]) => void;
  addPreset: (speed: number) => void;
  removePreset: (speed: number) => void;
  setActiveProfile: (profileId: string) => void;
  setResumeEnabled: (enabled: boolean) => void;
}

const defaultState: PersistedSettings = {
  shortcuts: DEFAULT_SHORTCUTS,
  presets: [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0],
  activeProfileId: DEFAULT_SPEED_PROFILES[0].id,
  resumeEnabled: true,
};

const normalizeState = (value?: Partial<PersistedSettings>): PersistedSettings => ({
  shortcuts: {
    ...DEFAULT_SHORTCUTS,
    ...(value?.shortcuts ?? {}),
  },
  presets: [...new Set((value?.presets ?? defaultState.presets).map(normalizePreset))].sort((a, b) => a - b),
  activeProfileId: value?.activeProfileId ?? defaultState.activeProfileId,
  resumeEnabled: value?.resumeEnabled ?? defaultState.resumeEnabled,
});

let unsubscribeStorageListener: (() => void) | undefined;

const persistState = async (state: PersistedSettings) => {
  await extensionStorage.set('sync', STORAGE_KEY, state);
};

const bindStorageListener = () => {
  if (unsubscribeStorageListener) {
    return;
  }

  unsubscribeStorageListener = extensionStorage.subscribe('sync', STORAGE_KEY, (nextValue) => {
    const nextState = normalizeState((nextValue as Partial<PersistedSettings> | undefined) ?? defaultState);
    useSettingsStore.setState(nextState);
  });
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...defaultState,
  speedProfiles: DEFAULT_SPEED_PROFILES,
  hasHydrated: false,

  hydrate: async () => {
    bindStorageListener();
    const stored = await extensionStorage.get<Partial<PersistedSettings>>('sync', STORAGE_KEY, defaultState);
    set({
      ...normalizeState(stored),
      hasHydrated: true,
    });
  },

  updateShortcut: (key, value) => {
    set((state) => {
      const nextState = {
        ...state,
        shortcuts: { ...state.shortcuts, [key]: normalizeShortcut(value) },
      };
      void persistState(normalizeState(nextState));
      return nextState;
    });
  },

  resetShortcuts: () => {
    set((state) => {
      const nextState = {
        ...state,
        shortcuts: DEFAULT_SHORTCUTS,
      };
      void persistState(normalizeState(nextState));
      return nextState;
    });
  },

  setPresets: (presets) => {
    set((state) => {
      const nextState = {
        ...state,
        presets: [...new Set(presets.map(normalizePreset))].sort((a, b) => a - b),
      };
      void persistState(normalizeState(nextState));
      return nextState;
    });
  },

  addPreset: (speed) => {
    set((state) => {
      const nextState = {
        ...state,
        presets: [...new Set([...state.presets, normalizePreset(speed)])].sort((a, b) => a - b),
      };
      void persistState(normalizeState(nextState));
      return nextState;
    });
  },

  removePreset: (speed) => {
    set((state) => {
      const nextState = {
        ...state,
        presets: state.presets.filter((preset) => preset !== normalizePreset(speed)),
      };
      void persistState(normalizeState(nextState));
      return nextState;
    });
  },

  setActiveProfile: (profileId) => {
    set((state) => {
      const nextState = {
        ...state,
        activeProfileId: profileId,
      };
      void persistState(normalizeState(nextState));
      return nextState;
    });
  },

  setResumeEnabled: (enabled) => {
    set((state) => {
      const nextState = {
        ...state,
        resumeEnabled: enabled,
      };
      void persistState(normalizeState(nextState));
      return nextState;
    });
  },
}));
