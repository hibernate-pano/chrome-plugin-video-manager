/**
 * 网页全屏(Lightbox)模式模块
 * @module modules/lightbox
 */

/**
 * Lightbox全屏管理类
 */
export class LightboxManager {
  constructor() {
    this.active = false;
    this.originalParent = null;
    this.originalNextSibling = null;
    this.originalVideoStyles = {};
    this.controlsInterval = null;
    this.eventListeners = new Map();
  }

  /**
   * 检查是否处于全屏模式
   * @returns {boolean}
   */
  isActive() {
    return this.active;
  }

  /**
   * 确保控制栏在暂停时可见
   * @param {HTMLVideoElement} video - 视频元素
   */
  ensureControlsVisibleWhenPaused(video) {
    if (!video || !this.active) return;

    try {
      if (video.paused) {
        video.controls = true;

        const rect = video.getBoundingClientRect();
        const mouseEvent = new MouseEvent("mousemove", {
          clientX: rect.left + rect.width / 2,
          clientY: rect.bottom - 30,
          bubbles: true,
          cancelable: true,
        });
        video.dispatchEvent(mouseEvent);

        video.setAttribute("data-vsc-paused-controls", "true");
      } else {
        video.removeAttribute("data-vsc-paused-controls");
      }
    } catch (e) {
      console.error("确保控制栏可见失败:", e);
    }
  }

  /**
   * 设置全屏模式下的事件监听器
   * @param {HTMLVideoElement} video - 视频元素
   */
  setupEventListeners(video) {
    if (!video || this.eventListeners.has(video)) return;

    const pauseHandler = () => {
      this.ensureControlsVisibleWhenPaused(video);
    };

    const playHandler = () => {
      video.removeAttribute("data-vsc-paused-controls");
    };

    const seekingHandler = () => {
      this.ensureControlsVisibleWhenPaused(video);
    };

    video.addEventListener("pause", pauseHandler);
    video.addEventListener("play", playHandler);
    video.addEventListener("seeking", seekingHandler);

    this.eventListeners.set(video, {
      pause: pauseHandler,
      play: playHandler,
      seeking: seekingHandler,
    });

    this.ensureControlsVisibleWhenPaused(video);
  }

  /**
   * 清理全屏模式下的事件监听器
   * @param {HTMLVideoElement} video - 视频元素
   */
  cleanupEventListeners(video) {
    if (!video || !this.eventListeners.has(video)) return;

    const listeners = this.eventListeners.get(video);
    video.removeEventListener("pause", listeners.pause);
    video.removeEventListener("play", listeners.play);
    video.removeEventListener("seeking", listeners.seeking);

    this.eventListeners.delete(video);
    video.removeAttribute("data-vsc-paused-controls");
  }

  /**
   * 进入全屏模式
   * @param {HTMLVideoElement} media - 视频元素
   */
  enter(media) {
    if (!media || media.tagName !== "VIDEO") return;

    try {
      this.originalParent = media.parentElement;
      this.originalNextSibling = media.nextSibling;
      this.originalVideoStyles = {
        cssText: media.style.cssText,
        controls: media.controls,
      };

      const lightbox = document.createElement("div");
      lightbox.id = "vsc-lightbox-overlay";

      const handleVideoClick = (e) => {
        const isControlsClick = e.target !== media;
        media.dataset.controlsActive = isControlsClick ? "true" : "false";
      };

      media.classList.add("vsc-lightbox-video");
      media.controls = true;
      media.addEventListener("click", handleVideoClick);

      lightbox.videoClickHandler = handleVideoClick;
      lightbox.appendChild(media);
      document.body.appendChild(lightbox);
      document.body.classList.add("vsc-body-lock");
      this.active = true;

      this.setupEventListeners(media);

      this.controlsInterval = setInterval(() => {
        this.ensureControlsVisibleWhenPaused(media);
      }, 1000);
    } catch (e) {
      console.error("进入全屏模式失败:", e);
    }
  }

  /**
   * 退出全屏模式
   */
  exit() {
    const lightbox = document.getElementById("vsc-lightbox-overlay");
    if (!lightbox || !this.active) return;

    try {
      const video = lightbox.querySelector("video");
      if (video) {
        if (lightbox.videoClickHandler) {
          video.removeEventListener("click", lightbox.videoClickHandler);
        }

        this.cleanupEventListeners(video);
        if (this.controlsInterval) {
          clearInterval(this.controlsInterval);
          this.controlsInterval = null;
        }

        if (this.originalParent) {
          this.originalParent.insertBefore(video, this.originalNextSibling);
        } else {
          document.body.appendChild(video);
        }

        video.style.cssText = this.originalVideoStyles.cssText;
        video.controls = this.originalVideoStyles.controls;
        video.classList.remove("vsc-lightbox-video");
      }

      lightbox.remove();
      document.body.classList.remove("vsc-body-lock");
      this.active = false;
    } catch (e) {
      console.error("退出全屏模式失败:", e);
    }
  }

  /**
   * 切换全屏模式
   * @param {HTMLVideoElement} media - 视频元素
   */
  toggle(media) {
    if (this.active) {
      this.exit();
    } else {
      this.enter(media);
    }
  }

  /**
   * 获取全屏模式下的视频元素
   * @returns {HTMLVideoElement|null}
   */
  getVideo() {
    if (!this.active) return null;
    const lightbox = document.getElementById("vsc-lightbox-overlay");
    return lightbox ? lightbox.querySelector("video") : null;
  }
}
