(() => {
  import(chrome.runtime.getURL('content.js')).catch((error) => {
    console.error('Video Speed Controller failed to bootstrap content script', error);
  });
})();
