const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * 媒体速率绝对下限与上限（播放器能接受的安全范围）。
 *
 * ⚠️ 导出给键盘控制器用：长按加速的兜底要判断「已经到边界了没有」
 * —— 到边界就自动停，别让 120ms 的定时器一直空转。
 * 两边必须用同一组常量，否则「以为到顶了」和「真的到顶了」会对不上。
 */
export const MIN_PLAYBACK_RATE = 0.1;
export const MAX_PLAYBACK_RATE = 16;

export const stepPlaybackRate = (video: HTMLVideoElement, delta: number) => {
  const nextRate = clamp(video.playbackRate + delta, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
  video.playbackRate = Number(nextRate.toFixed(2));
  return video.playbackRate;
};

export const resetPlaybackRate = (video: HTMLVideoElement) => {
  video.playbackRate = 1;
  return video.playbackRate;
};

export const togglePlayback = (video: HTMLVideoElement) => {
  if (video.paused) {
    void video.play().catch(() => {
      // Best effort.
    });
    return true;
  }

  video.pause();
  return false;
};

/**
 * 「能 seek 到哪一段」。
 *
 * - 时长已知（普通点播）→ [0, 时长]。
 * - 时长**不是有限数**（直播：Infinity；MSE 直播：NaN）→ **seekable 区间**。
 * - 连 seekable 都没有 → 不设限（见下面那条注释）。
 *
 * ⚠️ 为什么不能拿 Infinity 一把梭（原来的写法）：
 * 直播流的 duration 是 Infinity，用它兜底等于「没有上限」，
 * `currentTime + 5` 会越过 DVR 窗口的末尾 —— 浏览器把它夹到 live edge，
 * 表现为「按了 → 视频突然跳到直播最新画面」，看起来完全不像「快进 5 秒」。
 */
const seekBounds = (
  video: HTMLVideoElement,
): { min: number; max: number } => {
  if (Number.isFinite(video.duration)) {
    return { min: 0, max: video.duration };
  }

  if (video.seekable.length > 0) {
    return {
      min: video.seekable.start(0),
      max: video.seekable.end(video.seekable.length - 1),
    };
  }

  // 没有时长也没有可 seek 区间：判据（isUnseekableLiveStream）通常已经
  // 把这个键放行了；真走到这里（元数据还没到，duration 是 NaN），
  // 上界只能「不设限」—— 到底能不能 seek 由浏览器说了算，
  // 键盘控制器那边还有一道「位置到底动了没有」的探测兜着。
  return { min: 0, max: Number.POSITIVE_INFINITY };
};

export const seekBy = (video: HTMLVideoElement, seconds: number) => {
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const { min, max } = seekBounds(video);
  const nextTime = clamp(currentTime + seconds, min, max);

  video.currentTime = Number(nextTime.toFixed(2));
  return video.currentTime;
};
