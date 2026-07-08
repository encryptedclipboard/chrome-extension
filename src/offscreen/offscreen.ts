// Offscreen document for clipboard monitoring
// This runs in a hidden document that has DOM access, allowing us to use execCommand('paste')
// and navigator.clipboard to read the clipboard even when the extension popup is closed.

import {
  detectClipboardItemType,
  hasRichFormatting,
} from "@shared/utils/clipboard-type.util";
import { generateThumbnail } from "@shared/utils/image.util";

let lastContentHash = "";
let isRunning = false;

// Text expander guard: prevent our own clipboard writes from being captured
let lastWrittenText = "";
let lastWrittenTime = 0;
let offscreenPort: chrome.runtime.Port | null = null;

// Wake guard: track last successful poll time to detect sleep/wake
let lastPollTime = Date.now();
const WAKE_THRESHOLD_MS = 10000; // 10s gap means likely resumed from sleep
let isWakePaused = false;

// Helper to hash content for comparison
async function sha256(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Read clipboard with a timeout to prevent hanging on large image data.
 * Returns null if timed out or skipped.
 */
async function readClipboardWithTimeout(
  timeoutMs = 3000,
): Promise<ClipboardItems | null> {
  if (!navigator.clipboard?.read) return null;

  const readPromise = navigator.clipboard.read();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Clipboard read timed out")), timeoutMs);
  });

  try {
    const items = (await Promise.race([
      readPromise,
      timeoutPromise,
    ])) as ClipboardItems;

    // Check total size and skip if any item exceeds 1MB
    let totalSize = 0;
    for (const item of items) {
      for (const type of item.types) {
        const blob = await item.getType(type);
        totalSize += blob.size;
        if (totalSize > 1024 * 1024) return null;
      }
    }

    return items;
  } catch {
    return null;
  }
}

async function convertToPng(base64Data: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas to Blob failed"));
      }, "image/png");
    };
    img.onerror = (e) =>
      reject(new Error("Failed to load image for conversion"));
    img.src = base64Data;
  });
}

async function checkClipboard() {
  // Detect wake from sleep: if last poll was > 10s ago, pause briefly
  const now = Date.now();
  if (lastPollTime > 0 && now - lastPollTime > WAKE_THRESHOLD_MS) {
    isWakePaused = true;
    await new Promise((r) => setTimeout(r, 2000));
    isWakePaused = false;
  }
  lastPollTime = now;

  // Keep the offscreen doc active so the port stays open and SW stays alive
  offscreenPort?.postMessage({ type: "KEEPALIVE" });

  if (isRunning) return;
  isRunning = true;

  try {
    // Ensure document is focused for clipboard access
    if (document.hasFocus && !document.hasFocus()) {
      window.focus();
    }

    // Try using the Clipboard API first
    {
      const items = await readClipboardWithTimeout();

      if (items) {
        for (const item of items) {
          // Get plain text always
          let plainContent = "";
          let richContent = undefined;

          if (item.types.includes("text/plain")) {
            const blob = await item.getType("text/plain");
            plainContent = await blob.text();
          }

          // Also get HTML if available (for formatted text)
          if (item.types.includes("text/html")) {
            try {
              const htmlBlob = await item.getType("text/html");
              richContent = await htmlBlob.text();

              // Check if rich actually has formatting vs being full HTML
              if (!richContent || !hasRichFormatting(richContent)) {
                richContent = undefined; // Don't store if no actual formatting
              }
            } catch (e) {
              // Failed to get HTML, continue with plain only
              richContent = undefined;
            }
          }

          const text = plainContent;
          if (!text) continue;

          const hash = await sha256(text);

          // Suppress capture if this is our own snippet clipboard write
          if (
            text &&
            text === lastWrittenText &&
            Date.now() - lastWrittenTime < 2000
          ) {
            lastContentHash = hash;
            lastWrittenText = "";
            lastWrittenTime = 0;
            return;
          }

          if (hash !== lastContentHash) {
            lastContentHash = hash;

            const type = detectClipboardItemType(text);

            chrome.runtime
              .sendMessage({
                type: "clipboard_captured",
                payload: {
                  type,
                  content: text,
                  richContent: richContent,
                  metadata: {
                    source: "OS",
                    hasRichContent: !!richContent,
                  },
                },
              })
              .catch(() => {});
          }
          return; // Found text, done
        }
      }
    }

    // Fallback: Using paste event to get raw data
    // This is much better than reading innerHTML because it gets the raw strings
    // directly from the clipboard buffer, preserving exact formatting.
    const textarea = document.getElementById(
      "clipboard-target",
    ) as HTMLTextAreaElement;

    if (textarea) {
      const data = await new Promise<{ text: string; html: string }>(
        (resolve) => {
          const onPaste = (e: ClipboardEvent) => {
            e.preventDefault();
            const text = e.clipboardData?.getData("text/plain") || "";
            const html = e.clipboardData?.getData("text/html") || "";
            resolve({ text, html });
          };

          document.addEventListener("paste", onPaste, { once: true });

          textarea.value = "";
          textarea.focus();
          const success = document.execCommand("paste");

          if (!success) {
            document.removeEventListener("paste", onPaste);
            resolve({ text: "", html: "" });
          }
        },
      );

      const { text, html } = data;

      if (text) {
        const hash = await sha256(text);

        // Suppress capture if this is our own text expander clipboard write
        if (
          text &&
          text === lastWrittenText &&
          Date.now() - lastWrittenTime < 2000
        ) {
          lastContentHash = hash;
          lastWrittenText = "";
          lastWrittenTime = 0;
          return;
        }

        if (hash !== lastContentHash) {
          lastContentHash = hash;

          let richContent = undefined;
          if (html && hasRichFormatting(html) && html !== text) {
            richContent = html;
          }

          chrome.runtime
            .sendMessage({
              type: "clipboard_captured",
              payload: {
                type: detectClipboardItemType(text),
                content: text,
                richContent: richContent,
                metadata: {
                  source: "OS",
                  hasRichContent: !!richContent,
                },
              },
            })
            .catch(() => {});
          return;
        }
      }
    }
  } catch (error) {
  } finally {
    isRunning = false;
  }
}

// Poll every 5 seconds (reduced from 1s to reduce wake-hit probability)
setInterval(checkClipboard, 5000);

// Also listen for messages from background to force a check or stop
// Also listen for messages from background to force a check or stop
// Listen for long-lived connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "offscreen-channel") return;

  offscreenPort = port;
  port.onDisconnect.addListener(() => {
    offscreenPort = null;
  });

  port.onMessage.addListener(async (message) => {
    const { id, type, data } = message;

    // Helper to send response
    const reply = (response: any) => {
      try {
        port.postMessage({ id, ...response });
      } catch (e) {
        console.error("Port disconnected", e);
      }
    };

    if (type === "OFFSCREEN_PING") {
      reply({ success: true, message: "PONG" });
    } else if (type === "GENERATE_THUMBNAIL") {
      try {
        try {
          const thumbnail = await generateThumbnail(data.content);

          reply({ success: true, thumbnail });
        } catch (error: any) {
          reply({ success: false, error: error.toString() });
        }
      } catch (err) {
        reply({ success: false, error: String(err) });
      }
    } else if (type === "WRITE_TO_CLIPBOARD") {
      try {
        // Ensure focus
        if (typeof window.focus === "function") {
          window.focus();
        }

        const { type: cbType, content, richContent } = data;
        if (cbType === "image") {
          const res = await fetch(content);
          const blob = await res.blob();
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob }),
          ]);
        } else if (richContent) {
          // Write both HTML and Plain Text for rich content
          const htmlBlob = new Blob([richContent], { type: "text/html" });
          const textBlob = new Blob([content], { type: "text/plain" });

          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": htmlBlob,
              "text/plain": textBlob,
            }),
          ]);
        } else {
          // Try standard API first for plain text
          try {
            await navigator.clipboard.writeText(content);
          } catch (writeErr) {
            // Fallback to execCommand for text
            const textarea = document.getElementById(
              "clipboard-target",
            ) as HTMLTextAreaElement;
            if (textarea) {
              textarea.value = content;
              textarea.select();
              const success = document.execCommand("copy");
              if (!success) throw new Error("Fallback copy failed");
            } else {
              throw writeErr;
            }
          }
        }
        reply({ success: true });
      } catch (error) {
        reply({ success: false, error: String(error) });
      }
    } else if (type === "WRITE_TO_CLIPBOARD_SYNC") {
      try {
        const { text, html } = data;
        // Track this write so checkClipboard() can skip capturing it
        lastWrittenText = text || "";
        lastWrittenTime = Date.now();
        const textarea = document.getElementById(
          "clipboard-target",
        ) as HTMLTextAreaElement;
        if (textarea) {
          textarea.value = text || "";
          textarea.focus();
          textarea.select();
          const success = document.execCommand("copy");
          if (!success) throw new Error("execCommand(copy) failed");
        } else {
          throw new Error("clipboard-target element not found");
        }
        reply({ success: true });
      } catch (error) {
        reply({ success: false, error: String(error) });
      }
    } else if (type === "CONVERT_HTML_TO_MARKDOWN") {
      try {
        const { html, title, url } = data;
        const TurndownService = (await import("turndown")).default;
        const turndownService = new TurndownService({
          headingStyle: "atx",
          codeBlockStyle: "fenced",
        });

        const markdown = turndownService.turndown(html);
        const fullMarkdown = `# ${title}\n\nSource: ${url}\n\n---\n\n${markdown}`;

        reply({ success: true, markdown: fullMarkdown });
      } catch (error) {
        reply({ success: false, error: String(error) });
      }
    }
  });
});
