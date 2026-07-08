import { browserAPI } from "@shared/utils/browser-api.util";
import {
  detectClipboardItemType,
  hasRichFormatting,
} from "@shared/utils/clipboard-type.util";
import { ClipboardItemType } from "@shared/enums/clipboard-item-type.enum";

function getBrowserName(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("edg")) return "Edge";
  if (ua.includes("chrome")) return "Chrome";
  if (ua.includes("safari")) return "Safari";
  if (ua.includes("opera") || ua.includes("opr")) return "Opera";
  return "Browser";
}

const BROWSER_NAME = getBrowserName();

// Message types for communication with background script
const MESSAGE_TYPES = {
  CLIPBOARD_CAPTURED: "clipboard_captured",
} as const;

/**
 * Handle copy/cut events (in-browser)
 */
async function handleClipboardEvent(event: ClipboardEvent) {
  // We wait for the next tick to ensure the browser has finished populating the clipboard
  setTimeout(async () => {
    try {
      // With 'clipboardRead' permission, we can read the actual blobs from the clipboard.
      // This is the only way to get the EXACT raw text/html without formatting loss.
      const items = await navigator.clipboard.read();

      let text = "";
      let richContent: string | undefined;

      for (const item of items) {
        if (item.types.includes("text/plain")) {
          const blob = await item.getType("text/plain");
          text = await blob.text();
        }

        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          const html = await blob.text();

          // Only store as rich content if it actually has formatting
          if (html && hasRichFormatting(html)) {
            richContent = html;
          }
        }
      }

      if (text && text.trim()) {
        const type = detectClipboardItemType(text);
        await handleTextClipboard(text, type, BROWSER_NAME, richContent);
      }
    } catch (err) {
      console.error(
        "[Clipboard Listener] navigator.clipboard.read() failed:",
        err,
      );

      // Fallback to basic text if the API fails
      const text = document.getSelection()?.toString();
      if (text && text.trim()) {
        const type = detectClipboardItemType(text);
        await handleTextClipboard(text, type, BROWSER_NAME);
      }
    }
  }, 10); // Small delay to let the browser finish the copy operation
}

/**
 * Handle text clipboard data
 */
async function handleTextClipboard(
  text: string,
  type: ClipboardItemType,
  source: string,
  richContent?: string,
) {
  try {
    const metadata: Record<string, any> = {
      source: source,
      hasRichContent: !!richContent,
    };

    // Only add hostname for browser sources
    if (source !== "OS") {
      metadata.sourceUrl = window.location.href;
      metadata.hostname = window.location.hostname;
    }

    // Send to background script
    browserAPI.runtime.sendMessage({
      type: MESSAGE_TYPES.CLIPBOARD_CAPTURED,
      payload: {
        type,
        content: text,
        richContent,
        metadata,
      },
    });
  } catch (_) {}
}

// Global error handler to catch initialization issues
window.addEventListener("error", (event) => {
  browserAPI.runtime.sendMessage({
    type: "ERROR_LOG",
    error: `[Clipboard Listener Error] ${event.message} at ${event.filename}:${event.lineno}`,
  });
});

try {
  // Listen for copy and cut events
  document.addEventListener("copy", (e) => {
    handleClipboardEvent(e);
  });

  document.addEventListener("cut", (e) => {
    handleClipboardEvent(e);
  });

  // Ping background script to verify connection
  // Ping background script to verify connection
  browserAPI.runtime
    .sendMessage({ type: "PING" })
    .catch((err: any) =>
      console.error("[Clipboard Listener] PING failed:", err),
    );

  // Add message listener for writing to clipboard
  browserAPI.runtime.onMessage.addListener(
    (message: any, sender: any, sendResponse: any) => {
      if (message.type === "WRITE_TO_CLIPBOARD") {
        handleWriteToClipboard(message.data)
          .then(() => sendResponse({ success: true }))
          .catch((error) =>
            sendResponse({ success: false, error: error.toString() }),
          );
        return true; // Async response
      }
    },
  );
} catch (err) {
  console.error("[Clipboard Listener] Fatal init error:", err);
}

/**
 * Handle write to clipboard request (from context menu)
 */
async function handleWriteToClipboard(data: { type: string; content: string }) {
  try {
    if (data.type === "image") {
      // Content is base64 string
      // Chrome clipboard API prefers PNG. We need to convert it to a Blob.
      // Since we are in the content script, we can use fetch/canvas/Blob directly.

      // Convert base64 to Blob
      const response = await fetch(data.content);
      const blob = await response.blob();

      // Note: If the image is not PNG, the Clipboard API might reject it.
      // Ideally we should convert to PNG like we did in offscreen, but let's try direct blob first.
      // If direct blob fails, we might need canvas conversion here too.
      // Let's implement robust PNG conversion if needed, but for now try direct.
      // Actually, let's just do the conversion to be safe, reusing logic.

      const pngBlob = await convertToPng(data.content);

      // Write to clipboard using Clipboard API
      // Content Script HAS focus when user triggered context menu
      await navigator.clipboard.write([
        new ClipboardItem({
          [pngBlob.type]: pngBlob,
        }),
      ]);
    } else {
      // Write text
      await navigator.clipboard.writeText(data.content);
    }
  } catch (_) {}
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
