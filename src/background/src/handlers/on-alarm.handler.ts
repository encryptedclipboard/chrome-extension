import { MessageType } from "@/shared/types";
import {
  cbItemService,
  syncDeletionService,
  lockService,
  clipboardPushService,
  syncOrchestratorService,
  cleanupService,
  notificationService,
} from "../services";
import { StorageUtil } from "@shared/utils/extension-storage.util";
import { updateBadge } from "../utils/badge.util";
import { sendLockProgress, sendLocked } from "@shared/utils/message.utils";

export const onAlarmHandler = async (alarm: chrome.alarms.Alarm) => {
  if (alarm.name === "retry_check_updates") {
    // Retry checking for updates
    try {
      await syncOrchestratorService.performFullSync({
        checkOnly: true,
      });
      // Success - alarm will be cleared by checkUpdates method
    } catch (error) {
      console.warn(
        "[Background] Retry check failed, will retry again in 5 min",
        error,
      );

      // Re-schedule for another retry
      chrome.alarms.create("retry_check_updates", {
        delayInMinutes: 5,
      });
    }
  } else if (alarm.name === "periodic_push_check") {
    // Verify push subscription is still valid
    try {
      const authData = await StorageUtil.getAuthData();
      if (!authData?.authToken) return;

      const endpoint = await clipboardPushService.getSubscriptionEndpoint();
      if (endpoint) {
        const isVerified =
          await clipboardPushService.verifySubscription(endpoint);
        if (!isVerified) {
          await clipboardPushService.registerForPush();
        }
      } else {
        await clipboardPushService.registerForPush();
      }
    } catch (error) {
      console.error("[Background] Periodic push check failed:", error);
    }
  } else if (alarm.name === "lock-trigger") {
    // PERFORM REAL AUTO-LOCK
    const pin = lockService.getCachedPin();

    if (pin) {
      lockService.setLockInProgress(true);
      try {
        const totalItems = await cbItemService.getCount();

        // Stream items directly for chunked processing
        const result = await lockService.lock(
          pin,
          cbItemService.getItemsWithContent(),
          totalItems,
          (current, total, stage) => {
            sendLockProgress({ current, total, stage });
          },
        );

        // Only clear originals if ALL items were successfully encrypted
        if (result.total > 0 && result.failed === 0) {
          await cleanupService.clearAll();
          await chrome.storage.local.set({
            clipboardLocked: true,
            clipboardLastActivity: Date.now(),
          });
          sendLocked();
        } else {
          await lockService.cleanupLockDb();
          const errMsg =
            result.failed > 0
              ? `Auto-lock partial failure: ${result.failed} item(s) could not be encrypted`
              : "Auto-lock: no items to lock";
          console.error(`[Background] ${errMsg}`);
        }

        updateBadge(cleanupService, lockService);
      } catch (error) {
        console.error("[Background] Auto-lock failed:", error);
        await lockService.cleanupLockDb();
        const shouldWarn = await lockService.handleAlarm(alarm);
        if (shouldWarn) {
          notificationService.show(
            notificationService.classifyError(new Error("Auto-lock warning")),
          );
        }
      } finally {
        lockService.setLockInProgress(false);
      }
    } else {
      console.warn(
        "[Background] Auto-lock triggered but NO PIN cached. Falling back to soft lock.",
      );
      const shouldWarn = await lockService.handleAlarm(alarm);
      if (shouldWarn) {
        notificationService.show(
          notificationService.classifyError(new Error("Auto-lock warning")),
        );
      }
    }
  } else if (alarm.name === "retry_deletions") {
    // Retry failed deletions
    try {
      await syncDeletionService.processPendingDeletions();
    } catch (error) {
      console.warn("[Background] Retry deletions failed:", error);
    }
  } else if (alarm.name === "auto_cleanup") {
    // Perform periodic cleanup
    await cleanupService.runAutoCleanup();
  } else {
    // Handle warning or other alarms normally
    const shouldWarn = await lockService.handleAlarm(alarm);
    if (shouldWarn) {
      notificationService.show(
        notificationService.classifyError(new Error("Auto-lock warning")),
      );
    }
  }
};
