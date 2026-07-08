/**
 * Firefox Poller Service
 *
 * Handles clipboard monitoring for Firefox MV2/MV3 using interval polling.
 * Firefox allows navigator.clipboard in background pages with correct permissions.
 */

import { detectClipboardItemType } from "@shared/utils/clipboard-type.util";
import type { CapturedItem } from "@shared/types/clipboard.types";
import { StorageUtil } from "@shared/utils/extension-storage.util";

declare const browser: any;

export class FirefoxPollerService {
  private lastContentHash = "";
  private intervalId: any = null;

  constructor(
    private onClipboardCaptured: (item: CapturedItem) => Promise<void>,
  ) {}

  /**
   * Initialize the poller
   */
  start() {
    // Only run on Firefox
    if (typeof browser !== "undefined" && !!browser.runtime) {
      // Firefox detected. Initializing background clipboard poller...
      this.intervalId = setInterval(() => this.checkClipboard(), 1000);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Hash helper
   */
  private async sha256(text: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Check clipboard for changes
   */
  private async checkClipboard() {
    try {
      // Check if monitoring is enabled
      const settings = await StorageUtil.getSettings();
      if (settings && settings.monitoringEnabled === false) return;

      // Read text from clipboard
      const text = await navigator.clipboard.readText();
      if (!text) return;

      const hash = await this.sha256(text);
      if (hash !== this.lastContentHash) {
        // New text detected
        this.lastContentHash = hash;

        await this.onClipboardCaptured({
          type: detectClipboardItemType(text),
          content: text,
          metadata: {
            source: "OS",
          },
        });
      }
    } catch (error) {
      // Suppress errors (e.g. if clipboard is empty or permission temporarily denied)
    }
  }
}
