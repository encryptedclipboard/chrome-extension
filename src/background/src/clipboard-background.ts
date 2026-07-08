import {
  clipboardDBService,
  clipboardSyncQueueService,
  lockService,
  clipboardPushService,
  thumbnailService,
  syncUploadService,
  syncOrchestratorService,
  syncReconciliationService,
  snippetsDBService,
  tabManagerService,
  cleanupService,
  notificationService,
} from "./services";
import { SyncProcessorService } from "./services/sync-processor.service";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { StorageUtil } from "@shared/utils/extension-storage.util";
import { updateBadge as updateBadgeUtil } from "./utils/badge.util";
import { onAlarmHandler } from "./handlers/on-alarm.handler";
import { PlanAbility } from "@shared/enums/plan-ability.enum";
import { SyncStatus } from "@shared/enums/sync-status.enum";
import { LockOwner } from "@shared/types/session-storage.types";
import { updateContextMenus } from "./utils/context-menu.util";
import { keyboardCommandsHandler } from "./handlers/keyboard-commands.handler";
import { contextMenuHandler } from "./handlers/context-menu.handler";
import { pushHandler } from "./handlers/push.handler";
import { mainMessageHandler } from "./handlers/main-message.handler";
import { handleMpcChange } from "./handlers/mpc.handler";
import { mpcService, MPCPhase } from "@shared/services/mpc.service";
import { clipboardItemLockService } from "@/shared/services";

// Track initialization state for service worker restarts
let isInitialized = false;

const PUSH_CHECK_ALARM = "periodic_push_check";

/**
 * Initialize the background service
 */
export async function init() {
  if (isInitialized) return;

  try {
    // Clear stale syncInProgress flag if SW was restarted mid-sync
    const existingSync = await StorageUtil.get([
      "syncInProgress",
      "lastSyncTimestamp",
    ]);
    if (existingSync.syncInProgress) {
      const now = Date.now();
      const lastTimestamp = existingSync.lastSyncTimestamp || 0;
      // If lastSyncTimestamp is more than 5 minutes old, flag is stale
      if (now - lastTimestamp > 5 * 60 * 1000) {
        await StorageUtil.set({ syncInProgress: false });
      }
    }

    // Resume processing if there are items in the temp sync store
    const unprocessedCount =
      await clipboardDBService.countUnprocessedSyncItems();
    if (unprocessedCount > 0) {
      const processor = new SyncProcessorService();
      processor.setCallbacks(
        (processed) => {
          console.log(
            `[Background] Resuming sync processing: ${processed} items processed`,
          );
        },
        () => {
          processor.stop();
          console.log("[Background] Sync processing resumed and completed");
        },
        () => {},
      );
      processor
        .processAll(() => true)
        .catch((err) => {
          console.error("[Background] Resume processing failed:", err);
        });
    }

    thumbnailService.setupOffscreenDocument();
    await snippetsDBService.init();

    await clipboardSyncQueueService.init(async (itemId) => {
      if (lockService.isLockInProgress()) return;
      await syncUploadService.pushItem(itemId, true);
    });

    await clipboardPushService.init();
    setupPeriodicPushCheck();

    await MasterPassUtils.ensurePasswordLoaded();
    await lockService.init();

    await handleStartupSync();

    // Resume in-progress Master Password Change upload
    const mpcProgress = await mpcService.getProgress();
    console.log("[MPC] Startup check:", {
      hasProgress: !!mpcProgress,
      phase: mpcProgress?.phase,
      inProgress: mpcProgress?.inProgress,
    });
    if (
      mpcProgress?.phase === MPCPhase.COMPLETE ||
      mpcProgress?.phase === MPCPhase.ERROR
    ) {
      console.log(`[MPC] ${mpcProgress.phase} - clearing stale data`);
      await mpcService.clearProgress();
    } else if (mpcProgress?.inProgress) {
      mpcService.setInProgress(true);
      if (mpcProgress.phase === MPCPhase.UPLOADING) {
        if (mpcProgress.progressPercentage >= 100) {
          console.log("[MPC] Upload already at 100% - clearing stale progress");
          await mpcService.clearProgress();
        } else {
          const allItems = await clipboardDBService.getAllItems();
          const localItems = allItems.filter(
            (i: any) => i.syncStatus === SyncStatus.LOCAL,
          );
          console.log(
            `[MPC] Upload resume: ${localItems.length} local items found`,
          );

          if (localItems.length > 0) {
            handleMpcChange("").catch((err) =>
              console.error("[MPC] Auto-resume failed:", err),
            );
          } else {
            console.log(
              "[MPC] No local items - clearing stale upload progress",
            );
            await mpcService.clearProgress();
          }
        }
      } else {
        console.log(
          `[MPC] Non-resumable phase (${mpcProgress.phase}) - clearing`,
        );
        await mpcService.clearProgress();
      }
    }

    await tabManagerService.init();
    setupFloatingWindowListeners();

    await updateBadge();
    syncReconciliationService
      .reconcileOrphanedItems()
      .catch((err) =>
        console.error("[Background] Orphaned reconciliation failed:", err),
      );

    // Setup auto-cleanup alarm (Run every 4 hours)
    if (chrome.alarms) {
      chrome.alarms.create("auto_cleanup", { periodInMinutes: 240 });
      // Run once on startup too (with small delay to not block init)
      setTimeout(() => cleanupService.runAutoCleanup(), 5000);
    }

    isInitialized = true;
  } catch (error) {
    notificationService.show(notificationService.classifyError(error));
    throw error;
  }
}

/**
 * Handle initial sync on startup if auto-sync is enabled
 */
async function handleStartupSync() {
  const authData = await StorageUtil.getAuthData();
  const settings = await StorageUtil.get([
    "clipboardAutoSync",
    "clipboardMasterPasswordSet",
  ]);

  if (authData.authToken && settings.clipboardAutoSync) {
    const abilities = authData.subscription?.planDetails?.abilities || [];
    const hasAutoSyncAbility = abilities.includes(PlanAbility.AUTO_SYNC);

    if (!hasAutoSyncAbility) {
      await StorageUtil.set({ clipboardAutoSync: false });
      return;
    }

    const isLoaded = await MasterPassUtils.isPasswordLoaded();
    if (settings.clipboardMasterPasswordSet && isLoaded) {
      console.log("[Sync] handleStartupSync - firing performFullSync(silent)");
      syncOrchestratorService.performFullSync({ silent: true }).catch((err) => {
        console.warn("[Background] Initial sync failed:", err);
      });
      console.log(
        "[Sync] handleStartupSync - performFullSync fired without await",
      );
    }
  } else if (!authData.authToken && settings.clipboardAutoSync) {
    await StorageUtil.set({ clipboardAutoSync: false });
  }
}

/**
 * Track floating window state for item locking
 */
let floatingWindowListenersRegistered = false;

function setupFloatingWindowListeners() {
  if (floatingWindowListenersRegistered) return;

  // When floating window closes, reset its open state
  chrome.windows.onRemoved.addListener(async (windowId) => {
    try {
      const floatingWindowId = await StorageUtil.getFloatingWindowId();

      if (windowId === floatingWindowId) {
        await clipboardItemLockService.setFloatingWindowOpen(false);
        await clipboardItemLockService.clearLocksByOwner(
          LockOwner.FLOATING_WINDOW,
        );
        await StorageUtil.removeFloatingWindowId();
      }
    } catch (error) {
      console.error("[Background] Error handling window close:", error);
    }
  });

  floatingWindowListenersRegistered = true;
}

/**
 * Handle periodic push subscription check (runs every 10 minutes via chrome.alarms)
 */
async function handlePeriodicPushCheck() {
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
}

/**
 * Setup periodic push check using chrome.alarms (survives SW restart)
 * Note: actual handling is in onAlarmHandler to avoid duplicate listeners
 */
function setupPeriodicPushCheck() {
  if (!chrome.alarms) return;

  chrome.alarms.create(PUSH_CHECK_ALARM, { periodInMinutes: 10 });
}

/**
 * Handle Alarms (Auto-Lock)
 */
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener(onAlarmHandler);
}

/**
 * Message Handler (Grouped logic in handlers/)
 */
chrome.runtime.onMessage.addListener(mainMessageHandler);

// Context Menu Click
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener(contextMenuHandler);
}

// Badge updater (Wrapper)
export async function updateBadge() {
  await updateBadgeUtil(clipboardDBService, lockService);
}

// Listen for Web Push events (Standard)
if (self.addEventListener) {
  self.addEventListener("push", pushHandler);
}

// Listen for Browser Startup (Browser opened from closed state)
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(async () => {
    await syncOrchestratorService.performFullSync({ silent: true });
    await updateContextMenus();
  });
}

// Listen for Extension Install/Update (or reload)
// onInstalled is handled in index.ts

// Listen for keyboard commands
if (chrome.commands) {
  chrome.commands.onCommand.addListener(keyboardCommandsHandler);
}
