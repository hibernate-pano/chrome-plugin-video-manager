/**
 * Chrome API Mock
 * 模拟 Chrome 扩展 API 用于测试
 *
 * 包含的 API：
 * - chrome.storage (sync, local)
 * - chrome.runtime (sendMessage, onMessage, lastError)
 * - chrome.tabs (query, sendMessage)
 * - chrome.i18n (getMessage)
 */

// 存储数据的内存对象
const storageData: Record<string, any> = {};
const localStorageData: Record<string, any> = {};

/**
 * Chrome Storage API Mock
 */
const storageMock = {
  sync: {
    get: jest.fn((keys?: string | string[] | Record<string, any> | null, callback?: (items: Record<string, any>) => void) => {
      return new Promise<Record<string, any>>((resolve) => {
        let result: Record<string, any> = {};

        if (keys === null || keys === undefined) {
          // 获取所有数据
          result = { ...storageData };
        } else if (typeof keys === 'string') {
          // 获取单个键
          if (keys in storageData) {
            result[keys] = storageData[keys];
          }
        } else if (Array.isArray(keys)) {
          // 获取多个键
          keys.forEach((key) => {
            if (key in storageData) {
              result[key] = storageData[key];
            }
          });
        } else if (typeof keys === 'object') {
          // 获取带默认值的键
          Object.keys(keys).forEach((key) => {
            result[key] = key in storageData ? storageData[key] : keys[key];
          });
        }

        if (callback) {
          callback(result);
        }
        resolve(result);
      });
    }),

    set: jest.fn((items: Record<string, any>, callback?: () => void) => {
      return new Promise<void>((resolve) => {
        Object.assign(storageData, items);
        if (callback) {
          callback();
        }
        resolve();
      });
    }),

    remove: jest.fn((keys: string | string[], callback?: () => void) => {
      return new Promise<void>((resolve) => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        keysArray.forEach((key) => {
          delete storageData[key];
        });
        if (callback) {
          callback();
        }
        resolve();
      });
    }),

    clear: jest.fn((callback?: () => void) => {
      return new Promise<void>((resolve) => {
        Object.keys(storageData).forEach((key) => {
          delete storageData[key];
        });
        if (callback) {
          callback();
        }
        resolve();
      });
    }),

    getBytesInUse: jest.fn((keys?: string | string[] | null, callback?: (bytesInUse: number) => void) => {
      return new Promise<number>((resolve) => {
        const bytesInUse = JSON.stringify(storageData).length;
        if (callback) {
          callback(bytesInUse);
        }
        resolve(bytesInUse);
      });
    }),

    // 用于测试的辅助方法
    __reset: () => {
      Object.keys(storageData).forEach((key) => {
        delete storageData[key];
      });
    },

    __getData: () => ({ ...storageData }),
  },

  local: {
    get: jest.fn((keys?: string | string[] | Record<string, any> | null, callback?: (items: Record<string, any>) => void) => {
      return new Promise<Record<string, any>>((resolve) => {
        let result: Record<string, any> = {};

        if (keys === null || keys === undefined) {
          result = { ...localStorageData };
        } else if (typeof keys === 'string') {
          if (keys in localStorageData) {
            result[keys] = localStorageData[keys];
          }
        } else if (Array.isArray(keys)) {
          keys.forEach((key) => {
            if (key in localStorageData) {
              result[key] = localStorageData[key];
            }
          });
        } else if (typeof keys === 'object') {
          Object.keys(keys).forEach((key) => {
            result[key] = key in localStorageData ? localStorageData[key] : keys[key];
          });
        }

        if (callback) {
          callback(result);
        }
        resolve(result);
      });
    }),

    set: jest.fn((items: Record<string, any>, callback?: () => void) => {
      return new Promise<void>((resolve) => {
        Object.assign(localStorageData, items);
        if (callback) {
          callback();
        }
        resolve();
      });
    }),

    remove: jest.fn((keys: string | string[], callback?: () => void) => {
      return new Promise<void>((resolve) => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        keysArray.forEach((key) => {
          delete localStorageData[key];
        });
        if (callback) {
          callback();
        }
        resolve();
      });
    }),

    clear: jest.fn((callback?: () => void) => {
      return new Promise<void>((resolve) => {
        Object.keys(localStorageData).forEach((key) => {
          delete localStorageData[key];
        });
        if (callback) {
          callback();
        }
        resolve();
      });
    }),

    // 用于测试的辅助方法
    __reset: () => {
      Object.keys(localStorageData).forEach((key) => {
        delete localStorageData[key];
      });
    },

    __getData: () => ({ ...localStorageData }),
  },

  onChanged: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(),
  },
};

/**
 * Chrome Runtime API Mock
 */
const runtimeMock = {
  lastError: undefined as { message?: string } | undefined,

  sendMessage: jest.fn((message: any, callback?: (response: any) => void) => {
    return new Promise<any>((resolve) => {
      const response = { success: true };
      if (callback) {
        callback(response);
      }
      resolve(response);
    });
  }),

  onMessage: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(),
  },

  getURL: jest.fn((path: string) => `chrome-extension://mock-extension-id/${path}`),

  getManifest: jest.fn(() => ({
    manifest_version: 3,
    name: 'Video Speed Controller',
    version: '2.0.0',
  })),

  id: 'mock-extension-id',
};

/**
 * Chrome Tabs API Mock
 */
const tabsMock = {
  query: jest.fn((queryInfo: any, callback?: (tabs: any[]) => void) => {
    return new Promise<any[]>((resolve) => {
      const tabs = [
        {
          id: 1,
          url: 'https://example.com',
          active: true,
          windowId: 1,
        },
      ];
      if (callback) {
        callback(tabs);
      }
      resolve(tabs);
    });
  }),

  sendMessage: jest.fn((tabId: number, message: any, callback?: (response: any) => void) => {
    return new Promise<any>((resolve) => {
      const response = { success: true };
      if (callback) {
        callback(response);
      }
      resolve(response);
    });
  }),

  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),

  onUpdated: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(),
  },

  onActivated: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(),
  },
};

/**
 * Chrome i18n API Mock
 */
const i18nMock = {
  getMessage: jest.fn((messageName: string, substitutions?: string | string[]) => {
    // 简单返回消息名称作为翻译
    return messageName;
  }),

  getUILanguage: jest.fn(() => 'en'),

  detectLanguage: jest.fn((text: string, callback: (result: any) => void) => {
    callback({
      isReliable: true,
      languages: [{ language: 'en', percentage: 100 }],
    });
  }),
};

/**
 * 完整的 Chrome API Mock
 */
export const chromeMock = {
  storage: storageMock,
  runtime: runtimeMock,
  tabs: tabsMock,
  i18n: i18nMock,

  // 用于测试的辅助方法
  __reset: () => {
    storageMock.sync.__reset();
    storageMock.local.__reset();
    runtimeMock.lastError = undefined;
    jest.clearAllMocks();
  },
};

/**
 * 辅助函数：设置 runtime.lastError
 */
export const setRuntimeError = (message: string) => {
  runtimeMock.lastError = { message };
};

/**
 * 辅助函数：清除 runtime.lastError
 */
export const clearRuntimeError = () => {
  runtimeMock.lastError = undefined;
};

/**
 * 辅助函数：获取存储数据（用于测试验证）
 */
export const getStorageData = () => ({
  sync: { ...storageData },
  local: { ...localStorageData },
});

/**
 * 辅助函数：设置存储数据（用于测试准备）
 */
export const setStorageData = (data: Record<string, any>, type: 'sync' | 'local' = 'sync') => {
  if (type === 'sync') {
    Object.assign(storageData, data);
  } else {
    Object.assign(localStorageData, data);
  }
};
