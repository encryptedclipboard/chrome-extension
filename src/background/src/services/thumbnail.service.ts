/**
 * Thumbnail Service
 *
 * Handles generation of thumbnails for clipboard items using the Offscreen API.
 * Manages the lifecycle of the offscreen document.
 */

import {
  SetupOffscreenDocumentOptions,
  ThumbnailResponse,
} from "@shared/types";

declare const browser: any;

export class ThumbnailService {
  private creating: Promise<void> | null = null;
  private offscreenPath = "offscreen/offscreen.html";
  private port: any = null; // chrome.runtime.Port
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: Function; reject: Function }
  >();

  // Rate limiting: max concurrent thumbnail generations
  private maxConcurrent = 2;
  private activeGenerations = 0;
  private generationQueue: Array<() => void> = [];

  constructor() {}

  /**
   * Send message via port with response
   */
  private async sendMessage(type: string, data?: any): Promise<any> {
    if (!this.port) {
      throw new Error("Port not connected");
    }
    this.requestId++;
    const id = this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      try {
        this.port.postMessage({ id, type, data });
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
      }

      // Timeout safety
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Timeout waiting for port response"));
        }
      }, 5000);
    });
  }

  /**
   * Helper to generate thumbnail with rate limiting and retry logic
   */
  async generateThumbnailForContent(
    content: string,
  ): Promise<string | undefined> {
    // Pre-validation: Check for valid image content
    if (!content || typeof content !== "string") {
      return undefined;
    }

    // Check if it starts with data:image prefix
    if (!content.startsWith("data:image")) {
      return undefined;
    }

    // Size validation: Skip very large images (>25MB as safety margin)
    const MAX_SAFE_SIZE = 25 * 1024 * 1024;
    if (content.length > MAX_SAFE_SIZE) {
      console.warn(
        "[ThumbnailService] Image too large, skipping thumbnail generation",
      );
      return undefined;
    }

    // Rate limiting: Wait for a slot if at capacity
    await this.waitForGenerationSlot();

    let result: string | undefined;

    try {
      // Try up to 2 times (1 retry for transient failures)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await this.doGenerateThumbnail(content);
          if (result) break; // Success, exit retry loop
        } catch (err) {
          console.warn(
            `[ThumbnailService] Generation attempt ${attempt + 1} failed:`,
            err,
          );
          // Reconnect offscreen for retry
          if (attempt === 0) {
            await this.setupOffscreenDocument({ force: true });
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }
    } finally {
      this.releaseGenerationSlot();
    }

    return result;
  }

  /**
   * Internal method to do the actual thumbnail generation
   */
  private async doGenerateThumbnail(
    content: string,
  ): Promise<string | undefined> {
    // Check for Offscreen API (Chrome & Firefox MV3)
    const isOffscreenAvailable =
      (typeof chrome !== "undefined" && chrome.offscreen) ||
      (typeof browser !== "undefined" && (browser as any).offscreen);

    if (!isOffscreenAvailable) {
      console.warn("[ThumbnailService] Offscreen API not available.");
      return undefined;
    }

    // Ensure connected
    if (!this.port) {
      await this.setupOffscreenDocument({ force: false });
    }

    let response;
    try {
      // PING Check for sanity
      try {
        const ping = await this.sendMessage("OFFSCREEN_PING");
        if (!ping?.success) {
          console.warn("[ThumbnailService] Port PING failed, reconnecting...");
          await this.setupOffscreenDocument({ force: true });
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (e) {
        console.warn("[ThumbnailService] Port PING error:", e);
        await this.setupOffscreenDocument({ force: true });
        await new Promise((r) => setTimeout(r, 500));
      }

      // Generate thumbnail
      response = await this.sendMessage("GENERATE_THUMBNAIL", { content });
    } catch (e) {
      console.warn("[ThumbnailService] Generation error:", e);
    }

    if (response?.success && response?.thumbnail) {
      return response.thumbnail;
    } else {
      console.warn("[ThumbnailService] Thumbnail failed:", response?.error);
      return undefined;
    }
  }

  /**
   * Wait for a generation slot (rate limiting)
   */
  private async waitForGenerationSlot(): Promise<void> {
    if (this.activeGenerations < this.maxConcurrent) {
      this.activeGenerations++;
      return;
    }

    return new Promise((resolve) => {
      this.generationQueue.push(resolve);
    });
  }

  /**
   * Release a generation slot
   */
  private releaseGenerationSlot(): void {
    this.activeGenerations--;

    // Process next in queue
    const next = this.generationQueue.shift();
    if (next) {
      this.activeGenerations++;
      next();
    }
  }

  /**
   * Convert HTML to Markdown using Turndown in the offscreen document.
   * Handles offscreen document setup automatically.
   */
  async convertHtmlToMarkdown(
    html: string,
    title: string,
    url: string,
  ): Promise<{ success: boolean; markdown?: string; error?: string }> {
    try {
      // Ensure offscreen is connected
      if (!this.port) {
        await this.setupOffscreenDocument({ force: false });
        // Small delay to ensure port is ready
        await new Promise((r) => setTimeout(r, 100));
      }

      const response = await this.sendMessage("CONVERT_HTML_TO_MARKDOWN", {
        html,
        title,
        url,
      });

      return (
        response || { success: false, error: "No response from offscreen" }
      );
    } catch (err: any) {
      console.error("[ThumbnailService] Markdown conversion failed:", err);
      return {
        success: false,
        error: err.message || "Markdown conversion failed",
      };
    }
  }

  /**
   * Request Offscreen document to write content to system clipboard
   * This bypasses the user gesture requirement for background scripts.
   */
  async writeToClipboard(
    type: "text" | "image" | string,
    content: string,
    richContent?: string,
  ): Promise<boolean> {
    try {
      // Ensure connected
      if (!this.port) {
        await this.setupOffscreenDocument({ force: false });
      }

      const response = await this.sendMessage("WRITE_TO_CLIPBOARD", {
        type,
        content,
        richContent,
      });

      if (response?.success) {
        return true;
      } else {
        console.warn(
          "[ThumbnailService] Clipboard write failed:",
          response?.error,
        );
        return false;
      }
    } catch (err) {
      console.error("[ThumbnailService] Clipboard write error:", err);
      return false;
    }
  }

  /**
   * Offscreen document setup
   */
  async setupOffscreenDocument(
    options: SetupOffscreenDocumentOptions = {},
  ): Promise<void> {
    if (typeof chrome !== "undefined" && !chrome.offscreen) return;

    // cleanup old port if forcing
    if (options.force) {
      if (this.port) {
        try {
          this.port.disconnect();
        } catch (e) {}
        this.port = null;
      }
      try {
        await chrome.offscreen.closeDocument();
      } catch (e) {}
      this.creating = null;
    }

    // Check existing
    if (!options.force && this.port) return;

    const offscreenUrl = chrome.runtime.getURL(this.offscreenPath);

    try {
      if (this.creating) {
        await this.creating;
      } else {
        // Check if exists
        const exists = await this.hasOffscreenDocument(offscreenUrl);

        if (!exists) {
          try {
            this.creating = chrome.offscreen.createDocument({
              url: this.offscreenPath,
              reasons: [chrome.offscreen.Reason.CLIPBOARD],
              justification: "Monitoring clipboard for changes",
            });
            await this.creating;
          } catch (err: any) {
            throw err;
          }
        }

        this.creating = null;

        // Connect Port
        // Add a small delay to ensure script binding, especially if we swallowed an error or just created it
        await new Promise((r) => setTimeout(r, 100));
        await this.connectPort();
      }
    } catch (_) {
      this.creating = null;
    }
  }

  private async hasOffscreenDocument(url: string): Promise<boolean> {
    try {
      if (chrome.runtime && (chrome.runtime as any).getContexts) {
        const contexts = await (chrome.runtime as any).getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT"],
          documentUrls: [url],
        });
        return contexts.length > 0;
      }
    } catch (e) {}
    return false;
  }

  private async connectPort() {
    try {
      this.port = chrome.runtime.connect({ name: "offscreen-channel" });

      this.port.onDisconnect.addListener(() => {
        this.port = null;

        // Reject all pending
        this.pendingRequests.forEach((p, id) => {
          p.reject(new Error("Port disconnected"));
        });

        this.pendingRequests.clear();
      });

      this.port.onMessage.addListener((msg: ThumbnailResponse) => {
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const { resolve } = this.pendingRequests.get(msg.id)!;

          this.pendingRequests.delete(msg.id);

          resolve(msg);
        }
      });

      await new Promise((r) => setTimeout(r, 200)); // stabilization
    } catch (e) {
      console.error("[ThumbnailService] Connection failed", e);
      this.port = null;
    }
  }
}
