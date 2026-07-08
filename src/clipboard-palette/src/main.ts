import { mount, unmount } from "svelte";
import App from "./App.svelte";
import {
  DEFAULT_CB_PALETTE_SHORTCUT,
  STORAGE_KEY_CB_PALETTE_SHORTCUT,
} from "@shared/types/shortcut.types";
import type { KeyboardShortcut } from "@shared/types/shortcut.types";

import { StorageService } from "@shared/services/extension-storage.service";
import { isKeyboardShortcut } from "@shared/types/shortcut.types";

// Sentinel flag - prevents re-injection into the same document
// (SPA navigations, tab switches where the script is already loaded).
// Cleared on DESTROY so lock/unlock and re-injection work.
const CB_PALETTE_SENTINEL = "__ecmCbPalette_injected";
(window as any)[CB_PALETTE_SENTINEL] = true;

const storageService = new StorageService();
let currentShortcut: KeyboardShortcut = DEFAULT_CB_PALETTE_SHORTCUT;

// Load shortcut from storage
storageService.getCbPaletteShortcut().then((shortcut) => {
  if (shortcut) {
    currentShortcut = shortcut;
  }
});

// Named storage listener for cleanup on destroy
const storageChangeListener = (
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string,
) => {
  if (areaName === "local" && changes[STORAGE_KEY_CB_PALETTE_SHORTCUT]) {
    const newValue = changes[STORAGE_KEY_CB_PALETTE_SHORTCUT].newValue;
    if (isKeyboardShortcut(newValue)) {
      currentShortcut = newValue;
    }
  }
};

chrome.storage.onChanged.addListener(storageChangeListener);

// Store app instance to unmount later
let appInstance: any = null;

function initApp() {
  // Check if already initialized
  const existingHost = document.getElementById("ecm-cb-palette-host");
  if (existingHost) {
    existingHost.remove();
  }

  // Create Host
  const host = document.createElement("div");
  host.id = "ecm-cb-palette-host";
  host.style.position = "absolute";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "0";
  host.style.height = "0";
  host.style.zIndex = "2147483647";
  document.body.appendChild(host);

  // Attach Shadow DOM
  const shadow = host.attachShadow({ mode: "open" });

  // Mount App into Shadow DOM (Svelte 5 API)
  try {
    appInstance = mount(App, {
      target: shadow,
      props: {
        initiallyVisible: false,
      },
    });
  } catch (_) {}
}

// Named runtime message listener for cleanup on destroy
const runtimeMessageListener = (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => {
  if (message.type === "DESTROY_FLOATING_CLIPBOARD") {
    // Unmount Svelte App
    if (appInstance) {
      try {
        unmount(appInstance);
      } catch (_) {}
      appInstance = null;
    }

    // Remove Host
    const host = document.getElementById("ecm-cb-palette-host");
    if (host) host.remove();

    // Clear sentinel so re-injection works on unlock / tab reactivation
    (window as any)[CB_PALETTE_SENTINEL] = false;

    // Clean up script-level listeners to prevent accumulation
    // on lock/unlock cycles and tab switches
    chrome.storage.onChanged.removeListener(storageChangeListener);
    chrome.runtime.onMessage.removeListener(runtimeMessageListener);
  }
};

chrome.runtime.onMessage.addListener(runtimeMessageListener);

// Initialize immediately
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
