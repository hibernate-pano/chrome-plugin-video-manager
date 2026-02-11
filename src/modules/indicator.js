/**
 * 速度指示器模块
 * @module modules/indicator
 */

/**
 * 速度指示器 Web Component（使用 Shadow DOM 隔离样式）
 */
class SpeedIndicatorElement extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.timeout = null;
    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    position: fixed;
                    background: rgba(0, 0, 0, 0.85);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 12px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    font-size: 18px;
                    font-weight: bold;
                    z-index: 2147483647;
                    pointer-events: none;
                    opacity: 0;
                    transform: scale(0.9);
                    transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                                transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    backdrop-filter: blur(8px);
                }

                :host.visible {
                    opacity: 1;
                    transform: scale(1);
                }

                .speed-value {
                    display: inline-block;
                }
            </style>
            <span class="speed-value"></span>
        `;
    }

    show(speed) {
        const speedElement = this.shadowRoot.querySelector('.speed-value');
        speedElement.textContent =
            typeof speed === 'string' ? speed : `${speed.toFixed(2)}x`;

        this.classList.add('visible');

        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            this.classList.remove('visible');
        }, 1500);
    }

    hide() {
        this.classList.remove('visible');
    }
}

if (customElements && !customElements.get('vsc-speed-indicator')) {
    customElements.define('vsc-speed-indicator', SpeedIndicatorElement);
}

/**
 * 速度指示器管理类
 */
export class SpeedIndicator {
    constructor() {
        this.indicator = null;
    }

    /**
   * 初始化指示器元素
   */
    init() {
        if (!customElements || !document.body) return;
        if (!customElements.get('vsc-speed-indicator')) {
            customElements.define('vsc-speed-indicator', SpeedIndicatorElement);
        }
        this.indicator = document.createElement('vsc-speed-indicator');
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
            this.indicator.style.top = `${rect.top + 10}px`;
            this.indicator.style.left = `${rect.left + 10}px`;

            requestAnimationFrame(() => {
                this.indicator.show(speed);
            });
        } catch (e) {
            console.error('显示指示器失败:', e);
        }
    }

    /**
   * 隐藏指示器
   */
    hide() {
        if (this.indicator) {
            this.indicator.hide();
        }
    }

    /**
   * 销毁指示器
   */
    destroy() {
        if (this.indicator && this.indicator.parentElement) {
            this.indicator.parentElement.removeChild(this.indicator);
        }
        this.indicator = null;
    }
}
