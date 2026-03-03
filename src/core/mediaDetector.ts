export class MediaDetector {
  getAllMediaElements(): HTMLMediaElement[] {
    const videos = Array.from(document.querySelectorAll('video'));
    const audios = Array.from(document.querySelectorAll('audio'));
    return [...videos, ...audios];
  }

  getCurrentMedia(): HTMLMediaElement | null {
    const allMedia = this.getAllMediaElements();
    if (allMedia.length === 0) return null;

    // 优先返回正在全屏的视频
    const fullscreenVideo = allMedia.find(m =>
      m.closest('#vsc-lightbox-overlay')
    );
    if (fullscreenVideo) return fullscreenVideo;

    // 返回第一个可见的视频
    return allMedia.find(m => {
      const rect = m.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || allMedia[0];
  }
}

export const mediaDetector = new MediaDetector();
