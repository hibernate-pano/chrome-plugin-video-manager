/**
 * Pano Video - HUD (Heads-Up Display) 模块
 * 屏幕中央的状态反馈系统
 * @module modules/hud
 */

/**
 * HUD 图标类型映射
 */
const ICONS = {
    speed: '⚡',
    volumeUp: '🔊',
    volumeDown: '🔉',
    mute: '🔇',
    play: '▶️',
    pause: '⏸️',
    forward: '⏩',
    backward: '⏪',
    cinema: '🎬',
    reset: '🔄',
    success: '✓',
    warning: '⚠️',
};

/**
 * HUD Web Component (使用 Shadow DOM)
 */
class PanoHudElement extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.timeout = null;
        this.hideTimeout = null;
    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                /* Aurora Design System Variables - 直接嵌入 */
                :host {
                    /* 主题色 */
                    --pano-primary: #7F5AF0;
                    --pano-primary-rgb: 127, 90, 240;
                    --pano-secondary: #2CB67D;

                    /* 中性色 */
                    --pano-text-primary: #FFFFFE;
                    --pano-text-secondary: rgba(255, 255, 255, 0.7);
                    --pano-bg-dark: rgba(20, 20, 30, 0.85);
                    --pano-bg-glass: rgba(20, 20, 30, 0.65);

                    /* 玻璃态效果 */
                    --pano-blur: 12px;
                    --pano-blur-heavy: 20px;
                    --pano-border: rgba(255, 255, 255, 0.1);
                    --pano-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                    --pano-shadow-heavy: 0 16px 48px 0 rgba(0, 0, 0, 0.5);

                    /* 动画曲线 */
                    --pano-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
                    --pano-ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);

                    /* 间距 */
                    --pano-space-xs: 4px;
                    --pano-space-sm: 8px;
                    --pano-space-md: 16px;
                    --pano-space-lg: 24px;
                    --pano-space-xl: 32px;

                    /* 圆角 */
                    --pano-radius-lg: 16px;
                }

                /* 动画定义 */
                @keyframes pano-bounce-in {
                    0% {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.3);
                    }
                    50% {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(1.05);
                    }
                    70% {
                        transform: translate(-50%, -50%) scale(0.9);
                    }
                    100% {
                        transform: translate(-50%, -50%) scale(1);
                    }
                }

                @keyframes pano-fade-out {
                    from {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(1);
                    }
                    to {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.85);
                    }
                }

                @keyframes pano-pulse {
                    0%, 100% {
                        opacity: 1;
                    }
                    50% {
                        opacity: 0.7;
                    }
                }

                /* Host 定位 */
                :host {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 2147483647;
                    pointer-events: none;
                    opacity: 0;
                    visibility: hidden;
                }

                :host(.visible) {
                    opacity: 1;
                    visibility: visible;
                    animation: pano-bounce-in 0.4s var(--pano-ease-bounce);
                }

                :host(.hiding) {
                    animation: pano-fade-out 0.3s var(--pano-ease-in-out) forwards;
                }

                .hud-container {
                    /* 极光玻璃态容器 */
                    background: var(--pano-bg-glass);
                    backdrop-filter: blur(var(--pano-blur-heavy)) saturate(180%);
                    -webkit-backdrop-filter: blur(var(--pano-blur-heavy)) saturate(180%);
                    border: 1px solid var(--pano-border);
                    box-shadow: var(--pano-shadow-heavy);
                    border-radius: var(--pano-radius-lg);

                    /* 布局 */
                    padding: var(--pano-space-lg) var(--pano-space-xl);
                    min-width: 180px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--pano-space-sm);
                }

                .hud-icon {
                    font-size: 48px;
                    line-height: 1;
                    animation: pano-pulse 1.5s ease-in-out infinite;
                }

                .hud-text {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    font-size: 24px;
                    font-weight: 700;
                    color: var(--pano-text-primary);
                    letter-spacing: 0.5px;
                    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                }

                .hud-label {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    font-size: 12px;
                    font-weight: 500;
                    color: var(--pano-text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                /* 霓虹发光效果 */
                .hud-text.glow {
                    text-shadow:
                        0 0 10px rgba(var(--pano-primary-rgb), 0.5),
                        0 0 20px rgba(var(--pano-primary-rgb), 0.3),
                        0 2px 8px rgba(0, 0, 0, 0.3);
                }
            </style>

            <div class="hud-container">
                <div class="hud-icon"></div>
                <div class="hud-text"></div>
                <div class="hud-label"></div>
            </div>
        `;
    }

    /**
     * 显示 HUD
     * @param {Object} options - 配置项
     * @param {string} options.icon - 图标类型或文本
     * @param {string} options.text - 主文本
     * @param {string} options.label - 标签文本
     * @param {number} options.duration - 显示时长 (ms)
     * @param {boolean} options.glow - 是否启用霓虹发光
     */
    show({ icon = 'speed', text = '', label = '', duration = 1500, glow = false }) {
        // 清除之前的计时器
        clearTimeout(this.timeout);
        clearTimeout(this.hideTimeout);

        // 更新内容
        const iconElement = this.shadowRoot.querySelector('.hud-icon');
        const textElement = this.shadowRoot.querySelector('.hud-text');
        const labelElement = this.shadowRoot.querySelector('.hud-label');

        iconElement.textContent = ICONS[icon] || icon;
        textElement.textContent = text;
        labelElement.textContent = label;

        // 应用发光效果
        if (glow) {
            textElement.classList.add('glow');
        } else {
            textElement.classList.remove('glow');
        }

        // 显示 HUD
        this.classList.remove('hiding');
        this.classList.add('visible');

        // 自动隐藏
        this.timeout = setTimeout(() => {
            this.hide();
        }, duration);
    }

    /**
     * 隐藏 HUD
     */
    hide() {
        this.classList.remove('visible');
        this.classList.add('hiding');

        // 动画结束后完全隐藏
        this.hideTimeout = setTimeout(() => {
            this.classList.remove('hiding');
        }, 300);
    }
}

if (customElements && !customElements.get('pano-hud')) {
    customElements.define('pano-hud', PanoHudElement);
}

/**
 * HUD 管理类
 */
export class HUD {
    constructor() {
        this.hudElement = null;
    }

    /**
     * 初始化 HUD 元素
     */
    init() {
        if (!this.hudElement) {
            try {
                // 确保 customElements 和 document.body 存在
                if (!customElements || !document.body) {
                    return;
                }

                // 确保自定义元素已注册
                if (!customElements.get('pano-hud')) {
                    customElements.define('pano-hud', PanoHudElement);
                }

                this.hudElement = document.createElement('pano-hud');
                document.body.appendChild(this.hudElement);
            } catch (error) {
                console.error('[Pano HUD] 初始化失败:', error);
            }
        }
    }

    /**
     * 显示速度变化
     * @param {number} speed - 播放速度
     */
    showSpeed(speed) {
        this.init();
        if (!this.hudElement) return;
        this.hudElement.show({
            icon: 'speed',
            text: `${speed.toFixed(2)}x`,
            label: '播放速度',
            glow: true,
        });
    }

    /**
     * 显示音量变化
     * @param {number} volume - 音量值 (0-100)
     * @param {boolean} isMuted - 是否静音
     */
    showVolume(volume, isMuted = false) {
        this.init();
        if (!this.hudElement) return;
        const icon = isMuted ? 'mute' : volume > 50 ? 'volumeUp' : 'volumeDown';
        this.hudElement.show({
            icon,
            text: isMuted ? '静音' : `${Math.round(volume)}%`,
            label: '音量',
        });
    }

    /**
     * 显示快进/快退
     * @param {number} seconds - 秒数 (正数为快进，负数为快退)
     */
    showSeek(seconds) {
        this.init();
        if (!this.hudElement) return;
        const icon = seconds > 0 ? 'forward' : 'backward';
        this.hudElement.show({
            icon,
            text: `${Math.abs(seconds)}秒`,
            label: seconds > 0 ? '快进' : '快退',
        });
    }

    /**
     * 显示播放状态
     * @param {boolean} isPlaying - 是否正在播放
     */
    showPlayState(isPlaying) {
        this.init();
        if (!this.hudElement) return;
        this.hudElement.show({
            icon: isPlaying ? 'play' : 'pause',
            text: isPlaying ? '播放' : '暂停',
            label: '',
            duration: 800,
        });
    }

    /**
     * 显示影院模式状态
     * @param {boolean} isActive - 是否激活
     */
    showCinemaMode(isActive) {
        this.init();
        if (!this.hudElement) return;
        this.hudElement.show({
            icon: 'cinema',
            text: isActive ? '影院模式' : '退出影院',
            label: '',
            glow: isActive,
        });
    }

    /**
     * 显示重置提示
     */
    showReset() {
        this.init();
        if (!this.hudElement) return;
        this.hudElement.show({
            icon: 'reset',
            text: '1.00x',
            label: '已重置',
        });
    }

    /**
     * 显示自定义消息
     * @param {Object} options - 配置项
     */
    showMessage(options) {
        this.init();
        if (!this.hudElement) return;
        this.hudElement.show(options);
    }

    /**
     * 隐藏 HUD
     */
    hide() {
        if (this.hudElement) {
            this.hudElement.hide();
        }
    }

    /**
     * 销毁 HUD
     */
    destroy() {
        if (this.hudElement && this.hudElement.parentElement) {
            this.hudElement.parentElement.removeChild(this.hudElement);
        }
        this.hudElement = null;
    }
}
