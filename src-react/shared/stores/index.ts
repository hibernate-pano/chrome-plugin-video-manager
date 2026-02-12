/**
 * Zustand Stores 统一导出
 * @module shared/stores
 */

// Media Store
export {
    useMediaStore,
    useCurrentMedia,
    usePlaybackRate,
    useVolume,
    useIsPaused,
    useIsFullscreen,
    useMediaActions,
} from './mediaStore';

// HUD Store
export {
    useHUDStore,
    useHUDVisible,
    useHUDType,
    useHUDValue,
    useHUDConfig,
    useHUDActions,
    useHUDState,
    useShowSpeed,
    useShowVolume,
    useShowSeek,
    useShowReset,
} from './hudStore';

// Settings Store
export {
    useSettingsStore,
    useShortcuts,
    useShortcut,
    usePresets,
    usePreset,
    useAnimationSpeed,
    useHUDConfigFromSettings,
    useLanguage,
    useVersion,
    useShortcutActions,
    usePresetActions,
    useSettingsActions,
} from './settingsStore';
