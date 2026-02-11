/**
 * 播放控制模块
 * @module modules/playbackController
 */

/**
 * 播放控制器类
 */
export class PlaybackController {
    constructor(hud) {
        this.hud = hud;
    }

    /**
     * 处理播放速度控制
     * @param {HTMLMediaElement} media - 媒体元素
     * @param {string} action - 动作类型 (increase/decrease/reset)
     */
    handleSpeed(media, action) {
        try {
            let newSpeed;
            const currentRate =
                typeof media.playbackRate === 'number' && isFinite(media.playbackRate)
                    ? media.playbackRate
                    : 1.0;

            switch (action) {
            case 'increase':
                newSpeed = Math.min(currentRate + 0.1, 16);
                break;
            case 'decrease':
                newSpeed = Math.max(currentRate - 0.1, 0.1);
                break;
            case 'reset':
                newSpeed = 1.0;
                break;
            default:
                return;
            }

            if (typeof newSpeed === 'number' && isFinite(newSpeed) && newSpeed > 0) {
                media.playbackRate = newSpeed;
                // 使用新的 HUD API
                if (action === 'reset') {
                    this.hud.showReset();
                } else {
                    this.hud.showSpeed(newSpeed);
                }
            } else {
                console.warn('计算出的播放速度无效:', newSpeed, '使用默认速度1.0');
                media.playbackRate = 1.0;
                this.hud.showSpeed(1.0);
            }
        } catch (e) {
            console.error('处理播放速度失败:', e);
        }
    }

    /**
     * 处理视频快进快退
     * @param {HTMLVideoElement} video - 视频元素
     * @param {string} direction - 方向 (forward/backward)
     * @param {number} step - 步长（秒）
     */
    handleSeek(video, direction, step = 5) {
        try {
            if (direction === 'forward') {
                video.currentTime = Math.min(video.duration, video.currentTime + step);
                this.hud.showSeek(step);
            } else if (direction === 'backward') {
                video.currentTime = Math.max(0, video.currentTime - step);
                this.hud.showSeek(-step);
            }
        } catch (e) {
            console.error('处理快进快退失败:', e);
        }
    }

    /**
     * 处理音量控制
     * @param {HTMLMediaElement} media - 媒体元素
     * @param {string} direction - 方向 (up/down)
     * @param {number} step - 步长（0-1之间）
     */
    handleVolume(media, direction, step = 0.1) {
        try {
            if (direction === 'up') {
                media.volume = Math.min(1, media.volume + step);
            } else if (direction === 'down') {
                media.volume = Math.max(0, media.volume - step);
            }

            const volumePercent = Math.round(media.volume * 100);
            this.hud.showVolume(volumePercent, media.muted);
        } catch (e) {
            console.error('处理音量控制失败:', e);
        }
    }

    /**
     * 处理播放/暂停
     * @param {HTMLMediaElement} media - 媒体元素
     */
    async handlePlayPause(media) {
        try {
            if (media.paused) {
                const playPromise = media.play();
                if (playPromise !== undefined) {
                    await playPromise.catch((error) => {
                        console.error('播放失败:', error);
                    });
                }
            } else {
                media.pause();
            }
        } catch (e) {
            console.error('处理播放/暂停失败:', e);
        }
    }
}
