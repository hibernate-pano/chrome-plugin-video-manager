/**
 * Logger utility for consistent logging across the extension
 */

class Logger {
  constructor(prefix = 'VSC') {
    this.prefix = prefix;
    this.enabled = process.env.NODE_ENV !== 'production';
  }

  info(...args) {
    if (this.enabled) {
      console.log(`[${this.prefix}]`, ...args);
    }
  }

  warn(...args) {
    console.warn(`[${this.prefix}]`, ...args);
  }

  error(...args) {
    console.error(`[${this.prefix}]`, ...args);
  }

  debug(...args) {
    if (this.enabled && process.env.DEBUG) {
      console.debug(`[${this.prefix}]`, ...args);
    }
  }
}

export const logger = new Logger('VideoSpeedController');

export function createErrorHandler(context) {
  return (error) => {
    logger.error(`Error in ${context}:`, error.message);
    if (process.env.NODE_ENV !== 'production') {
      logger.error(error.stack);
    }
  };
}
