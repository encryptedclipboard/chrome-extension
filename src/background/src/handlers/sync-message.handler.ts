import { MessageType } from "@shared/types";
import {
  syncOrchestratorService,
  syncDeletionService,
  syncUploadService,
  storageService,
  lockService,
} from "../services";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { fetchWithAuth } from "@shared/utils/http.utils";
import { sendToast } from "@shared/utils/message.utils";
import { mpcService } from "@shared/services/mpc.service";

function handleDecryptionFailures() {
  const failedIds = syncOrchestratorService.lastSyncDecryptionFailures;
  if (failedIds.length > 0) {
    fetchWithAuth("/clipboard/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids: failedIds, hardDelete: true }),
    }).catch(() => {});
    sendToast({
      type: "warning",
      message: `${failedIds.length} item(s) had corrupted encryption and were removed from cloud sync.`,
    });
  }
}

/**
 * Handle Sync-triggered messages from UI
 */
export async function handleSyncMessage(
  message: any,
): Promise<{ success: boolean; error?: string }> {
  if (mpcService.isInProgress()) {
    return { success: false, error: "Master password change in progress" };
  }
  switch (message.type) {
    case MessageType.CLIPBOARD_SYNC_ITEM:
      if (
        (await lockService.isLockActive()) ||
        lockService.isLockInProgress()
      ) {
        return { success: false, error: "Locked" };
      }
      await syncUploadService.pushItem(message.payload.itemId, false);
      return { success: true };

    case MessageType.CLIPBOARD_SYNC_ALL:
      // Fire sync asynchronously to avoid blocking message channel
      syncOrchestratorService
        .performFullSync({ isManual: true })
        .then(handleDecryptionFailures)
        .catch((err) => {
          console.error("[Sync] Sync all failed:", err);
        });
      return { success: true };

    case MessageType.CLIPBOARD_MANUAL_SYNC: {
      const syncType = message.syncType || "bidirectional";
      console.log("[Sync] Manual sync requested:", {
        syncType,
        mpcInProgress: mpcService.isInProgress(),
      });
      const downloadOnly = message.downloadOnly === true;

      const isDownloadOnly = syncType === "download" || downloadOnly;
      const isUploadOnly = syncType === "upload";

      // Fire sync asynchronously - don't block the message channel.
      // Progress/errors are communicated via SYNC_PROGRESS events.
      syncOrchestratorService
        .performFullSync({
          isManual: true,
          skipPush: isDownloadOnly,
          skipFetch: isUploadOnly,
        })
        .then(handleDecryptionFailures)
        .catch((err) => {
          console.error("[Sync] Background sync failed:", err);
        });

      return { success: true };
    }

    case MessageType.CLIPBOARD_SYNC_DELETION:
      syncDeletionService
        .processPendingDeletions()
        .catch((err) =>
          console.error("[Background] Deletion sync failed:", err),
        );
      return { success: true };

    case MessageType.CLIPBOARD_CHECK_UPDATES:
      try {
        // Fire async - progress is communicated via SYNC_PROGRESS
        syncOrchestratorService
          .performFullSync({
            checkOnly: true,
          })
          .then(handleDecryptionFailures)
          .catch((error: any) => {
            console.warn(
              "[Background] Check updates failed, scheduling retry",
              error,
            );
            chrome.alarms.create("retry_check_updates", {
              delayInMinutes: 5,
            });
          });
        return { success: true };
      } catch (error: any) {
        return { success: false };
      }

    case MessageType.CLIPBOARD_TOGGLE_AUTO_SYNC: {
      const { enabled: autoSyncEnabled, password: autoSyncPassword } =
        message.payload;

      await storageService.set({
        clipboardAutoSync: autoSyncEnabled,
      });

      if (autoSyncEnabled) {
        if (autoSyncPassword) {
          await MasterPassUtils.setMasterPassword(autoSyncPassword);
        }
        await MasterPassUtils.persistCurrentPassword();
        // Fire sync asynchronously to avoid blocking message channel
        syncOrchestratorService
          .performFullSync({ isManual: true })
          .then(handleDecryptionFailures)
          .catch((err) => {
            console.error("[Sync] Auto-sync failed:", err);
          });
      } else {
        await MasterPassUtils.removeMasterPasswordFromStorage();
      }

      return { success: true };
    }

    default:
      return { success: false };
  }
}
