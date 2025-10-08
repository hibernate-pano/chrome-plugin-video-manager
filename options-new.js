/**
 * Options page script with i18n support
 */

// 初始化i18n
function initI18n() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const message = chrome.i18n.getMessage(element.getAttribute("data-i18n"));
    if (message) {
      if (element.tagName === "INPUT") {
        element.placeholder = message;
      } else {
        element.textContent = message;
      }
    }
  });

  // 设置页面标题
  document.title = chrome.i18n.getMessage("settingsTitle");
}

document.addEventListener("DOMContentLoaded", () => {
  // 初始化国际化
  initI18n();

  const inputs = {
    increase: document.getElementById("increase"),
    decrease: document.getElementById("decrease"),
    reset: document.getElementById("reset"),
    "toggle-fullscreen": document.getElementById("toggle-fullscreen"),
  };
  const saveButton = document.getElementById("save");
  const resetButton = document.getElementById("reset-shortcuts");
  const statusDiv = document.getElementById("status");

  // 标签页功能
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.getAttribute("data-tab");

      tabButtons.forEach((btn) => btn.classList.remove("active"));
      tabContents.forEach((content) => content.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(tabId).classList.add("active");
    });
  });

  // 默认快捷键
  const defaultShortcuts = {
    increase: "=",
    decrease: "-",
    reset: "0",
    "toggle-fullscreen": "f",
  };

  // 常见的浏览器快捷键
  const commonBrowserShortcuts = [
    "ctrl+t",
    "ctrl+n",
    "ctrl+w",
    "ctrl+f",
    "ctrl+s",
    "ctrl+p",
    "ctrl+r",
    "f5",
    "alt+f4",
    "ctrl+tab",
    "ctrl+shift+tab",
    "f1",
    "f11",
    "meta+t",
    "meta+n",
    "meta+w",
    "meta+f",
    "meta+s",
    "meta+p",
    "meta+r",
  ];

  // 格式化快捷键显示
  function formatShortcut(shortcut) {
    if (shortcut === " ") return chrome.i18n.getMessage("spaceKey") || "空格键";
    return shortcut;
  }

  // 解析快捷键
  function parseShortcut(displayValue) {
    if (
      displayValue === chrome.i18n.getMessage("spaceKey") ||
      displayValue === "空格键"
    )
      return " ";
    return displayValue;
  }

  // 重置为默认快捷键
  resetButton.addEventListener("click", () => {
    for (const action in inputs) {
      if (inputs[action]) {
        inputs[action].value = formatShortcut(defaultShortcuts[action]);
        inputs[action].classList.remove("warning");
      }
    }
    statusDiv.textContent = chrome.i18n.getMessage("resetToDefaultDone");
    statusDiv.style.color = "green";
  });

  // 加载保存的快捷键
  chrome.storage.sync.get({ shortcuts: defaultShortcuts }, (data) => {
    let shortcuts = data.shortcuts;

    const validShortcuts = {};
    let needsUpdate = false;

    for (const action in defaultShortcuts) {
      if (shortcuts[action] !== undefined) {
        validShortcuts[action] = shortcuts[action];
      } else {
        validShortcuts[action] = defaultShortcuts[action];
      }
    }

    for (const action in shortcuts) {
      if (!(action in defaultShortcuts)) {
        console.log(`检测到已删除的快捷键: ${action}，正在清理...`);
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      chrome.storage.sync.set({ shortcuts: validShortcuts });
      shortcuts = validShortcuts;
    }

    for (const action in inputs) {
      if (inputs[action]) {
        inputs[action].value = formatShortcut(shortcuts[action] || "");
      }
    }
  });

  // 检查快捷键冲突
  function checkShortcutConflicts() {
    const shortcutMap = {};
    let hasConflict = false;
    let hasEmpty = false;
    let hasBrowserConflict = false;

    statusDiv.textContent = "";
    statusDiv.style.color = "green";

    for (const action in inputs) {
      if (inputs[action]) {
        inputs[action].classList.remove("warning");
      }
    }

    for (const action in inputs) {
      if (inputs[action]) {
        const displayValue = inputs[action].value.trim();
        const shortcut = parseShortcut(displayValue);

        if (!shortcut) {
          inputs[action].classList.add("warning");
          hasEmpty = true;
          continue;
        }

        if (shortcutMap[shortcut]) {
          inputs[action].classList.add("warning");
          inputs[shortcutMap[shortcut]].classList.add("warning");
          hasConflict = true;
        } else {
          shortcutMap[shortcut] = action;
        }

        const normalizedShortcut = shortcut.toLowerCase();
        if (commonBrowserShortcuts.includes(normalizedShortcut)) {
          inputs[action].classList.add("warning");
          hasBrowserConflict = true;
        }
      }
    }

    if (hasConflict || hasEmpty || hasBrowserConflict) {
      let message = "";
      if (hasConflict)
        message += chrome.i18n.getMessage("conflictWarning") + " ";
      if (hasEmpty) message += chrome.i18n.getMessage("emptyWarning") + " ";
      if (hasBrowserConflict)
        message += chrome.i18n.getMessage("browserConflictWarning") + " ";

      statusDiv.textContent = message;
      statusDiv.style.color = "red";
      return false;
    }

    return true;
  }

  // 处理快捷键录制
  for (const action in inputs) {
    const input = inputs[action];
    if (input) {
      input.addEventListener("keydown", (e) => {
        e.preventDefault();
        let shortcut = "";
        if (e.ctrlKey) shortcut += "ctrl+";
        if (e.altKey) shortcut += "alt+";
        if (e.shiftKey) shortcut += "shift+";
        if (e.metaKey) shortcut += "meta+";

        const key = e.key.toLowerCase();
        if (!["control", "alt", "shift", "meta"].includes(key)) {
          if (key === " ") {
            input.value = formatShortcut(" ");
          } else {
            shortcut += key;
            input.value = shortcut;
          }
        }

        setTimeout(checkShortcutConflicts, 100);
      });

      input.addEventListener("blur", checkShortcutConflicts);
    }
  }

  // 保存快捷键
  saveButton.addEventListener("click", () => {
    if (!checkShortcutConflicts()) {
      statusDiv.textContent += " " + chrome.i18n.getMessage("fixAndSave");
      return;
    }

    const newShortcuts = {};
    try {
      for (const action in inputs) {
        if (inputs[action]) {
          const displayValue = inputs[action].value.trim();
          const value = parseShortcut(displayValue);
          newShortcuts[action] = value || defaultShortcuts[action];
        }
      }

      chrome.storage.sync.set({ shortcuts: newShortcuts }, () => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent =
            "保存失败: " + chrome.runtime.lastError.message;
          statusDiv.style.color = "red";
        } else {
          statusDiv.textContent = chrome.i18n.getMessage("saved");
          statusDiv.style.color = "green";
          setTimeout(() => {
            statusDiv.textContent = "";
          }, 1500);
        }
      });
    } catch (error) {
      statusDiv.textContent = "保存出错: " + error.message;
      statusDiv.style.color = "red";
    }
  });

  // 初始加载时检查冲突
  setTimeout(checkShortcutConflicts, 500);
});
