import { clipboardItemLockService } from "@shared/services";
import { StorageUtil } from "@shared/utils/extension-storage.util";

let isOpening = false;

/**
 * Open Clipboard Manager in a floating window (centered)
 */
export async function openClipboardWindow() {
  if (isOpening) return;
  isOpening = true;

  try {
    const width = 450;
    const height = 650;

    // Check if we have a saved window ID
    const floatingWindowId = await StorageUtil.getFloatingWindowId();

    if (floatingWindowId) {
      try {
        const win = await chrome.windows.get(floatingWindowId);
        if (win && win.id) {
          await chrome.windows.update(win.id, {
            focused: true,
            drawAttention: true,
          });
          return;
        }
      } catch (err) {
        // Window doesn't exist anymore, proceed to create
        await StorageUtil.removeFloatingWindowId();
      }
    }

    // Get current display info to center window
    let left = 100;
    let top = 100;

    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.system &&
        chrome.system.display
      ) {
        const displayInfo = await chrome.system.display.getInfo();
        const primaryDisplay =
          displayInfo.find((d) => d.isPrimary) || displayInfo[0];

        if (primaryDisplay) {
          left =
            primaryDisplay.workArea.left +
            Math.floor((primaryDisplay.workArea.width - width) / 2);
          top =
            primaryDisplay.workArea.top +
            Math.floor((primaryDisplay.workArea.height - height) / 2);
        }
      }
    } catch (e) {
      // Ignore display info errors
    }

    if (chrome.windows) {
      const newWin = await chrome.windows.create({
        url: "sidebar/index.html",
        type: "popup",
        width,
        height,
        left,
        top,
        focused: true,
      });

      if (newWin && newWin.id) {
        await StorageUtil.setFloatingWindowId(newWin.id);
        await clipboardItemLockService.setFloatingWindowOpen(true);
      }
    }
  } catch (_) {
  } finally {
    isOpening = false;
  }
}
