import { MessageType } from "@shared/types";
import type { ClipboardItem } from "@shared/services/clipboard-db.service";
import {
  cbItemService,
  cleanupService,
  lockService,
  storageService,
  syncOrchestratorService,
  syncService,
} from "../services";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { EncryptionUtils } from "@shared/utils/encryption.utils";
import { updateBadge } from "../clipboard-background";
import {
  sendLockProgress,
  sendLocked,
  sendUnlockProgress,
  sendUnlocked,
} from "@shared/utils/message.utils";
import {
  injectFloatingClipboard,
  removeFloatingClipboard,
} from "../utils/floating-clipboard.util";
import { updateContextMenus } from "../utils/context-menu.util";

/**
 * Handle Lock/Security related messages
 */
export async function handleLockMessage(message: any): Promise<{
  success: boolean;
  payload?: any;
  isSyncing?: boolean;
  processedCount?: number;
  totalCount?: number;
  item?: any;
  items?: any;
  error?: string;
  warning?: string;
  sizeMB?: string;
}> {
  switch (message.type) {
    case MessageType.CLIPBOARD_GET_SYNC_STATUS:
      const syncProgress = syncOrchestratorService.getSyncProgress();
      return {
        success: true,
        isSyncing: syncOrchestratorService.isSyncing(),
        processedCount: syncProgress.processed,
        totalCount: syncProgress.total,
      };

    case MessageType.CLIPBOARD_LOCK: {
      const { pin } = message.payload;
      lockService.setLockInProgress(true);
      try {
        const totalItems = await cbItemService.getCount();

        // Stream items directly to lock() for chunked processing
        const result = await lockService.lock(
          pin,
          cbItemService.getItemsWithContent(),
          totalItems,
          (current, total, stage) => {
            sendLockProgress({ current, total, stage });
          },
        );

        // Send completion progress
        sendLockProgress({
          stage: "complete",
          message: `Locked ${result.total} item${result.total !== 1 ? "s" : ""}${result.failed > 0 ? ` (${result.failed} failed)` : ""}`,
        });

        // Only clear originals if ALL items were successfully encrypted
        if (result.total > 0 && result.failed === 0) {
          await cleanupService.clearAll();
          await chrome.storage.local.set({
            clipboardLocked: true,
            clipboardLastActivity: Date.now(),
          });
          sendLocked();

          await updateBadge();

          // Remove cbPalette from active tab and remove context menus when locked
          const [lockedTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (lockedTab?.id) removeFloatingClipboard(lockedTab.id);
          await updateContextMenus();

          return { success: true };
        }

        // Partial or zero items - abort, never clear originals
        await lockService.cleanupLockDb();
        const errorMsg =
          result.failed > 0
            ? `Locking failed: ${result.failed} item${result.failed !== 1 ? "s" : ""} could not be encrypted`
            : "No items to lock";
        sendLockProgress({ stage: "error", message: errorMsg });
        return { success: false, error: errorMsg };
      } catch (error: any) {
        console.error("[Background] Locking failed:", error);

        await lockService.cleanupLockDb();
        sendLockProgress({
          stage: "error",
          message: error.message || "Locking failed",
        });

        return { success: false, error: error.message };
      } finally {
        lockService.setLockInProgress(false);
      }
    }

    case MessageType.CLIPBOARD_VERIFY_PIN: {
      const { pin } = message.payload;
      const isValid = await lockService.verifyPin(pin);
      return { success: isValid, error: isValid ? undefined : "Invalid PIN" };
    }

    case MessageType.CLIPBOARD_UNLOCK: {
      const result = await lockService.unlock(
        message.payload.pin,
        (current, total) => {
          sendUnlockProgress({ current, total });
        },
        async (item) => {
          await cbItemService.addRestoredItem(item);
        },
      );

      sendUnlocked();

      await updateBadge();

      // Reinject cbPalette and restore context menus when unlocked
      const [unlockedTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (unlockedTab?.id) injectFloatingClipboard(unlockedTab.id);
      await updateContextMenus();

      const settings = await storageService.get(["clipboardAutoSync"]);

      if (settings.clipboardAutoSync) {
        await syncOrchestratorService.performFullSync({
          isManual: true,
          ignoreLock: true,
        });
      } else {
        await syncOrchestratorService.performFullSync({
          checkOnly: true,
          ignoreLock: true,
        });
      }

      return { success: true };
    }

    case MessageType.CLIPBOARD_RESET_PIN:
      await lockService.resetPin();
      return { success: true };

    case MessageType.CLIPBOARD_ACTIVITY:
      await lockService.updateActivity();
      return { success: true };

    case MessageType.CLIPBOARD_SET_MASTER_PASSWORD: {
      const { password, rememberPassword } = message.payload;
      await MasterPassUtils.setMasterPassword(password);

      if (rememberPassword !== undefined) {
        await storageService.set({
          clipboardAutoSync: rememberPassword,
        });

        if (rememberPassword) {
          await MasterPassUtils.persistCurrentPassword();
        }
      } else {
        await storageService.set({
          clipboardMasterPasswordSet: true,
        });
      }

      await storageService.set({
        clipboardMasterPasswordSet: true,
      });

      const autoSyncSettings = await storageService.get(["clipboardAutoSync"]);

      if (autoSyncSettings.clipboardAutoSync) {
        if (!syncOrchestratorService.isSyncing()) {
          syncOrchestratorService
            .performFullSync({ isManual: true })
            .catch((err) => {
              console.error("[Background] Post-unlock sync failed:", err);
            });
        }
      }

      return { success: true };
    }

    case MessageType.VERIFY_MASTER_PASS: {
      const { password } = message.payload;
      try {
        // 1. Try cloud verification: fetch up to 5 items, try decrypt
        const stored = await storageService.get(["hasSyncedItems"]);
        const hasSyncedItems = stored.hasSyncedItems === true;
        let cloudVerified = false;

        if (hasSyncedItems) {
          const response = await syncService.fetchAllItems({ limit: 5 });
          const items = response.items || [];

          if (items.length > 0) {
            let attemptedCount = 0;

            for (const item of items) {
              if (!item.isEncrypted) continue;
              attemptedCount++;

              if (item.encryptionData) {
                try {
                  const isValid =
                    await EncryptionUtils.verifyPasswordAgainstData(password, {
                      ...item.encryptionData,
                      ciphertext: item.content,
                      version: item.encryptionData.version || 1,
                    });
                  if (isValid) {
                    cloudVerified = true;
                    break;
                  }
                } catch (e) {
                  console.warn(
                    "[Background] New format verification failed for item:",
                    item._id,
                  );
                }
              }

              try {
                const legacyData = JSON.parse(item.content);
                if (legacyData.ciphertext && legacyData.iv && legacyData.salt) {
                  const isValid =
                    await EncryptionUtils.verifyPasswordAgainstData(
                      password,
                      legacyData,
                    );
                  if (isValid) {
                    cloudVerified = true;
                    break;
                  }
                }
              } catch (e) {
                // Not a legacy item format or parse failed
              }
            }

            if (attemptedCount > 0 && !cloudVerified) {
              return {
                success: false,
                error:
                  "Incorrect master password. Please use the password you used on your other devices.",
              };
            }
          }
        }

        // 2. Local hash check (fallback if cloud didn't provide a definitive result)
        const hasLocalHash = await MasterPassUtils.hasMasterPassword();
        if (hasLocalHash) {
          const isCorrect =
            await MasterPassUtils.verifyMasterPassword(password);
          if (!isCorrect && !cloudVerified) {
            return {
              success: false,
              error: "Incorrect master password. Does not match local profile.",
            };
          }
        }

        // 3. Store verified password in memory
        if (cloudVerified) {
          // Password verified against cloud - set directly, creating fresh local hash
          await MasterPassUtils.setMasterPassword(password);
        } else {
          await MasterPassUtils.loadMasterPassword(password);
        }
        return { success: true };
      } catch (error: any) {
        console.error("[Background] Master pass verification error:", error);
        return {
          success: false,
          error: "Verification failed: " + error.message,
        };
      }
    }

    case MessageType.CLIPBOARD_VERIFY_CLOUD_PASSWORD: {
      const { password } = message.payload;
      try {
        const stored = await chrome.storage.local.get(["hasSyncedItems"]);
        const hasSyncedItems = stored.hasSyncedItems === true;

        if (hasSyncedItems) {
          // Fetch a few items to try verification
          const response = await syncService.fetchAllItems({ limit: 5 });
          const items = response.items || [];

          if (items.length === 0) {
            return { success: true }; // No items to verify against
          }

          let verified = false;
          let attemptedCount = 0;

          for (const item of items) {
            if (!item.isEncrypted) continue;
            attemptedCount++;

            // 1. Try New Format (encryptionData + ciphertext)
            if (item.encryptionData) {
              try {
                const isValid = await EncryptionUtils.verifyPasswordAgainstData(
                  password,
                  {
                    ...item.encryptionData,
                    ciphertext: item.content,
                    version: item.encryptionData.version || 1,
                  },
                );
                if (isValid) {
                  verified = true;
                  break;
                }
              } catch (e) {
                console.warn(
                  "[Background] New format verification failed for item:",
                  item._id,
                );
              }
            }

            // 2. Try Legacy Format (JSON in content)
            try {
              const legacyData = JSON.parse(item.content);
              if (legacyData.ciphertext && legacyData.iv && legacyData.salt) {
                const isValid = await EncryptionUtils.verifyPasswordAgainstData(
                  password,
                  legacyData,
                );
                if (isValid) {
                  verified = true;
                  break;
                }
              }
            } catch (e) {
              // Not a legacy item format or parse failed
            }
          }

          if (attemptedCount > 0 && !verified) {
            return {
              success: false,
              error:
                "Incorrect master password. Please use the password you used on your other devices.",
            };
          }
        }

        // Local check if cloud items didn't exist or didn't provide a definitive result
        const hasLocalHash = await MasterPassUtils.hasMasterPassword();
        if (hasLocalHash) {
          const isCorrect =
            await MasterPassUtils.verifyMasterPassword(password);
          if (!isCorrect) {
            return {
              success: false,
              error: "Incorrect master password. Does not match local profile.",
            };
          }
        }

        return { success: true };
      } catch (error: any) {
        console.error("[Background] Cloud verification error:", error);
        return {
          success: false,
          error: "Verification failed: " + error.message,
        };
      }
    }

    case MessageType.CLIPBOARD_UNLOCKED: {
      try {
        const isPasswordReady = await MasterPassUtils.isMasterPasswordSet();

        if (isPasswordReady) {
          const autoSyncSettings = await storageService.get([
            "clipboardAutoSync",
          ]);
          const isAutoSync = autoSyncSettings.clipboardAutoSync === true;

          if (isAutoSync) {
            syncOrchestratorService
              .performFullSync({ isManual: true })
              .catch((err) => {
                console.error(
                  "[Background] Post-unlock full sync failed:",
                  err,
                );
              });
          } else {
            syncOrchestratorService
              .performFullSync({ checkOnly: true })
              .catch((err) => {
                console.error(
                  "[Background] Post-unlock update check failed:",
                  err,
                );
              });
          }
        }
      } catch (err) {
        console.error("[Background] Post-unlock logic failed:", err);
      }
      return { success: true };
    }

    case MessageType.CLIPBOARD_FORGET_MASTER_PASSWORD:
      await MasterPassUtils.forgetMasterPassword();
      await storageService.set({ clipboardAutoSync: false });
      await updateBadge();
      return { success: true };

    default:
      return { success: false };
  }
}
