(() => {
  // document_start 阶段同步注册桥接监听器：此时页面脚本尚未执行，
  // 我们必然是 window 捕获阶段的第一个 keydown/keyup 监听器，
  // 页面无法用 stopImmediatePropagation 抢在我们前面吞掉事件。
  // 真正的处理器由下方异步加载的 content.js 通过 __vscRegisterKeyboard 挂载。
  const handlers = { keydown: null, keyup: null };
  const bridge = (type) => (event) => handlers[type]?.(event);
  window.addEventListener('keydown', bridge('keydown'), true);
  window.addEventListener('keyup', bridge('keyup'), true);

  window.__vscRegisterKeyboard = (type, handler) => {
    handlers[type] = handler;
  };

  import(chrome.runtime.getURL('content.js')).catch((error) => {
    console.error('Video Speed Controller failed to bootstrap content script', error);
  });
})();
