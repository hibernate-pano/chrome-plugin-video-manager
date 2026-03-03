import { create } from 'zustand';

interface MediaState {
  currentMedia: HTMLMediaElement | null;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;

  setCurrentMedia: (media: HTMLMediaElement | null) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  currentMedia: null,
  playbackRate: 1.0,
  volume: 1.0,
  isMuted: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,

  setCurrentMedia: (media) => set({ currentMedia: media }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  setVolume: (volume) => set({ volume }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
}));
