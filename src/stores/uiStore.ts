import { create } from 'zustand';

type HUDType = 'speed' | 'volume' | 'seek' | 'mute' | null;

interface UIState {
  isFullscreen: boolean;
  showControls: boolean;
  hudVisible: boolean;
  hudType: HUDType;
  hudValue: number;
  hudTimeoutId: number | null;

  setFullscreen: (fullscreen: boolean) => void;
  setShowControls: (show: boolean) => void;
  showHUD: (type: HUDType, value: number) => void;
  hideHUD: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  isFullscreen: false,
  showControls: true,
  hudVisible: false,
  hudType: null,
  hudValue: 0,
  hudTimeoutId: null,

  setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
  setShowControls: (show) => set({ showControls: show }),

  showHUD: (type, value) => {
    const { hudTimeoutId } = get();

    // 清除之前的 timeout
    if (hudTimeoutId) {
      clearTimeout(hudTimeoutId);
    }

    // 设置新的 timeout
    const timeoutId = window.setTimeout(() => {
      set({ hudVisible: false, hudType: null, hudTimeoutId: null });
    }, 2000);

    set({
      hudVisible: true,
      hudType: type,
      hudValue: value,
      hudTimeoutId: timeoutId
    });
  },

  hideHUD: () => {
    const { hudTimeoutId } = get();
    if (hudTimeoutId) {
      clearTimeout(hudTimeoutId);
    }
    set({ hudVisible: false, hudType: null, hudTimeoutId: null });
  },
}));
