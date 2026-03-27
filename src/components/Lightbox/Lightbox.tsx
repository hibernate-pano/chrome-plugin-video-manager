import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { lightboxManager } from '../../core/runtime';
import Controls from './Controls';

export default function Lightbox() {
  const controlsRoot = lightboxManager.getOverlayRoot();
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    const overlay = document.getElementById('vsc-lightbox-overlay');
    if (!overlay) {
      return undefined;
    }

    let hideTimer = window.setTimeout(() => setShowControls(false), 2400);

    const resetVisibility = () => {
      setShowControls(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setShowControls(false), 2400);
    };

    const keepVisibleOnPause = () => {
      const media = lightboxManager.getMedia();
      if (media?.paused) {
        setShowControls(true);
      }
    };

    overlay.addEventListener('mousemove', resetVisibility);
    document.addEventListener('keydown', resetVisibility, true);
    const media = lightboxManager.getMedia();
    media?.addEventListener('pause', keepVisibleOnPause);

    return () => {
      window.clearTimeout(hideTimer);
      overlay.removeEventListener('mousemove', resetVisibility);
      document.removeEventListener('keydown', resetVisibility, true);
      media?.removeEventListener('pause', keepVisibleOnPause);
    };
  }, [controlsRoot]);

  const content = useMemo(() => (
    <AnimatePresence>
      {showControls ? <Controls /> : null}
    </AnimatePresence>
  ), [showControls]);

  return controlsRoot ? createPortal(content, controlsRoot) : null;
}
