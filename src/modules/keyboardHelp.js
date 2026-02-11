/**
 * 键盘快捷键帮助显示模块
 * @module modules/keyboardHelp
 */

/**
 * 键盘帮助组件 - 显示所有可用快捷键
 */
export class KeyboardHelp {
    constructor() {
        this.overlay = null;
        this.shadowRoot = null;
        this.isVisible = false;
        this.init();
    }

    /**
     * 初始化组件
     */
    init() {
        if (!this.overlay) {
            this.overlay = this.createOverlay();
            document.body.appendChild(this.overlay);
            this.setupEventListeners();
        }
    }

    /**
     * 创建覆盖层
     * @returns {HTMLElement} overlay element
     */
    createOverlay() {
        const container = document.createElement('div');
        container.id = 'vsc-keyboard-help';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2147483646;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease-in-out;
        `;

        const shadow = container.attachShadow({ mode: 'open' });
        this.shadowRoot = shadow;

        const panel = document.createElement('div');
        panel.style.cssText = `
            background: rgba(30, 30, 30, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 24px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            transform: scale(0.9);
            transition: transform 0.3s ease-out;
        `;

        const content = this.createContent();
        panel.appendChild(content);

        shadow.appendChild(panel);

        return container;
    }

    /**
     * 创建内容区域
     * @returns {HTMLElement} content element
     */
    createContent() {
        const content = document.createElement('div');

        const header = document.createElement('h2');
        header.textContent = '⌨️ 键盘快捷键';
        header.style.cssText = `
            color: #ffffff;
            margin: 0 0 20px 0;
            font-size: 24px;
            font-weight: 600;
            text-align: center;
        `;

        const sections = this.createShortcutSections();

        content.appendChild(header);
        sections.forEach((section) => content.appendChild(section));

        return content;
    }

    /**
     * 创建快捷键分组
     * @returns {Array<HTMLElement>} section elements
     */
    createShortcutSections() {
        const shortcuts = [
            {
                title: '🎮 播放控制',
                items: [
                    { key: 'Space', label: '播放 / 暂停' },
                    { key: 'f', label: '网页全屏模式' },
                ],
            },
            {
                title: '⚡ 速度控制',
                items: [
                    { key: '=', label: '加速 (+0.1x)' },
                    { key: '-', label: '减速 (-0.1x)' },
                    { key: '0', label: '重置速度 (1.0x)' },
                ],
            },
            {
                title: '🔊 音量控制',
                items: [
                    { key: ']', label: '音量增加' },
                    { key: '[', label: '音量降低' },
                ],
            },
            {
                title: '⏭️ 快速跳转',
                items: [
                    { key: '.', label: '前进 5 秒' },
                    { key: ',', label: '后退 5 秒' },
                ],
            },
            {
                title: '🎯 速度预设',
                items: [
                    { key: '7', label: '0.5x' },
                    { key: '8', label: '0.75x' },
                    { key: '9', label: '1.0x' },
                    { key: '4', label: '1.25x' },
                    { key: '5', label: '1.5x' },
                    { key: '6', label: '1.75x' },
                    { key: '0', label: '2.0x' },
                ],
            },
        ];

        return shortcuts.map((group) => this.createSection(group));
    }

    /**
     * 创建单个分组
     * @param {Object} group - group data
     * @returns {HTMLElement} section element
     */
    createSection(group) {
        const section = document.createElement('div');
        section.style.cssText = `
            margin-bottom: 24px;
        `;

        const title = document.createElement('h3');
        title.textContent = group.title;
        title.style.cssText = `
            color: #90caf9;
            margin: 0 0 12px 0;
            font-size: 16px;
            font-weight: 500;
            padding-bottom: 8px;
            border-bottom: 2px solid rgba(144, 202, 249, 0.3);
        `;

        const items = document.createElement('div');
        items.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 8px;
        `;

        group.items.forEach((item) => {
            const shortcutItem = this.createShortcutItem(item);
            items.appendChild(shortcutItem);
        });

        section.appendChild(title);
        section.appendChild(items);

        return section;
    }

    /**
     * 创建单个快捷键项
     * @param {Object} item - item data
     * @returns {HTMLElement} item element
     */
    createShortcutItem(item) {
        const itemEl = document.createElement('div');
        itemEl.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 0;
        `;

        const keyEl = document.createElement('kbd');
        keyEl.textContent = item.key;
        keyEl.style.cssText = `
            background: rgba(144, 202, 249, 0.2);
            border: 1px solid rgba(144, 202, 249, 0.5);
            color: #90caf9;
            padding: 4px 8px;
            border-radius: 4px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
        `;

        const labelEl = document.createElement('span');
        labelEl.textContent = item.label;
        labelEl.style.cssText = `
            color: #e0e0e0;
            font-size: 14px;
        `;

        itemEl.appendChild(keyEl);
        itemEl.appendChild(labelEl);

        return itemEl;
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (this.isVisible && e.key === 'Escape') {
                e.preventDefault();
                this.hide();
            }
        });
    }

    /**
     * 显示帮助面板
     */
    show() {
        if (!this.overlay) {
            this.init();
        }

        this.isVisible = true;
        this.overlay.style.pointerEvents = 'auto';
        this.overlay.style.opacity = '1';

        const panel = this.shadowRoot.querySelector('div > div');
        if (panel) {
            panel.style.transform = 'scale(1)';
        }
    }

    /**
     * 隐藏帮助面板
     */
    hide() {
        this.isVisible = false;
        this.overlay.style.pointerEvents = 'none';
        this.overlay.style.opacity = '0';

        const panel = this.shadowRoot.querySelector('div > div');
        if (panel) {
            panel.style.transform = 'scale(0.9)';
        }
    }

    /**
     * 切换显示状态
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * 清理资源
     */
    destroy() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
            this.overlay = null;
            this.shadowRoot = null;
        }
    }
}
