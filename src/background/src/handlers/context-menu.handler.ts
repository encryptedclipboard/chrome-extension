import { ClipboardItemType } from "@shared/enums";
import { handleClipboardCaptured } from "./clipboard-captured.handler";
import { detectClipboardItemType } from "@/shared/utils/clipboard-type.util";
import { pMap } from "@shared/utils/concurrency.util";
import { thumbnailService } from "../services";
import { generateNotificationId } from "../utils/error.util";

export const contextMenuHandler = async (
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
) => {
  // Image copy
  if (info.menuItemId === "copy-image-to-clipboard") {
    if (!info.srcUrl) return;

    try {
      if (!navigator.onLine) {
        throw new Error("No internet connection");
      }

      const response = await fetch(info.srcUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image (Status ${response.status})`);
      }

      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;

        handleClipboardCaptured({
          type: ClipboardItemType.IMAGE,
          content: base64data,
          metadata: {
            source: "Context Menu",
            sourceUrl: info.pageUrl || tab?.url,
            hostname: info.pageUrl ? new URL(info.pageUrl).hostname : undefined,
          },
        });

        thumbnailService.writeToClipboard("image", base64data);
      };
      reader.readAsDataURL(blob);
    } catch (error: any) {
      console.error("[Background] Failed to fetch image:", error);
      if (chrome.notifications) {
        const isOffline =
          error.message === "No internet connection" || !navigator.onLine;
        chrome.notifications.create(generateNotificationId("copy-error"), {
          type: "basic",
          iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
          title: isOffline ? "Offline" : "Image Copy Failed",
          message: isOffline
            ? "Internet connection required to copy remote images."
            : "Could not download image from this source.",
        });
      }
    }
  }
  // Link copy
  else if (info.menuItemId === "copy-link-to-clipboard") {
    if (!info.linkUrl) return;

    const url = info.linkUrl;
    handleClipboardCaptured({
      type: ClipboardItemType.URL,
      content: url,
      metadata: {
        source: "Context Menu",
        sourceUrl: info.pageUrl || tab?.url,
        hostname: info.pageUrl ? new URL(info.pageUrl).hostname : undefined,
      },
    });

    thumbnailService.writeToClipboard("text", url);
  }
  // Selection copy
  else if (info.menuItemId === "copy-selection-to-clipboard") {
    if (!info.selectionText) return;

    const content = info.selectionText.trim();
    if (!content) return;

    const type = detectClipboardItemType(content);

    handleClipboardCaptured({
      type,
      content,
      metadata: {
        source: "Context Menu",
        sourceUrl: info.pageUrl || tab?.url,
        hostname: info.pageUrl ? new URL(info.pageUrl).hostname : undefined,
      },
    });

    thumbnailService.writeToClipboard("text", content);
  }
  // Page URL copy
  else if (info.menuItemId === "copy-page-to-clipboard") {
    if (!info.pageUrl) return;

    const url = info.pageUrl;
    handleClipboardCaptured({
      type: ClipboardItemType.URL,
      content: url,
      metadata: {
        source: "Context Menu",
        sourceUrl: info.pageUrl,
        hostname: new URL(info.pageUrl).hostname,
      },
    });

    thumbnailService.writeToClipboard("text", url);
  }
  // Markdown copy
  else if (info.menuItemId === "copy-as-markdown" && tab?.id) {
    try {
      // 1. Execute script to get page HTML content (runs in page context where document exists)
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          let html = "";
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = document.createElement("div");
            container.appendChild(range.cloneContents());
            html = container.innerHTML;
          }

          if (!html) {
            // If no selection, get the body or main content
            const main =
              document.querySelector("main") ||
              document.querySelector("article") ||
              document.body;
            html = main.innerHTML;
          }

          return {
            title: document.title,
            url: window.location.href,
            html: html,
          };
        },
      });

      if (result.result) {
        const { title, url, html } = result.result as any;

        // 2. Convert HTML to Markdown using ThumbnailService's offscreen document
        const { thumbnailService } = await import("../services");

        const response = await thumbnailService.convertHtmlToMarkdown(
          html,
          title,
          url,
        );

        if (response?.success && response?.markdown) {
          // 3. Save to history
          handleClipboardCaptured({
            type: ClipboardItemType.MARKDOWN,
            content: response.markdown,
            metadata: {
              source: "Context Menu (Markdown)",
              sourceUrl: url,
              hostname: new URL(url).hostname,
            },
          });

          // 4. Notify user
          if (chrome.notifications) {
            chrome.notifications.create(
              generateNotificationId("copy-markdown-success"),
              {
                type: "basic",
                iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
                title: "Success",
                message: "Page content copied as Markdown.",
              },
            );
          }
        } else {
          throw new Error(response?.error || "Markdown conversion failed");
        }
      }
    } catch (error: any) {
      console.error("[Background] Failed to copy as markdown:", error);
      if (chrome.notifications) {
        chrome.notifications.create(
          generateNotificationId("copy-markdown-error"),
          {
            type: "basic",
            iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
            title: "Copy as Markdown Failed",
            message: error.message || "Failed to extract page content.",
          },
        );
      }
    }
  } else if (info.menuItemId === "copy-all-page-images" && tab?.id) {
    try {
      if (!navigator.onLine) {
        console.warn("[Background] Copy All Images: Offline");
        throw new Error("No internet connection");
      }

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const images: string[] = [];
          const seen = new Set<string>();

          document.querySelectorAll("img").forEach((img: HTMLImageElement) => {
            if (img.src.startsWith("data:")) return;
            if (img.width < 50 || img.height < 50) return;
            if (seen.has(img.src)) return;
            seen.add(img.src);
            images.push(img.src);
          });

          document
            .querySelectorAll<HTMLImageElement>("[data-src]")
            .forEach((img) => {
              const url = img.getAttribute("data-src");
              if (url && !seen.has(url)) {
                seen.add(url);
                images.push(url);
              }
            });

          document
            .querySelectorAll<HTMLImageElement>("[data-lazy-src]")
            .forEach((img) => {
              const url = img.getAttribute("data-lazy-src");
              if (url && !seen.has(url)) {
                seen.add(url);
                images.push(url);
              }
            });

          const elementsWithBg = document.querySelectorAll<HTMLElement>(
            "[style*='background-image']",
          );
          elementsWithBg.forEach((el) => {
            const match = el.style.backgroundImage.match(
              /url\(["']?([^"']+)["']?\)/,
            );
            if (match && !match[1].startsWith("data:")) {
              const url = match[1];
              if (!seen.has(url)) {
                seen.add(url);
                images.push(url);
              }
            }
          });

          return {
            images,
            hostname: window.location.hostname,
            url: window.location.href,
          };
        },
      });

      const { images, hostname, url } = result.result || {
        images: [],
        hostname: "",
        url: "",
      };

      if (images.length === 0) {
        if (chrome.notifications) {
          chrome.notifications.create(generateNotificationId("copy-images"), {
            type: "basic",
            iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
            title: "No Images Found",
            message: "No visible images found on this page.",
          });
        }
        return;
      }

      const fetchImage = async (
        imageUrl: string,
      ): Promise<{ base64: string; url: string } | null> => {
        try {
          const response = await fetch(imageUrl);
          if (!response.ok) return null;
          const blob = await response.blob();

          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({ base64: reader.result as string, url: imageUrl });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      };

      const results = await pMap(images, fetchImage, { concurrency: 6 });
      const successful = results.filter(
        (r): r is { base64: string; url: string } => r !== null,
      );

      for (const result of successful) {
        handleClipboardCaptured({
          type: ClipboardItemType.IMAGE,
          content: result.base64,
          metadata: {
            source: "Copy All Page Images",
            sourceUrl: url,
            hostname: hostname,
          },
        });
      }

      const total = images.length;
      const copied = successful.length;

      if (chrome.notifications) {
        chrome.notifications.create(generateNotificationId("copy-images"), {
          type: "basic",
          iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
          title: copied > 0 ? "Images Copied" : "No Images Saved",
          message:
            copied > 0
              ? `${copied} of ${total} images saved to clipboard history.`
              : "Failed to download any images from this page.",
        });
      }
    } catch (error: any) {
      console.error("[Background] Failed to copy all page images:", error);
      if (chrome.notifications) {
        const isOffline =
          error.message === "No internet connection" || !navigator.onLine;
        chrome.notifications.create(
          generateNotificationId("copy-images-error"),
          {
            type: "basic",
            iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
            title: isOffline ? "Offline" : "Copy Images Failed",
            message: isOffline
              ? "Internet connection required to copy page images."
              : error.message || "Failed to copy images from this page.",
          },
        );
      }
    }
  }
};
