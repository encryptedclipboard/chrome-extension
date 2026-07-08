import { PlanAbility } from "@shared/enums";
import { lockService, storageService } from "../services";

/**
 * Update Context Menus based on abilities
 */
export async function updateContextMenus() {
  if (!chrome || !chrome.contextMenus) return;

  // Remove context menus when clipboard is locked
  if (await lockService.isLockActive()) {
    chrome.contextMenus.removeAll();
    return;
  }

  try {
    const authData = await storageService.getAuthData();
    const abilities = authData?.subscription?.planDetails?.abilities || [];
    const hasImageSupport = abilities.includes(PlanAbility.IMAGE_SUPPORT);

    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[Background] Context menu cleanup warning:",
          chrome.runtime.lastError,
        );
      }

      // Image - only if user has image support ability
      if (hasImageSupport) {
        chrome.contextMenus.create(
          {
            id: "copy-image-to-clipboard",
            title: "Copy Image",
            contexts: ["image"] as any,
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Background] Failed to create image context menu:",
                chrome.runtime.lastError.message || chrome.runtime.lastError,
              );
            }
          },
        );
      }

      // Link
      chrome.contextMenus.create(
        {
          id: "copy-link-to-clipboard",
          title: "Copy Link URL",
          contexts: ["link"] as any,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[Background] Failed to create link context menu:",
              chrome.runtime.lastError.message || chrome.runtime.lastError,
            );
          }
        },
      );

      // Selection
      chrome.contextMenus.create(
        {
          id: "copy-selection-to-clipboard",
          title: "Copy Selected Text",
          contexts: ["selection"] as any,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[Background] Failed to create selection context menu:",
              chrome.runtime.lastError.message || chrome.runtime.lastError,
            );
          }
        },
      );

      // Page (copy URL)
      chrome.contextMenus.create(
        {
          id: "copy-page-to-clipboard",
          title: "Copy Page URL",
          contexts: ["page"] as any,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[Background] Failed to create page context menu:",
              chrome.runtime.lastError.message || chrome.runtime.lastError,
            );
          }
        },
      );

      // Copy Page as Markdown
      chrome.contextMenus.create(
        {
          id: "copy-as-markdown",
          title: "Copy Page as Markdown",
          contexts: ["page", "selection"] as any,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[Background] Failed to create markdown context menu:",
              chrome.runtime.lastError.message || chrome.runtime.lastError,
            );
          }
        },
      );

      // Copy All Page Images
      chrome.contextMenus.create(
        {
          id: "copy-all-page-images",
          title: "Copy All Page Images",
          contexts: ["page"] as any,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[Background] Failed to create copy all images context menu:",
              chrome.runtime.lastError.message || chrome.runtime.lastError,
            );
          }
        },
      );
    });
  } catch (err) {
    console.error("[Background] Failed to update context menus:", err);
  }
}
