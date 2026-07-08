/**
 * Clipboard Push Service (Fetch-based for Background/Service Worker)
 *
 * Handles Web Push Notifications using native fetch API.
 * Does NOT use axios. Safe for Chrome MV3 Service Workers.
 */

import { API_CONFIG } from "@/config";
import { getBrowserId } from "@shared/utils/browser-id.util";
import type { AxiosError } from "@shared/types/error.types";
import { StorageUtil } from "@shared/utils/extension-storage.util";
import { sendPushServiceFailure } from "@shared/utils/message.utils";

async function getAuthToken(): Promise<string | undefined> {
  return await StorageUtil.getAuthToken();
}

async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAuthToken();
  const browserId = await getBrowserId();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Strictly enforce browser ID
  if (!browserId) {
    console.error(
      "[PushService] Browser ID is missing for authenticated request",
    );
    // If we have a token (authenticated), we MUST have a browserId
    if (token) {
      throw new Error("Browser ID is required for sync operations");
    }
  }

  // Always send browser ID for subscription tracking/exclusion
  if (browserId) {
    headers["x-browser-id"] = browserId;
  }

  const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data.message || response.statusText || "Request failed",
    ) as AxiosError;
    error.response = { status: response.status, data };
    throw error;
  }

  return data;
}

class ClipboardPushService {
  private publicKey: string | null = null;

  async init() {
    try {
      const result = await chrome.storage.local.get(["authToken", "user"]);
      if (result.authToken && result.user) {
        await this.registerForPush();
      }
    } catch (e) {}
  }

  async registerForPush() {
    try {
      // Check internet connectivity first
      if (!navigator.onLine) {
        return;
      }

      if (!("PushManager" in self) && !("PushManager" in window)) {
        await chrome.storage.local.set({ pushServiceFailure: true });
        return;
      }

      // 1. Get Registration
      const registration = await this.getRegistration();
      if (!registration) {
        await chrome.storage.local.set({ pushServiceFailure: true });
        return;
      }

      // 2. Check if already subscribed locally
      let subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // 3. Verify if subscription exists on server
        const isVerified = await this.verifySubscription(subscription.endpoint);

        if (isVerified) {
          await chrome.storage.local.set({ pushServiceFailure: false });
          return;
        }
      } else {
        // 4. Create new subscription if none exists
        const publicKey = await this.getVapidPublicKey();
        if (!publicKey) {
          console.error("[PushService] Failed to get VAPID public key");
          // This might be a network issue, not necessarily GCM block, but effectively same result
          return;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(publicKey),
        });

        await chrome.storage.local.set({ pushServiceFailure: false });
      }

      if (subscription) {
        // 5. Send to server (Upsert)
        await this.sendSubscriptionToServer(subscription);
      }
    } catch (error: unknown) {
      const err = error as Error;
      // Check for specific Brave/GCM blocking errors or generic failures
      const msg = err.message || "";
      const name = err.name || "";

      // Brave: "Push service not available" or "Google Services for Push Messaging"
      // Firefox: "The operation is insecure" (sometimes)
      // Generic: "Registration failed - no senderId" or "Registration failed - push service error"
      // User Action: "user denied" (Permission denied)
      if (
        msg.includes("Push service not available") ||
        msg.includes("Google Services for Push Messaging") ||
        msg.includes("Registration failed - no senderId") ||
        msg.includes("push service error") ||
        msg.includes("AbortError") ||
        name === "AbortError" ||
        msg.includes("user denied") ||
        msg.includes("The operation is insecure") ||
        msg.includes("Internal Server Error")
      ) {
        console.warn(
          "[PushService] Push service appears blocked or unavailable. Setting failure flag.",
        );
        await chrome.storage.local.set({ pushServiceFailure: true });

        // Notify UI components (Sidebar) immediately
        try {
          sendPushServiceFailure();
        } catch (e) {
          // Ignore if no listeners
        }
      }
    }
  }

  async verifySubscription(endpoint: string): Promise<boolean> {
    try {
      // Check internet connectivity first
      if (!navigator.onLine) {
        return false;
      }

      const response = await fetchWithAuth<{ data: { exists: boolean } }>(
        `/push/verify?endpoint=${encodeURIComponent(endpoint)}`,
        { method: "GET" },
      );
      return response.data?.exists === true;
    } catch (error) {
      console.warn(
        "[PushService] Failed to verify subscription (safe fail)",
        error,
      );
      // Return false to trigger re-registration attempt (which should also be safe)
      // or true to suppress if it's just a network glitch?
      // User wants graceful handling. If network is down, we assumed offline check handles it.
      // But if server is 502, fetchWithAuth throws.
      // If we return false, it tries to re-register, which will also fail silently.
      // That's fine, as long as it doesn't crash or spam UI.
      return false;
    }
  }

  private async sendSubscriptionToServer(subscription: PushSubscription) {
    try {
      if (!navigator.onLine) return;

      const browserId = await getBrowserId();

      await fetchWithAuth("/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          ...subscription.toJSON(),
          browserId,
        }),
      });
    } catch (error: unknown) {
      const err = error as AxiosError;
      console.warn("[PushService] Failed to send subscription to server", err);

      // Check for 4xx errors (Client Error)
      // This usually means invalid arguments, unauthorized, or "Gone" (410)
      // In these cases, our local subscription state is likely invalid or out of sync with server.
      if (
        err.response &&
        Number(err.response.status) >= 400 &&
        Number(err.response.status) < 500
      ) {
        console.error(
          `[PushService] Server rejected subscription (Status ${err.response.status}). Unsubscribing locally to force fresh registration next time.`,
        );
        await this.unsubscribe();
      }
    }
  }

  async getSubscriptionEndpoint(): Promise<string | null> {
    try {
      const registration = await this.getRegistration();
      if (!registration) return null;
      const subscription = await registration.pushManager.getSubscription();
      return subscription ? subscription.endpoint : null;
    } catch (e) {
      console.warn("[PushService] Failed to get subscription endpoint", e);
      return null;
    }
  }

  private async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    // Strategy 1: Direct self.registration (Chrome MV3 Service Worker)
    try {
      if (typeof self !== "undefined") {
        const reg = (
          self as unknown as { registration: ServiceWorkerRegistration }
        ).registration;

        if (reg && reg instanceof ServiceWorkerRegistration) {
          return reg;
        }
      }
    } catch (e) {}

    // Strategy 2: navigator.serviceWorker.ready (Firefox MV2 or fallback)
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        return reg;
      } catch (e) {}
    }

    return null;
  }

  private async getVapidPublicKey(): Promise<string | null> {
    if (this.publicKey) return this.publicKey;
    try {
      const response = await fetchWithAuth<{ data: { publicKey: string } }>(
        "/push/vapid-public-key",
        {
          method: "GET",
        },
      );
      this.publicKey = response.data.publicKey;
      return response.data.publicKey;
    } catch (error) {
      console.error("[PushService] Failed to get VAPID key", error);
      return null;
    }
  }

  async unsubscribe() {
    try {
      const registration = await this.getRegistration();
      if (!registration) return;

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;

      // Local unsubscribe only (as per requirement)
      // We do NOT notify server here. Server subscription remains until overwritten or manually cleaned.
      await subscription.unsubscribe();

      // 3. Clear cached public key
      this.publicKey = null;
    } catch (e) {
      console.error("[PushService] Failed to unsubscribe", e);
    }
  }

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

export { ClipboardPushService };
