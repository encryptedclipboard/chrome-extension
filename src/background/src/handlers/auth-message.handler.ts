import { MessageType } from "@shared/types";
import {
  authService,
  storageService,
  syncService,
  clipboardPushService,
  syncOrchestratorService,
  cleanupService,
  lockService,
  notificationService,
} from "../services";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { updateContextMenus } from "../utils/context-menu.util";
import { handleRemoteLogout } from "./remote-logout.handler";
import { updateBadge } from "../utils/badge.util";
import { sendAuthSuccess, sendAuthError } from "@shared/utils/message.utils";

/**
 * Handle Authentication related messages
 */
export async function handleAuthMessage(message: any): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  skipped?: boolean;
}> {
  switch (message.type) {
    case MessageType.UNAUTHORIZED_ERROR:
      await authService.handleUnauthorizedError();
      notificationService.show(
        notificationService.classifyError(new Error("Session expired")),
      );
      return { success: true };

    case MessageType.LOGIN_SYNC: {
      const { token, hasSyncedItems } = message.payload;

      try {
        if (!token) throw new Error("Missing token");

        const currentAuth = await storageService.getAuthData();
        if (currentAuth?.authToken && currentAuth?.user) {
          return {
            success: true,
            message: "Already logged in",
            skipped: true,
          };
        }

        const authResponse = await authService.exchangeToken(token);

        if (authResponse) {
          if (hasSyncedItems !== undefined) {
            await chrome.storage.local.set({
              hasSyncedItems: !!hasSyncedItems,
              lastSyncTimestamp: 0,
            });
          } else {
            await chrome.storage.local.set({
              lastSyncTimestamp: 0,
            });
          }

          if (authResponse.user && authResponse.user._id) {
            const stored = await storageService.get(["lastActiveUserId"]);
            const lastUserId = stored.lastActiveUserId;
            const newUserId = authResponse.user._id;

            if (lastUserId && newUserId) {
              const lastIdStr = String(lastUserId);
              const newIdStr = String(newUserId);

              if (lastIdStr !== newIdStr) {
                console.warn(
                  `[Background] User Mismatch Detected on Login (Last: ${lastIdStr}, New: ${newIdStr}). Wiping previous user data.`,
                );
                await cleanupService.clearAll();
                await MasterPassUtils.forgetMasterPassword();
                await lockService.resetPin();
                await updateBadge(cleanupService, lockService);
              }
            }

            await storageService.set({
              lastActiveUserId: newUserId,
            });
          }

          const isReconnect = false;

          sendAuthSuccess({
            user: authResponse.user,
            subscription: authResponse.subscription,
            planName: authResponse.subscriptionPlanName,
            hasSyncedItems,
            isReconnect,
          });

          await clipboardPushService.init();
          await updateContextMenus();

          syncOrchestratorService
            .performFullSync({ checkOnly: true })
            .catch((err) => {
              console.error("Post-login sync check failed", err);
            });

          return { success: true };
        } else {
          throw new Error("Token exchange failed");
        }
      } catch (error: any) {
        console.error("Login sync error", error);
        sendAuthError({ message: error.message });

        return { success: false, error: error.message };
      }
    }

    case MessageType.CHECK_AUTH_VALIDITY:
      try {
        await syncService.getStats();

        const endpoint = await clipboardPushService.getSubscriptionEndpoint();

        if (!endpoint) {
          clipboardPushService.registerForPush().catch((err) => {
            console.error(
              "[Background] Opportunistic push registration failed:",
              err,
            );
          });
        }

        return { success: true };
      } catch (error: any) {
        console.warn("[Background] Auth validity check failed:", error.message);
        if (
          error.response?.status === 401 ||
          error.message?.includes("Authentication required") ||
          error.message?.includes("Session invalid")
        ) {
          await handleRemoteLogout(false);
        }

        return { success: false, error: error.message };
      }

    default:
      return { success: false };
  }
}
