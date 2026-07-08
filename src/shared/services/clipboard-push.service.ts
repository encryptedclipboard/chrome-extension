import initAxios from "../utils/init-axios.util";
import { getBrowserId } from "../utils/browser-id.util";

const apiService = initAxios();

/**
 * Service to handle Web Push Notifications
 */
export class ClipboardPushService {
  private publicKey: string | null = null;

  async init(authToken?: string, user?: object): Promise<void> {
    if (!authToken || !user) return;

    try {
      await this.registerForPush();
    } catch (e: any) {
      if (
        e.response?.status === 401 ||
        e.message?.includes("Session invalid")
      ) {
        console.warn("[PushService] Init skipped: Session expired");
      } else {
        console.error("[PushService] Init failed", e);
      }
    }
  }

  /**
   * Register for Push Notifications
   */
  async registerForPush() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        console.warn("[PushService] Push messaging isn't supported.");
        return;
      }

      // 1. Get VAPID Public Key from server
      const publicKey = await this.getVapidPublicKey();
      if (!publicKey) return;

      // 2. Get Service Worker Registration
      // In extension background script, 'self.registration' works
      const registration =
        (self as any).registration || (await navigator.serviceWorker.ready);

      if (!registration) {
        console.error("[PushService] No SW registration found");
        return;
      }

      // 3. Subscribe
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, // Chrome requires this to be true even for silent pushes in older versions, but usually fine.
        // For Firefox, it handles it.
        // Note: Silent push in Chrome extension MV3 might need 'userVisibleOnly: false' if supported or specific permissions.
        // Actually, for extensions, 'notifications' permission allows showing, but we want silent background sync.
        // Chrome MV3 allows silent push if 'userVisibleOnly' is false?
        // Standard Web Push usually requires 'true'.
        // Let's stick to true for compatibility and just don't show notification if we don't want to.
        applicationServerKey: this.urlBase64ToUint8Array(publicKey),
      });

      // Subscribed to Push

      // 4. Send subscription to server
      await this.sendSubscriptionToServer(subscription);
    } catch (error) {
      console.error("[PushService] Registration failed", error);
    }
  }

  /**
   * Get current subscription endpoint
   */
  async getSubscriptionEndpoint(): Promise<string | null> {
    try {
      const registration =
        (self as any).registration || (await navigator.serviceWorker.ready);
      if (!registration) return null;

      const subscription = await registration.pushManager.getSubscription();
      return subscription ? subscription.endpoint : null;
    } catch (error) {
      console.warn("[PushService] Failed to get subscription endpoint", error);
      return null;
    }
  }

  private async getVapidPublicKey(): Promise<string | null> {
    if (this.publicKey) return this.publicKey;
    try {
      const response = await apiService.get<{ publicKey: string }>(
        "/push/vapid-public-key",
      );
      this.publicKey = response.data.publicKey;
      return response.data.publicKey;
    } catch (error: any) {
      if (
        error.response?.status === 401 ||
        error.message?.includes("Session invalid")
      ) {
        console.warn("[PushService] Cannot get VAPID key: Session expired");
      } else {
        console.error("[PushService] Failed to get VAPID key", error);
      }
      return null;
    }
  }

  private async sendSubscriptionToServer(subscription: PushSubscription) {
    try {
      const browserId = await getBrowserId();
      await apiService.post("/push/subscribe", {
        ...subscription.toJSON(),
        browserId,
      });
    } catch (error) {
      console.error(
        "[PushService] Failed to send subscription to server",
        error,
      );
    }
  }

  /**
   * Unsubscribe from Push Notifications
   */
  async unsubscribe() {
    try {
      const registration =
        (self as any).registration || (await navigator.serviceWorker.ready);
      if (!registration) return;

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;

      // 1. Notify server
      try {
        await apiService.post("/push/unsubscribe", {
          endpoint: subscription.endpoint,
        });
      } catch (e) {
        console.warn("[PushService] Failed to notify server of unsubscribe", e);
      }

      // 2. Unsubscribe locally
      await subscription.unsubscribe();
      // Unsubscribed

      this.publicKey = null;
    } catch (error) {
      console.error("[PushService] Unsubscribe failed", error);
    }
  }

  // Utility to convert VAPID key
  private urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, "+")
      .replace(/_/g, "/");

    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

export const clipboardPushService = new ClipboardPushService();
