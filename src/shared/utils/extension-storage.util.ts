/**
 * Extension Storage Utility
 *
 * Static utility methods for chrome.storage operations.
 * Used by background services - no service dependencies.
 */

import type { QueueState } from "../types/queue.types";

export class StorageUtil {
  /**
   * Get auth token only
   */
  static async getAuthToken(): Promise<string | undefined> {
    const result = await chrome.storage.local.get(["authToken"]);
    return result.authToken as string | undefined;
  }

  /**
   * Get settings object (monitoringEnabled, showNotificationOnSync, autoCleanupDays, etc.)
   */
  static async getSettings(): Promise<
    | {
        monitoringEnabled?: boolean;
        showNotificationOnSync?: boolean;
        autoCleanupDays?: number;
      }
    | undefined
  > {
    const result = await chrome.storage.local.get(["settings"]);
    return result.settings as
      | {
          monitoringEnabled?: boolean;
          showNotificationOnSync?: boolean;
          autoCleanupDays?: number;
        }
      | undefined;
  }

  /**
   * Set settings object
   */
  static async setSettings(settings: {
    monitoringEnabled?: boolean;
    showNotificationOnSync?: boolean;
    autoCleanupDays?: number;
  }): Promise<void> {
    await chrome.storage.local.set({ settings });
  }

  /**
   * Get floating window ID
   */
  static async getFloatingWindowId(): Promise<number | undefined> {
    const result = await chrome.storage.local.get(["floatingWindowId"]);
    return result.floatingWindowId as number | undefined;
  }

  /**
   * Set floating window ID
   */
  static async setFloatingWindowId(windowId: number): Promise<void> {
    await chrome.storage.local.set({ floatingWindowId: windowId });
  }

  /**
   * Remove floating window ID
   */
  static async removeFloatingWindowId(): Promise<void> {
    await chrome.storage.local.remove(["floatingWindowId"]);
  }

  /**
   * Get clipboard sync queue
   */
  static async getClipboardSyncQueue(): Promise<QueueState> {
    const result = await chrome.storage.local.get(["clipboardSyncQueue"]);
    const queue = result.clipboardSyncQueue;
    if (queue && typeof queue === "object" && "items" in queue) {
      return queue as QueueState;
    }
    return { items: [], processing: false };
  }

  /**
   * Set clipboard sync queue
   */
  static async setClipboardSyncQueue(queue: QueueState): Promise<void> {
    await chrome.storage.local.set({ clipboardSyncQueue: queue });
  }

  /**
   * Get sync in progress flag
   */
  static async getSyncInProgress(): Promise<boolean> {
    const result = await chrome.storage.local.get(["syncInProgress"]);
    return Boolean(result.syncInProgress);
  }

  /**
   * Set sync in progress flag
   */
  static async setSyncInProgress(inProgress: boolean): Promise<void> {
    await chrome.storage.local.set({ syncInProgress: inProgress });
  }

  /**
   * Get auth data (token, user, subscription status)
   */
  static async getAuthData(): Promise<{
    authToken?: string;
    user?: any;
    hasSyncedItems?: boolean;
    subscription?: any;
    planName?: string;
  }> {
    const result = await chrome.storage.local.get([
      "authToken",
      "user",
      "hasSyncedItems",
      "subscription",
      "subscriptionPlanName",
    ]);
    return {
      authToken: result.authToken as string | undefined,
      user: result.user as any,
      hasSyncedItems: result.hasSyncedItems as boolean | undefined,
      subscription: result.subscription as any,
      planName: result.subscriptionPlanName as string | undefined,
    };
  }

  /**
   * Set auth data (token and user)
   */
  static async setAuthData(
    token: string,
    user: any,
    hasSyncedItems?: boolean,
  ): Promise<void> {
    await chrome.storage.local.set({
      authToken: token,
      user: user,
      hasSyncedItems: !!hasSyncedItems,
    });
  }

  /**
   * Get value for a specific key
   */
  static async get<K extends string>(keys: K[]): Promise<Record<K, any>> {
    const result = await chrome.storage.local.get(keys);
    return result as Record<K, any>;
  }

  /**
   * Set value for specific keys
   */
  static async set(items: Record<string, any>): Promise<void> {
    await chrome.storage.local.set(items);
  }
}
