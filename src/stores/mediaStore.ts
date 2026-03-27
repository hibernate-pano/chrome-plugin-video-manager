import { create } from 'zustand';
import type { ActiveMediaSessionState } from '../core/types';

interface MediaState {
  currentMedia: HTMLMediaElement | null;
  mediaKind: ActiveMediaSessionState['mediaKind'];
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isInLightbox: boolean;
  canFullscreen: boolean;
  setCurrentMedia: (media: HTMLMediaElement | null) => void;
  setSessionState: (state: ActiveMediaSessionState) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  currentMedia: null,
  mediaKind: null,
  playbackRate: 1,
  volume: 1,
  isMuted: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  isInLightbox: false,
  canFullscreen: false,
  setCurrentMedia: (media) => set({ currentMedia: media }),
  setSessionState: (state) => set({
    mediaKind: state.mediaKind,
    playbackRate: state.playbackRate,
    volume: state.volume,
    isMuted: state.muted,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    duration: state.duration,
    isInLightbox: state.isInLightbox,
    canFullscreen: state.canFullscreen,
  }),
}));
