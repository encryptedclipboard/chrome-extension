import { cleanupService, lockService, storageService } from "../services";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { updateBadge } from "../utils/badge.util";
import { sendUpdated } from "@shared/utils/message.utils";

export async function handleMpcStarted(): Promise<void> {
  // Delete only synced items from IDB, keep local unsynced items
  await cleanupService.deleteSyncedItems();

  await storageService.set({
    totalCloudItems: 0,
    hasSyncedItems: false,
    clipboardMasterPasswordSet: false,
    hasPendingCloudItems: false,
    lastSyncTimestamp: 0,
    lastSyncStatus: null,
  });

  await MasterPassUtils.forgetMasterPassword();
  await updateBadge(cleanupService, lockService);

  const registration = (self as any).registration;
  if (registration?.showNotification) {
    await registration.showNotification("Master Password Change Started", {
      body: "Master password change is in progress on another device. Synced data cleared. Local items preserved. Wait for completion then set your new password.",
      icon: chrome.runtime.getURL("assets/icons/icon.png"),
      tag: "mpc-started",
      requireInteraction: true,
    });
  }

  sendUpdated();
}
