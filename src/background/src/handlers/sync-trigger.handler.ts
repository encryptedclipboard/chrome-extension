import { getBrowserId } from "@/shared/utils/browser-id.util";
import { syncOrchestratorService } from "../services";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { StorageUtil } from "@shared/utils/extension-storage.util";
import { PlanAbility } from "@shared/enums";
import { mpcService } from "@shared/services/mpc.service";

export const syncTriggerHandler = async (payload: {
  browserId?: string;
  type?: string;
  operation?: string;
  skipPush?: boolean;
  silent?: boolean;
}) => {
  if (mpcService.isInProgress()) return;

  // Check if this push is from the same browser (self-notification)
  const localBrowserId = await getBrowserId();
  const pushBrowserId = payload.browserId;

  // 0. Authentication Check
  const authData = await StorageUtil.getAuthData();
  if (!authData.authToken) {
    return;
  }

  if (pushBrowserId && localBrowserId === pushBrowserId) {
    return;
  } else if (!pushBrowserId) {
  }

  // Try to restore password first!
  await MasterPassUtils.ensurePasswordLoaded();

  // 1. Perform Sync Logic based on Password Availability
  const isPasswordLoaded = await MasterPassUtils.isPasswordLoaded();

  if (isPasswordLoaded) {
    // Skip pushing changes when syncing from a push - only pull changes
    await syncOrchestratorService.performFullSync({
      skipPush: true,
      silent: true,
    });
  } else {
    await syncOrchestratorService.performFullSync({
      checkOnly: true,
    });
  }

  // 2. Notification Logic
  const settings = await StorageUtil.getSettings();
  const showNotification = settings?.showNotificationOnSync ?? true;

  if (showNotification && chrome.notifications) {
    if (!isPasswordLoaded) {
      // Only notify if user has Auto-Sync ability AND has it enabled
      const authData = await StorageUtil.getAuthData();
      const abilities = authData.subscription?.planDetails?.abilities || [];
      const hasAutoSyncAbility = abilities.includes(PlanAbility.AUTO_SYNC);
      const settings = await StorageUtil.get(["clipboardAutoSync"]);

      if (hasAutoSyncAbility && settings.clipboardAutoSync) {
        const hasPassword = await MasterPassUtils.hasMasterPassword();
        const message = hasPassword
          ? "Unlock your clipboard to sync changes from cloud"
          : "Set your master password to enable auto-sync";

        const registration = (self as any).registration;
        if (registration && registration.showNotification) {
          await registration.showNotification("Sync Paused", {
            body: message,
            icon: chrome.runtime.getURL("assets/icons/icon.png"),
            tag: "sync-paused",
          });
        }
      }
    }
  }
};
