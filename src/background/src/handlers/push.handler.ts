import { getBrowserId } from "@shared/utils/browser-id.util";
import {
  clipboardDBService,
  lockService,
  syncOrchestratorService,
  cbItemService,
  syncDownloadService,
} from "../services";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { StorageUtil } from "@shared/utils/extension-storage.util";
import { updateBadge } from "../utils/badge.util";
import { syncTriggerHandler } from "./sync-trigger.handler";
import { logoutHandler } from "./logout.handler";
import { PushEventType } from "@shared/enums";
import { handleMpcStarted } from "./mpc-started.handler";
import { mpcService } from "@shared/services/mpc.service";
import { sendUpdated } from "@shared/utils/message.utils";

// Initialize
const lastManualSyncTime = 0;

/**
 * Main Web Push Event Handler
 * Coordinates all incoming push notifications:
 * - SYNC_TRIGGER: Full/incremental sync request
 * - LOGOUT: Remote logout request
 * - CLIPBOARD_UNSYNC_*: Items removed from cloud (plan limit/retention)
 */
export const pushHandler = (event: any) => {
  // Use event.waitUntil to keep Service Worker alive during async work
  event.waitUntil(
    (async () => {
      try {
        if (!event.data) return;

        const payload = event.data.json();
        const { type } = payload;

        // 1. Route based on message type
        switch (type) {
          case PushEventType.SYNC_TRIGGER:
            await syncTriggerHandler(payload);
            break;

          case PushEventType.LOGOUT:
            await logoutHandler(payload);
            break;

          case PushEventType.CLIPBOARD_UNSYNC_ITEM:
            await handleUnsyncItems(payload.payload);
            break;

          case PushEventType.CLIPBOARD_UNSYNC_ALL:
            await handleUnsyncAll(payload.payload);
            break;

          case PushEventType.MPC_STARTED:
            await handleMpcStarted();
            break;

          case PushEventType.MPC_COMPLETED:
            await handleMpcCompleted();
            break;

          default:
            // Legacy / Incremental Sync (for compatibility or simpler operations)
            await handleLegacyPush(payload);
            break;
        }

        // 2. Global updates after any push operation
        await updateBadge(clipboardDBService, lockService);
      } catch (e) {
        console.error("[Background] Push handler failed:", e);
      }
    })(),
  );
};

/**
 * Handle individual items being unsynced from cloud (e.g. plan limit)
 */
async function handleUnsyncItems(payload: { ids?: string[]; reason?: string }) {
  const { ids, reason } = payload || {};

  if (!Array.isArray(ids) || ids.length === 0) return;
  if (lockService.isLockInProgress()) return;

  // Demote items to local
  for (const serverId of ids) {
    const localItem = await cbItemService.getItemByServerId(serverId);
    if (localItem) {
      if (reason === "retention_expired") {
        await cbItemService.markRetentionExpired(localItem.id);
      } else {
        await cbItemService.demoteToLocal(localItem.id);
      }
    }
  }

  // Update totalCloudItems locally
  const storage = await StorageUtil.get(["totalCloudItems"]);
  if (storage.totalCloudItems !== undefined) {
    const newTotal = Math.max(0, storage.totalCloudItems - ids.length);
    await StorageUtil.set({ totalCloudItems: newTotal });
  }

  const registration = (self as any).registration;
  if (registration && registration.showNotification) {
    if (reason === "plan_limit_exceeded") {
      await registration.showNotification("Items Removed from Cloud", {
        body: `${ids.length} older items were removed from cloud due to plan limit. They remain available locally.`,
        icon: chrome.runtime.getURL("assets/icons/icon.png"),
        tag: "cloud-sync-removed",
      });
    } else if (reason === "retention_expired") {
      await registration.showNotification("Items Archived", {
        body: `${ids.length} items were archived due to retention policy.`,
        icon: chrome.runtime.getURL("assets/icons/icon.png"),
        tag: "cloud-sync-archived",
      });
    } else if (reason === "manual_cloud_clear") {
      // This is triggered by Dashboard auto-cleanup of corrupt items
      await registration.showNotification("Items Removed from Cloud", {
        body: `${ids.length} items were removed from cloud. They remain available locally.`,
        icon: chrome.runtime.getURL("assets/icons/icon.png"),
        tag: "cloud-sync-cleared",
      });
    }
  }

  // Refresh UI
  sendUpdated();
}

/**
 * Handle all items being unsynced from cloud
 */
async function handleUnsyncAll(payload: { reason?: string }) {
  const { reason } = payload || {};

  if (lockService.isLockInProgress()) return;

  await cbItemService.demoteAllSyncedToLocal();
  await StorageUtil.set({ totalCloudItems: 0 });

  const registration = (self as any).registration;
  if (registration && registration.showNotification) {
    if (reason === "manual_cloud_clear") {
      await registration.showNotification("Items Removed from Cloud", {
        body: "All synced items were removed from cloud. They remain available locally.",
        icon: chrome.runtime.getURL("assets/icons/icon.png"),
        tag: "cloud-sync-cleared-all",
      });
    }
  }

  // Refresh UI
  sendUpdated();
}

/**
 * Handle MPC completed notification from server.
 * Stores flag so the sidebar can show an inline banner informing the user
 * that the MPC process is done and they can set up their new password.
 */
async function handleMpcCompleted() {
  await mpcService.setMpcCompleted();
  sendUpdated();

  const registration = (self as any).registration;
  if (registration && registration.showNotification) {
    await registration.showNotification("Master Password Change Complete", {
      body: "Master password change completed on another device. Open the extension to set your new password and sync from cloud.",
      icon: chrome.runtime.getURL("assets/icons/icon.png"),
      tag: "mpc-completed",
      requireInteraction: true,
    });
  }
}

/**
 * Legacy/Incremental Push Logic (Original pushHandler implementation)
 */
async function handleLegacyPush(payload: any) {
  if (lockService.isLockInProgress()) return;

  // Check if this is a self-notification
  const myBrowserId = await getBrowserId();
  if (payload.browserId && myBrowserId === payload.browserId) {
    return;
  }

  // Ensure password is loaded for decryption
  await MasterPassUtils.ensurePasswordLoaded();
  const isPasswordLoaded = await MasterPassUtils.isPasswordLoaded();

  const operation = payload?.operation;
  const itemId = payload?.itemId;

  if (operation === "update" && itemId) {
    if (isPasswordLoaded) {
      await syncDownloadService.pullItem(itemId);
    }
  } else {
    // Standard full sync check
    if (isPasswordLoaded) {
      await syncOrchestratorService.performFullSync({
        skipPush: true,
        silent: true,
      });
    } else {
      await syncOrchestratorService.performFullSync({
        checkOnly: true,
        skipPush: true,
      });
    }
  }

  // Show notification if enabled
  const settings = await StorageUtil.getSettings();
  const showNotification = settings?.showNotificationOnSync ?? true;
  const isMakeSelf = Date.now() - lastManualSyncTime < 5000;

  if (!isMakeSelf && showNotification) {
    const registration = (self as any).registration;
    if (registration && registration.showNotification) {
      const op = payload?.operation || "update";

      if (op === "delete") {
        await registration.showNotification("Clipboard Synced", {
          body: "Items removed from cloud",
          icon: chrome.runtime.getURL("assets/icons/icon.png"),
          tag: "clipboard-synced",
        });
      } else if (isPasswordLoaded) {
        await registration.showNotification("Clipboard Synced", {
          body:
            op === "create"
              ? "New items available"
              : "Clipboard has been updated",
          icon: chrome.runtime.getURL("assets/icons/icon.png"),
          tag: "clipboard-synced",
        });
      } else {
        await registration.showNotification("New items available", {
          body: "Unlock your clipboard to sync changes",
          icon: chrome.runtime.getURL("assets/icons/icon.png"),
          tag: "sync-paused",
        });
      }
    }
  }
}
