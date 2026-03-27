import { loadSettings, subscribeToSettings } from '../shared/settings';
import { PersistedSettings } from '../shared/types';
import { FullscreenController } from './fullscreenController';
import { KeyboardController } from './keyboardController';
import { installRuntimeStyles } from './runtimeStyles';
import { SpeedHud } from './speedHud';
import { VideoRegistry } from './videoRegistry';

export class ContentRuntime {
  private readonly registry = new VideoRegistry();
  private readonly fullscreenController = new FullscreenController();
  private readonly speedHud = new SpeedHud();
  private readonly keyboardController = new KeyboardController({
    getShortcuts: () => this.settings.shortcuts,
    getCurrentVideo: () => this.fullscreenController.getActiveVideo() ?? this.registry.getCurrentVideo(),
    isFullscreenActive: () => this.fullscreenController.isActive(),
    toggleFullscreen: (video) => {
      const next = this.fullscreenController.toggle(video);
      this.registry.setFullscreenVideo(this.fullscreenController.getActiveVideo());
      return next;
    },
    exitFullscreen: () => {
      this.fullscreenController.exit();
      this.registry.setFullscreenVideo(null);
    },
    showSpeedHud: (rate, video) => this.speedHud.show(rate, video),
  });
  private settings: PersistedSettings = {
    shortcuts: {
      increaseSpeed: '=',
      decreaseSpeed: '-',
      resetSpeed: '0',
      fullscreen: 'f',
    },
  };
  private unsubscribeSettings: (() => void) | null = null;

  async start() {
    installRuntimeStyles();
    this.settings = await loadSettings();
    this.unsubscribeSettings = subscribeToSettings((settings) => {
      this.settings = settings;
    });
    this.registry.start();
    this.keyboardController.start();
  }

  stop() {
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    this.keyboardController.stop();
    this.fullscreenController.destroy();
    this.registry.stop();
    this.speedHud.destroy();
  }
}
