/**
 * 速度指示器模块
 * @module modules/indicator
 */

/**
 * 速度指示器管理类
 */
export class SpeedIndicator {
  constructor() {
    this.indicator = null;
    this.timeout = null;
    this.init();
  }

  /**
   * 初始化指示器元素
   */
  init() {
    this.indicator = document.createElement("div");
    this.indicator.id = "video-speed-indicator";
    document.body.appendChild(this.indicator);
  }

  /**
   * 显示速度指示器
   * @param {number|string} speed - 播放速度或提示文本
   * @param {HTMLMediaElement} mediaElement - 媒体元素
   */
  show(speed, mediaElement) {
    try {
      if (!this.indicator) {
        this.init();
      }

      const rect = mediaElement.getBoundingClientRect();
      // 使用fixed定位，相对于视口
      this.indicator.style.top = `${rect.top + 10}px`;
      this.indicator.style.left = `${rect.left + 10}px`;
      this.indicator.textContent =
        typeof speed === "string" ? speed : `${speed.toFixed(2)}x`;
      this.indicator.classList.add("visible");

      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.hide();
      }, 1500);
    } catch (e) {
      console.error("显示指示器失败:", e);
    }
  }

  /**
   * 隐藏指示器
   */
  hide() {
    if (this.indicator) {
      this.indicator.classList.remove("visible");
    }
  }

  /**
   * 销毁指示器
   */
  destroy() {
    clearTimeout(this.timeout);
    if (this.indicator && this.indicator.parentElement) {
      this.indicator.parentElement.removeChild(this.indicator);
    }
    this.indicator = null;
  }
}
