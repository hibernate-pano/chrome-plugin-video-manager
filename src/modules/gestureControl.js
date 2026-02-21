/**
 * Gesture Control - 手势控制
 * 支持滑动调节音量和速度
 */

class GestureController {
  constructor(media, indicator) {
    this.media = media;
    this.indicator = indicator;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.minSwipeDistance = 50;
    this.maxSwipeTime = 500;
  }

  /**
   * 初始化手势监听
   */
  init(element) {
    element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    element.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
  }

  handleTouchStart(e) {
    if (e.touches.length === 1) {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.touchStartTime = Date.now();
    }
  }

  handleTouchEnd(e) {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - this.touchStartX;
    const deltaY = touchEndY - this.touchStartY;
    const deltaTime = Date.now() - this.touchStartTime;

    // 检查是否为有效滑动
    if (Math.abs(deltaX) < this.minSwipeDistance && Math.abs(deltaY) < this.minSwipeDistance) {
      return; // 点击而非滑动
    }

    if (deltaTime > this.maxSwipeTime) {
      return; // 滑动太慢
    }

    // 水平滑动 - 调整速度
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 0) {
        // 向右滑 - 加速
        this.media.playbackRate = Math.min(3.0, this.media.playbackRate + 0.25);
        this.indicator?.show(`速度: ${this.media.playbackRate.toFixed(2)}x`);
      } else {
        // 向左滑 - 减速
        this.media.playbackRate = Math.max(0.25, this.media.playbackRate - 0.25);
        this.indicator?.show(`速度: ${this.media.playbackRate.toFixed(2)}x`);
      }
    }
    // 垂直滑动 - 调整音量
    else {
      if (deltaY < 0) {
        // 向下滑 - 增大音量
        this.media.volume = Math.min(1.0, this.media.volume + 0.1);
        this.indicator?.show(`音量: ${Math.round(this.media.volume * 100)}%`);
      } else {
        // 向上滑 - 减小音量
        this.media.volume = Math.max(0, this.media.volume - 0.1);
        this.indicator?.show(`音量: ${Math.round(this.media.volume * 100)}%`);
      }
    }
  }
}

export { GestureController };
