import { API_CONFIG } from "@/config";
import { backgroundHttp } from "@shared/utils/background-http.util";
import { browserAPI } from "@shared/utils/browser-api.util";
import {
  getBrowserId,
  getBrowserFingerprint,
  getBrowserInfo,
} from "@shared/utils/browser-id.util";
import { ExtensionSigninResponse } from "@shared/types";
import { sendSessionExpired } from "@shared/utils/message.utils";

export class AuthService {
  /**
   * Exchanges a web authentication token for an extension-specific token/session.
   * This ensures the extension has its own authenticated session with detailed fingerprinting.
   */
  async exchangeToken(
    webToken: string,
  ): Promise<ExtensionSigninResponse | null> {
    try {
      // Gather browser identity data
      const browserId = await getBrowserId();
      const fingerprint = getBrowserFingerprint();
      const browserInfo = getBrowserInfo();

      const response = await backgroundHttp<{ data: ExtensionSigninResponse }>(
        API_CONFIG.BASE_URL,
        "POST",
        "/extension/signin",
        {
          data: {
            token: webToken,
            browserId,
            browserInfo,
            fingerprint,
          },
        },
      );

      // response is T, which is { data: ExtensionSigninResponse }
      if (response && response.data && response.data.accessToken) {
        // Token exchange successful

        // Transform subscription data to ISubscriptionStatusResponse
        const subscription = response.data.subscription;
        const planName = response.data.subscriptionPlanName;

        // Store the new extension token and user data
        await browserAPI.storage.local.set({
          authToken: response.data.accessToken,
          user: response.data.user,
          subscription: subscription || null,
          subscriptionPlanName: planName,
        });

        // Store sync timestamp if available to resume sync state
        if (response.data.lastSyncTimestamp) {
          await browserAPI.storage.local.set({
            lastSyncTimestamp: response.data.lastSyncTimestamp,
          });
        }

        // [PLAN LIMIT ENFORCEMENT]
        // If plan downgrades (or is synced fresh) and lacks AUTO_SYNC, disable the setting.
        const abilities: string[] = subscription?.planDetails?.abilities || [];
        // Hardcoded string to avoid importing Enum if not available in this file context contextually,
        // but ideally use PlanAbility.AUTO_SYNC if imported. "auto_sync" is safe per enum check.
        if (!abilities.includes("auto_sync")) {
          // Check current setting
          const { clipboardAutoSync } = await browserAPI.storage.local.get([
            "clipboardAutoSync",
          ]);

          if (clipboardAutoSync) {
            await browserAPI.storage.local.set({ clipboardAutoSync: false });
          }
        }

        return response.data;
      }

      throw new Error("No access token returned from server");
    } catch (error: unknown) {
      // Re-throw to allow caller (index.ts) to handle UI feedback/cleanup
      throw error;
    }
  }

  /**
   * Notify server that master password change started.
   * Server sets the MPC lock and sends MPC_STARTED push to other browsers.
   */
  async notifyMpcStarted(): Promise<void> {
    const browserId = await getBrowserId();
    await backgroundHttp<{ message: string }>(
      API_CONFIG.BASE_URL,
      "POST",
      "/users/mpc/started",
      {
        headers: { "x-browser-id": browserId },
      },
    );
  }

  /**
   * Handle unauthorized (401) errors globally.
   * Clears auth data and notifies the UI that the session has expired.
   */
  async handleUnauthorizedError(): Promise<void> {
    // 1. Clear local auth data
    await browserAPI.storage.local.remove([
      "authToken",
      "user",
      "subscription",
      "subscriptionPlanName",
    ]);

    // 2. Notify all UI components
    sendSessionExpired();

    // 3. Notification will be shown by caller
  }
}
