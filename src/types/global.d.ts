/**
 * Global type declarations for Chrome Extension
 */

declare global {
  interface Window {
    chrome: typeof chrome;
  }
}

export {};
