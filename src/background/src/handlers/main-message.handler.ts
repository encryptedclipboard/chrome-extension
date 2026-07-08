import { MessageType } from "@shared/types";
import { handleClipboardCaptured } from "./clipboard-captured.handler";
import { handleAuthMessage } from "./auth-message.handler";
import { handleLockMessage } from "./lock-message.handler";
import { handleSyncMessage } from "./sync-message.handler";
import { handleSnippetMessage } from "./snippets.handler";
import { handleClipboardDataMessage } from "./clipboard-data.handler";
import { handleRemoteLogout } from "./remote-logout.handler";
import { handleThumbnailMessage } from "./thumbnail-message.handler";
import { openClipboardWindow } from "../utils/open-window.util";
import { storageService } from "../services";
import { PlanAbility } from "@shared/enums/plan-ability.enum";
import { updateBadge } from "../clipboard-background";
import { authSuccessHandler } from "./auth-success.handler";
import { subscriptionSyncHandler } from "./subscription-sync.handler";
import { emailVerifiedSyncHandler } from "./email-verified-sync.handler";
import { clipboardUnsyncItemHandler } from "./clipboard-unsync-item.handler";
import { clipboardUnsyncItemsHandler } from "./clipboard-unsync-items.handler";
import { httpHandler } from "./http.handler";
import { captureVisibleTabHandler } from "./capture.handler";
import { handleMpcChange } from "./mpc.handler";

/**
 * Main Message Router for chrome.runtime.onMessage
 */
export const mainMessageHandler = (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => {
  // Use IIFE for async logic
  (async () => {
    try {
      // 1. Specialized Handler Groups
      if (message.type.startsWith("SNIPPETS_")) {
        const res = await handleSnippetMessage(message);
        sendResponse(res);
        return;
      }

      if (
        (message.type.startsWith("CLIPBOARD_GET_") &&
          message.type !== MessageType.CLIPBOARD_GET_SYNC_STATUS) ||
        message.type === MessageType.GET_CLIPBOARD_ITEMS ||
        message.type === MessageType.SEARCH_CLIPBOARD_ITEMS ||
        message.type === MessageType.GET_CLIPBOARD_ITEM ||
        message.type === MessageType.TOGGLE_FAVORITE
      ) {
        const res = await handleClipboardDataMessage(message);
        sendResponse(res);
        return;
      }

      if (
        message.type === MessageType.UNAUTHORIZED_ERROR ||
        message.type === MessageType.LOGIN_SYNC ||
        message.type === MessageType.CHECK_AUTH_VALIDITY
      ) {
        const res = await handleAuthMessage(message);
        sendResponse(res);
        return;
      }

      if (
        message.type === MessageType.CLIPBOARD_LOCK ||
        message.type === MessageType.CLIPBOARD_VERIFY_PIN ||
        message.type === MessageType.CLIPBOARD_UNLOCK ||
        message.type === MessageType.CLIPBOARD_RESET_PIN ||
        message.type === MessageType.CLIPBOARD_SET_MASTER_PASSWORD ||
        message.type === MessageType.VERIFY_MASTER_PASS ||
        message.type === MessageType.CLIPBOARD_VERIFY_CLOUD_PASSWORD ||
        message.type === MessageType.CLIPBOARD_FORGET_MASTER_PASSWORD ||
        message.type === MessageType.CLIPBOARD_ACTIVITY ||
        message.type === MessageType.CLIPBOARD_GET_SYNC_STATUS ||
        message.type === MessageType.CLIPBOARD_UNLOCKED
      ) {
        const res = await handleLockMessage(message);
        sendResponse(res);
        return;
      }

      if (
        message.type.startsWith("CLIPBOARD_SYNC_") ||
        message.type === MessageType.CLIPBOARD_MANUAL_SYNC ||
        message.type === MessageType.CLIPBOARD_CHECK_UPDATES ||
        message.type === MessageType.CLIPBOARD_TOGGLE_AUTO_SYNC
      ) {
        const res = await handleSyncMessage(message);
        sendResponse(res);
        return;
      }

      // 2. Individual / Misc Handlers
      switch (message.type) {
        case MessageType.CLIPBOARD_CAPTURED:
          await handleClipboardCaptured(message.payload);
          sendResponse({ success: true });
          break;

        case MessageType.PING:
          sendResponse({ success: true, message: "PONG" });
          break;

        case MessageType.UPDATE_BADGE:
          await updateBadge();
          sendResponse({ success: true });
          break;

        case "CAPTURE_VISIBLE_TAB": {
          const captureRes = await captureVisibleTabHandler(message, sender);
          sendResponse(captureRes);
          break;
        }

        case "PROCESS_TEMP_SCREENSHOT": {
          try {
            const { tempKey } = message.payload;
            if (!tempKey) {
              sendResponse({ success: false, error: "No tempKey provided" });
              break;
            }

            // Read temp image from storage
            const result = await chrome.storage.local.get([tempKey]);
            const tempData = result[tempKey] as any;

            if (!tempData || !tempData.content) {
              sendResponse({ success: false, error: "No temp image found" });
              break;
            }

            // Process via clipboard captured handler
            await handleClipboardCaptured({
              type: "image",
              content: tempData.content,
              metadata: {
                ...tempData.metadata,
              },
            });

            // Clean up temp storage
            await chrome.storage.local.remove([tempKey]);

            sendResponse({ success: true });
          } catch (error: any) {
            console.error("[Background] PROCESS_TEMP_SCREENSHOT error:", error);
            sendResponse({ success: false, error: error.message });
          }
          break;
        }

        case MessageType.TEST_PUSH_NOTIFICATION:
          if ("serviceWorker" in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg)
              reg.showNotification("Test", { body: "Test Notification" });
          }
          sendResponse({ success: true });
          break;

        case MessageType.LOGOUT:
        case "LOGOUT": {
          const keepData = message.payload?.keepData !== false;
          await handleRemoteLogout(keepData);
          sendResponse({ success: true });
          break;
        }

        case MessageType.SETTINGS_UPDATED:
          sendResponse({ success: true });
          break;

        case "OPEN_WINDOW":
          await handleOpenWindow(sendResponse);
          break;

        case MessageType.AUTH_SUCCESS:
          await authSuccessHandler(message.payload);
          sendResponse({ success: true });
          break;

        case "AUTH_EXPIRED":
          // Handled by previous LOGOUT case if merged, but strictly:
          // Just call remote logout
          await handleRemoteLogout(true);
          sendResponse({ success: true });
          break;

        // LOGOUT case is already handled above at line 111.
        // Removed duplicate LOGOUT block.

        case "LOGOUT_CLEAR_ONLY":
          await handleRemoteLogout(true);
          sendResponse({ success: true });
          break;

        case "SUBSCRIPTION_SYNC":
          await subscriptionSyncHandler(message.payload);
          sendResponse({ success: true });
          break;

        case "EMAIL_VERIFIED_SYNC":
          await emailVerifiedSyncHandler(message.payload);
          sendResponse({ success: true });
          break;

        case "CLIPBOARD_UNSYNC_ITEM":
          const resSingle = await clipboardUnsyncItemHandler(message.payload);
          sendResponse(resSingle);
          break;

        case "CLIPBOARD_UNSYNC_ITEMS":
          const resBulk = await clipboardUnsyncItemsHandler(message.payload);
          sendResponse(resBulk);
          break;

        case MessageType.SEND_HTTP_REQUEST: {
          const res = await httpHandler(message.payload);
          sendResponse(res);
          break;
        }

        case MessageType.ERROR_LOG:
        case "ERROR_LOG":
          console.error(
            "[Remote Log]",
            message.payload?.error || message.error,
          );
          sendResponse({ success: true });
          break;
        case MessageType.MPC_START:
          {
            const res = await handleMpcChange(message.payload.newPassword);
            sendResponse(res);
          }
          break;

        case MessageType.GENERATE_THUMBNAIL:
          const result = await handleThumbnailMessage(message);
          sendResponse(result);
          break;

        default:
          console.warn(`[Background] Unknown message type: ${message.type}`);
          sendResponse({ success: false, error: "Unknown message type" });
          break;
      }
    } catch (error: any) {
      console.error("[Background] Message Handling Error:", error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep message channel open for async response
};

async function handleOpenWindow(sendResponse: (response?: any) => void) {
  try {
    const authData = await storageService.getAuthData();

    if (!authData || !authData.authToken) {
      sendResponse({ success: false, error: "Authentication required" });
      return;
    }

    const hasAbility = (
      authData.subscription?.planDetails as any
    )?.abilities?.includes(PlanAbility.FLOATING_WINDOW);

    if (!hasAbility) {
      sendResponse({ success: false, error: "Feature blocked" });
      return;
    }

    openClipboardWindow();
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: "Internal error" });
  }
}
