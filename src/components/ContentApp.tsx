import { useEffect, useMemo, useRef, useState } from 'react';
import { activeMediaSession } from '../core/runtime';
import { KeyboardHandler } from '../core/keyboardHandler';
import { useMediaStore } from '../stores/mediaStore';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  ResumeRecord,
  clearResumePosition,
  getResumePositionForCurrentPage,
  saveResumePosition,
} from '../core/learningMemory';
import Lightbox from './Lightbox/Lightbox';
import HUD from './HUD/HUD';
import ResumePrompt from './HUD/ResumePrompt';

export default function ContentApp() {
  const {
    currentMedia,
    currentTime,
    duration,
    isInLightbox,
  } = useMediaStore((state) => ({
    currentMedia: state.currentMedia,
    currentTime: state.currentTime,
    duration: state.duration,
    isInLightbox: state.isInLightbox,
  }));
  const showHUD = useUIStore((state) => state.showHUD);
  const {
    shortcuts,
    hydrate,
    speedProfiles,
    activeProfileId,
    resumeEnabled,
    hasHydrated,
  } = useSettingsStore((state) => ({
    shortcuts: state.shortcuts,
    hydrate: state.hydrate,
    speedProfiles: state.speedProfiles,
    activeProfileId: state.activeProfileId,
    resumeEnabled: state.resumeEnabled,
    hasHydrated: state.hasHydrated,
  }));
  const handlerRef = useRef<KeyboardHandler | null>(null);
  const lastPromptedKeyRef = useRef<string | null>(null);
  const profileAppliedRef = useRef(new WeakMap<HTMLMediaElement, string>());
  const [resumePrompt, setResumePrompt] = useState<ResumeRecord | null>(null);

  const activeProfile = useMemo(
    () => speedProfiles.find((profile) => profile.id === activeProfileId) ?? speedProfiles[0],
    [activeProfileId, speedProfiles],
  );

  useEffect(() => {
    void hydrate();
    activeMediaSession.start((type, value) => showHUD(type, value));
    const handler = new KeyboardHandler(shortcuts);
    handlerRef.current = handler;
    handler.init();

    return () => {
      handler.destroy();
      handlerRef.current = null;
      activeMediaSession.stop();
    };
  }, [hydrate, showHUD]);

  useEffect(() => {
    handlerRef.current?.updateShortcuts(shortcuts);
  }, [shortcuts]);

  useEffect(() => {
    if (!currentMedia || !activeProfile || !hasHydrated) {
      return;
    }

    const appliedProfileId = profileAppliedRef.current.get(currentMedia);
    if (appliedProfileId === activeProfile.id) {
      return;
    }

    profileAppliedRef.current.set(currentMedia, activeProfile.id);
    activeMediaSession.setPlaybackRate(activeProfile.speed);
  }, [activeProfile, currentMedia, hasHydrated]);

  useEffect(() => {
    if (!resumeEnabled || !currentMedia || duration <= 0 || currentTime > 2) {
      return;
    }

    let cancelled = false;

    void getResumePositionForCurrentPage().then((record) => {
      if (cancelled || !record) {
        return;
      }

      if (record.pageKey === lastPromptedKeyRef.current) {
        return;
      }

      if (record.currentTime < 5 || record.currentTime >= record.duration - 15) {
        return;
      }

      lastPromptedKeyRef.current = record.pageKey;
      setResumePrompt(record);
    });

    return () => {
      cancelled = true;
    };
  }, [currentMedia, currentTime, duration, resumeEnabled]);

  useEffect(() => {
    if (!resumeEnabled || !currentMedia) {
      return;
    }

    const persist = () => void saveResumePosition(currentMedia);
    const onEnded = () => {
      setResumePrompt(null);
      void clearResumePosition();
    };

    const intervalId = window.setInterval(persist, 5000);
    window.addEventListener('pagehide', persist);
    currentMedia.addEventListener('ended', onEnded);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('pagehide', persist);
      currentMedia.removeEventListener('ended', onEnded);
      persist();
    };
  }, [currentMedia, resumeEnabled]);

  return (
    <>
      <HUD />
      {resumePrompt ? (
        <ResumePrompt
          currentTime={resumePrompt.currentTime}
          playbackRate={resumePrompt.playbackRate}
          onResume={() => {
            activeMediaSession.seekTo(resumePrompt.currentTime);
            activeMediaSession.setPlaybackRate(resumePrompt.playbackRate);
            setResumePrompt(null);
          }}
          onDismiss={() => setResumePrompt(null)}
        />
      ) : null}
      {isInLightbox ? <Lightbox /> : null}
    </>
  );
}
