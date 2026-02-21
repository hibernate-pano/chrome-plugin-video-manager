/**
 * Batch Video Control - 批量视频控制
 * 同时控制页面上的多个视频
 */

export class BatchVideoController {
  constructor(mediaDetector) {
    this.mediaDetector = mediaDetector;
  }

  /**
   * 获取所有视频
   */
  getAllMedia() {
    const videos = document.querySelectorAll('video');
    return Array.from(videos);
  }

  /**
   * 设置所有视频的速度
   */
  setAllSpeed(speed) {
    const videos = this.getAllMedia();
    videos.forEach(video => {
      video.playbackRate = speed;
    });
    return videos.length;
  }

  /**
   * 暂停所有视频
   */
  pauseAll() {
    const videos = this.getAllMedia();
    videos.forEach(video => video.pause());
    return videos.length;
  }

  /**
   * 播放所有视频
   */
  playAll() {
    const videos = this.getAllMedia();
    let count = 0;
    videos.forEach(video => {
      video.play().then(() => count++).catch(() => {});
    });
    return count;
  }
}

/**
 * 创建批量控制器实例
 */
export function createBatchController(mediaDetector) {
  return new BatchVideoController(mediaDetector);
}
