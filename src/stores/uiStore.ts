import { create } from 'zustand';
import type { HUDType } from '../core/types';

interface UIState {
  hudVisible: boolean;
  hudType: HUDType;
  hudValue: number;
  hudTimeoutId: number | null;
  showHUD: (type: HUDType, value: number) => void;
  hideHUD: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  hudVisible: false,
  hudType: null,
  hudValue: 0,
  hudTimeoutId: null,
  showHUD: (type, value) => {
    const { hudTimeoutId } = get();
    if (hudTimeoutId) {
      clearTimeout(hudTimeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      set({ hudVisible: false, hudType: null, hudTimeoutId: null });
    }, 2000);

    set({
      hudVisible: true,
      hudType: type,
      hudValue: value,
      hudTimeoutId: timeoutId,
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
