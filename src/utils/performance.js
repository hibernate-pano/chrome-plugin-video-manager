/**
 * 性能监控模块
 * @module utils/performance
 */

/**
 * 性能指标常量
 */
export const PERFORMANCE_METRICS = {
    MEDIA_DETECTION_TIME: 'mediaDetectionTime',
    KEYBOARD_RESPONSE_TIME: 'keyboardResponseTime',
    INDICATOR_SHOW_TIME: 'indicatorShowTime',
    CACHE_HIT_COUNT: 'cacheHitCount',
    CACHE_MISS_COUNT: 'cacheMissCount',
    ERROR_COUNT: 'errorCount',
    WARNING_COUNT: 'warningCount',
    LOG_COUNT: 'logCount',
};

/**
 * 性能指标收集器
 */
export class PerformanceMonitor {
    constructor() {
        this.metrics = {
            [PERFORMANCE_METRICS.MEDIA_DETECTION_TIME]: [],
            [PERFORMANCE_METRICS.KEYBOARD_RESPONSE_TIME]: [],
            [PERFORMANCE_METRICS.INDICATOR_SHOW_TIME]: [],
            [PERFORMANCE_METRICS.CACHE_HIT_COUNT]: 0,
            [PERFORMANCE_METRICS.CACHE_MISS_COUNT]: 0,
            [PERFORMANCE_METRICS.ERROR_COUNT]: 0,
            [PERFORMANCE_METRICS.WARNING_COUNT]: 0,
            [PERFORMANCE_METRICS.LOG_COUNT]: 0,
        };
        this.startTime = Date.now();
        this.logQueue = [];
    }

    /**
     * 记录媒体检测耗时
     * @param {number} duration - 检测耗时（毫秒）
     */
    recordMediaDetectionTime(duration) {
        this.metrics[PERFORMANCE_METRICS.MEDIA_DETECTION_TIME].push(duration);
    }

    /**
     * 记录键盘事件响应时间
     * @param {number} duration - 响应时间（毫秒）
     */
    recordKeyboardResponseTime(duration) {
        this.metrics[PERFORMANCE_METRICS.KEYBOARD_RESPONSE_TIME].push(duration);
    }

    /**
     * 记录指示器显示时间
     * @param {number} duration - 显示时间（毫秒）
     */
    recordIndicatorShowTime(duration) {
        this.metrics[PERFORMANCE_METRICS.INDICATOR_SHOW_TIME].push(duration);
    }

    /**
     * 记录缓存命中次数
     */
    incrementCacheHit() {
        this.metrics[PERFORMANCE_METRICS.CACHE_HIT_COUNT]++;
    }

    /**
     * 记录缓存未命中次数
     */
    incrementCacheMiss() {
        this.metrics[PERFORMANCE_METRICS.CACHE_MISS_COUNT]++;
    }

    /**
     * 记录错误次数
     */
    incrementError() {
        this.metrics[PERFORMANCE_METRICS.ERROR_COUNT]++;
    }

    /**
     * 记录警告次数
     */
    incrementWarning() {
        this.metrics[PERFORMANCE_METRICS.WARNING_COUNT]++;
    }

    /**
     * 记录日志次数
     */
    incrementLog() {
        this.metrics[PERFORMANCE_METRICS.LOG_COUNT]++;
    }

    /**
     * 添加性能日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     */
    addLog(level, message) {
        // 将日志存储到队列中，避免性能影响
        this.logQueue.push({ level, message, timestamp: Date.now() });
    }

    /**
     * 计算平均值
     * @param {string} key - 指标键
     * @returns {number} 平均值
     */
    getAverage(key) {
        const values = this.metrics[key];
        if (!values || !Array.isArray(values) || values.length === 0) {
            return 0;
        }
        const sum = values.reduce((acc, val) => acc + val, 0);
        return sum / values.length;
    }

    /**
     * 添加性能指标
     * @param {string} key - 指标键
     * @param {string} value - 数值
     */
    addMetric(key, value) {
        this.metrics[key] = value;
    }

    /**
     * 获取性能指标
     * @returns {Object} 性能指标对象
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * 获取性能摘要
     * @returns {string} 摘要
     */
    getSummary() {
        const mediaDetection = this.getAverage(PERFORMANCE_METRICS.MEDIA_DETECTION_TIME);
        const keyboardResponse = this.getAverage(PERFORMANCE_METRICS.KEYBOARD_RESPONSE_TIME);

        return `
📊 性能监控摘要

时间指标：
- 媒体检测平均耗时：${mediaDetection.toFixed(2)} ms
- 键盘响应平均耗时：${keyboardResponse.toFixed(2)} ms
- 指示器显示平均耗时：${this.getAverage(PERFORMANCE_METRICS.INDICATOR_SHOW_TIME).toFixed(2)} ms

缓存性能：
- 命中：${this.metrics[PERFORMANCE_METRICS.CACHE_HIT_COUNT]} 次
- 未命中：${this.metrics[PERFORMANCE_METRICS.CACHE_MISS_COUNT]} 次

计数统计：
- 错误次数：${this.metrics[PERFORMANCE_METRICS.ERROR_COUNT]}
- 警告次数：${this.metrics[PERFORMANCE_METRICS.WARNING_COUNT]}
- 日志次数：${this.metrics[PERFORMANCE_METRICS.LOG_COUNT]}
`;
    }
}
