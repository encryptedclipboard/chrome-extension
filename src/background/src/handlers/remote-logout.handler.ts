/**
 * Handle remote logout request
 * Clears all local data, credentials, and state
 */

import { MessageType } from "@/shared/types";
import {
  cleanupService,
  lockService,
  clipboardPushService,
  storageService,
  cbItemService,
} from "../services";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { updateBadge } from "../utils/badge.util";
import { sendAuthStatusChanged, sendLogout } from "@shared/utils/message.utils";

/**
 * Handle remote logout (from push or auth expiry)
 */
export async function handleRemoteLogout(keepData: boolean = true) {
  try {
    // 1. Save current user ID for future conflict detection
    const authData = await storageService.getAuthData();

    if (authData?.user?._id) {
      await storageService.set({
        lastActiveUserId: authData.user._id,
      });
    }

    // 2. Unsubscribe from Push Notifications (Best effort)
    try {
      if (keepData) {
        // Only unsubscribe if we aren't wiping everything (if wiping, we might want to keep sub for re-login? No, always unsubscribe on logout)
        await clipboardPushService.unsubscribe();
      } else {
        await clipboardPushService.unsubscribe();
      }
    } catch (e) {
      console.warn("Failed to unsubscribe push on logout (ignoring)", e);
    }

    // 3. Clear Auth Token & User Data (ALWAYS)
    await storageService.clearAuthData();

    // 4. Reset sync timestamps and metadata to force fresh check on next login
    await storageService.set({
      lastSyncTimestamp: 0,
      lastSyncStatus: null,
      lastSyncError: null,
      hasPendingCloudItems: false,
      totalCloudItems: 0,
      hasSyncedItems: false,
      clipboardAutoSync: false,
    });

    // 5. Always forget master password on logout (security best practice)
    await MasterPassUtils.forgetMasterPassword();

    if (!keepData) {
      // FULL WIPE requested (or manual clear)
      // 6. Clear Decrypted Items (IndexedDB)
      await cleanupService.clearAll();

      // 7. Reset Lock PIN & Wipe Locked Data
      await lockService.resetPin();
    } else {
      // KEEP DATA (Default/Soft Logout)
      // Demote all synced items to local status to prevent confusing UX
      if (!lockService.isLockInProgress()) {
        const syncedItems = await cbItemService.getSyncedItems();

        for (const item of syncedItems) {
          await cbItemService.demoteToLocal(item.id);
        }
      }
    }

    // 6. Clear any other state if necessary
    // e.g. close open windows or notify UI
    const windows = await chrome.windows.getAll({});

    // 7. Notify any open extension views to redirect to login
    // Send both specific status change AND generic logout to ensure all listeners catch it
    sendAuthStatusChanged({ isAuthenticated: false });
    sendLogout({ keepData });

    await updateBadge(cleanupService, lockService);
  } catch (error) {
    console.error("[Background] Error during logout cleanup:", error);
  }
}
