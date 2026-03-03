import { create } from 'zustand';

type HUDType = 'speed' | 'volume' | 'seek' | 'mute' | null;

interface UIState {
  isFullscreen: boolean;
  showControls: boolean;
  hudVisible: boolean;
  hudType: HUDType;
  hudValue: number;

  setFullscreen: (fullscreen: boolean) => void;
  setShowControls: (show: boolean) => void;
  showHUD: (type: HUDType, value: number) => void;
  hideHUD: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isFullscreen: false,
  showControls: true,
  hudVisible: false,
  hudType: null,
  hudValue: 0,

  setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
  setShowControls: (show) => set({ showControls: show }),

  showHUD: (type, value) => {
    set({ hudVisible: true, hudType: type, hudValue: value });

    // 2秒后自动隐藏
    setTimeout(() => {
      set({ hudVisible: false, hudType: null });
    }, 2000);
  },

  hideHUD: () => set({ hudVisible: false, hudType: null }),
}));
