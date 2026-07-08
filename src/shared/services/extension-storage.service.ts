import { Theme } from "../enums/theme.enum";
import type { IUserResponse, IUserSubscriptionResponse } from "@shared/types";

/**
 * Type-safe storage keys for extension storage
 */
export interface ExtensionStorageKeys {
  // Auth related
  authToken: string;
  user: IUserResponse;
  authError: string | null;
  lastActiveUserId: string | null;
  hasSyncedItems?: boolean;
  subscription: IUserSubscriptionResponse | null;
  subscriptionPlanName: string;

  // Theme
  theme: Theme;

  // Settings
  sidebarShortcut: string;
  closeModalAfterAdd: boolean;
  cbPaletteShortcut: import("@shared/types/shortcut.types").KeyboardShortcut;
  elementPickerShortcut: import("@shared/types/shortcut.types").KeyboardShortcut;
  filterShortcut: import("@shared/types/shortcut.types").KeyboardShortcut;

  // E2E Encryption
  e2ePasswordHash: string;
  e2ePasswordSet: boolean;
  e2eMasterPasswordEncrypted?: {
    ciphertext: string;
    iv: string;
    authTag: string;
  };
  e2eMasterPasswordPinEncrypted?: {
    ciphertext: string;
    iv: string;
    salt: string;
    authTag: string;
  };

  // Sync token
  syncToken: string;

  // Clipboard sync settings
  clipboardAutoSync: boolean;
  clipboardMasterPasswordSet: boolean;
  lastSyncTimestamp: number;
  lastSyncStatus: "success" | "error" | "waiting" | "paused" | null;
  lastSyncError: string | null;
  clipboardSyncedCount: number;
  clipboardSyncQueue: any; // Queue state for retry service
  hasPendingCloudItems?: boolean; // Flag for manual sync notification
  clipboardDisableImageSync?: boolean; // Setting to disable image sync
  clipboardDisableUploadToCloud?: boolean; // Setting to disable uploading items to cloud
  totalCloudItems?: number; // Total items on cloud (for UI display)
  pushServiceFailure?: boolean; // Flag to indicate if push service (GCM) is unavailable
  syncInProgress?: boolean; // Flag for sync in progress
  settings?: {
    monitoringEnabled?: boolean;
    showNotificationOnSync?: boolean;
    autoCleanupDays?: number;
    smartBlurConfidential?: boolean;
    smartBlurImages?: boolean;
    autoWriteSyncToClipboard?: boolean;
    itemsPerPage?: number;
  };
  clipboardLocked?: boolean;
  clipboard_settings?: {
    smartBlurConfidential?: boolean;
  };
}

/**
 * Type-safe sync storage keys
 */
export interface ExtensionSyncStorageKeys {
  // Sidebar settings per domain
  [key: `sidebar_enabled_${string}`]: boolean;

  // Sidebar position per domain
  [key: `sidebar_position_${string}`]: { x: number; y: number };
}

/**
 * Extension Storage Service
 * Provides type-safe access to browser.storage.local and browser.storage.sync
 * with strongly-typed methods for common storage operations
 */
export class StorageService {
  // ===== LOCAL STORAGE METHODS =====

  /**
   * Get auth data (token, user, subscription status)
   */
  async getAuthData(): Promise<{
    authToken?: string;
    user?: IUserResponse;
    hasSyncedItems?: boolean;
    subscription?: IUserSubscriptionResponse;
    planName?: string;
  }> {
    const result = await chrome.storage.local.get([
      "authToken",
      "user",
      "hasSyncedItems",
      "subscription",
      "subscriptionPlanName", // Use consistent key for storage
    ]);
    return {
      authToken: result.authToken as string | undefined,
      user: result.user as IUserResponse | undefined,
      hasSyncedItems: result.hasSyncedItems as boolean | undefined,
      subscription: result.subscription as
        | IUserSubscriptionResponse
        | undefined,
      planName: result.subscriptionPlanName as string | undefined,
    };
  }

  /**
   * Set auth data (token and user)
   */
  async setAuthData(
    token: string,
    user: IUserResponse,
    hasSyncedItems?: boolean,
  ): Promise<void> {
    await chrome.storage.local.set({
      authToken: token,
      user: user,
      hasSyncedItems: !!hasSyncedItems,
    });
  }

  /**
   * Update user data only
   */
  async updateUser(user: IUserResponse): Promise<void> {
    await chrome.storage.local.set({ user });
  }

  /**
   * Set subscription data
   */
  async setSubscription(
    subscription: IUserSubscriptionResponse | null,
    planName?: string,
  ): Promise<void> {
    await chrome.storage.local.set({
      subscription,
      subscriptionPlanName: planName,
    });
  }

  /**
   * Clear auth data (logout)
   */
  async clearAuthData(): Promise<void> {
    await chrome.storage.local.remove([
      "authToken",
      "user",
      "hasSyncedItems",
      "subscription",
      "subscriptionPlanName",
      "clipboardAutoSync",
    ]);
  }

  /**
   * Get theme preference
   */
  async getTheme(): Promise<Theme | undefined> {
    const result = await chrome.storage.local.get(["theme"]);
    return result.theme as Theme | undefined;
  }

  /**
   * Set theme preference
   */
  async setTheme(theme: Theme): Promise<void> {
    await chrome.storage.local.set({ theme });
  }

  /**
   * Get sidebar shortcut
   */
  async getSidebarShortcut(): Promise<string | undefined> {
    const result = await chrome.storage.local.get(["sidebarShortcut"]);
    return result.sidebarShortcut as string | undefined;
  }

  /**
   * Set sidebar shortcut
   */
  async setSidebarShortcut(shortcut: string): Promise<void> {
    await chrome.storage.local.set({ sidebarShortcut: shortcut });
  }

  /**
   * Remove sidebar shortcut
   */
  async removeSidebarShortcut(): Promise<void> {
    await chrome.storage.local.remove(["sidebarShortcut"]);
  }

  /**
   * Get close modal after add setting
   */
  async getCloseModalAfterAdd(): Promise<boolean | undefined> {
    const result = await chrome.storage.local.get(["closeModalAfterAdd"]);
    return result.closeModalAfterAdd as boolean | undefined;
  }

  /**
   * Set close modal after add setting
   */
  async setCloseModalAfterAdd(value: boolean): Promise<void> {
    await chrome.storage.local.set({ closeModalAfterAdd: value });
  }

  /**
   * Get clipboard palette shortcut
   */
  async getCbPaletteShortcut(): Promise<
    import("@shared/types/shortcut.types").KeyboardShortcut | undefined
  > {
    const result = await chrome.storage.local.get(["cbPaletteShortcut"]);
    return result.cbPaletteShortcut as
      | import("@shared/types/shortcut.types").KeyboardShortcut
      | undefined;
  }

  /**
   * Set clipboard palette shortcut
   */
  async setCbPaletteShortcut(
    shortcut: import("@shared/types/shortcut.types").KeyboardShortcut,
  ): Promise<void> {
    await chrome.storage.local.set({ cbPaletteShortcut: shortcut });
  }

  /**
   * Get element picker shortcut
   */
  async getElementPickerShortcut(): Promise<
    import("@shared/types/shortcut.types").KeyboardShortcut | undefined
  > {
    const result = await chrome.storage.local.get(["elementPickerShortcut"]);
    return result.elementPickerShortcut as
      | import("@shared/types/shortcut.types").KeyboardShortcut
      | undefined;
  }

  /**
   * Set element picker shortcut
   */
  async setElementPickerShortcut(
    shortcut: import("@shared/types/shortcut.types").KeyboardShortcut,
  ): Promise<void> {
    await chrome.storage.local.set({ elementPickerShortcut: shortcut });
  }

  /**
   * Get filter shortcut
   */
  async getFilterShortcut(): Promise<
    import("@shared/types/shortcut.types").KeyboardShortcut | undefined
  > {
    const result = await chrome.storage.local.get(["filterShortcut"]);
    return result.filterShortcut as
      | import("@shared/types/shortcut.types").KeyboardShortcut
      | undefined;
  }

  /**
   * Set filter shortcut
   */
  async setFilterShortcut(
    shortcut: import("@shared/types/shortcut.types").KeyboardShortcut,
  ): Promise<void> {
    await chrome.storage.local.set({ filterShortcut: shortcut });
  }

  /**
   * Get both sidebar settings
   */
  async getSidebarSettings(): Promise<{
    sidebarShortcut?: string;
    closeModalAfterAdd?: boolean;
  }> {
    const result = await chrome.storage.local.get([
      "sidebarShortcut",
      "closeModalAfterAdd",
    ]);
    return {
      sidebarShortcut: result.sidebarShortcut as string | undefined,
      closeModalAfterAdd: result.closeModalAfterAdd as boolean | undefined,
    };
  }

  /**
   * Get E2E password hash and set flag
   */
  async getE2EPasswordData(): Promise<{
    e2ePasswordHash?: string;
    e2ePasswordSet?: boolean;
  }> {
    const result = await chrome.storage.local.get([
      "e2ePasswordHash",
      "e2ePasswordSet",
    ]);
    return {
      e2ePasswordHash: result.e2ePasswordHash as string | undefined,
      e2ePasswordSet: result.e2ePasswordSet as boolean | undefined,
    };
  }

  /**
   * Set E2E password data
   */
  async setE2EPasswordData(hash: string, isSet: boolean): Promise<void> {
    await chrome.storage.local.set({
      e2ePasswordHash: hash,
      e2ePasswordSet: isSet,
    });
  }

  /**
   * Clear E2E password data
   */
  async clearE2EPasswordData(): Promise<void> {
    await chrome.storage.local.remove(["e2ePasswordHash", "e2ePasswordSet"]);
  }

  /**
   * Get sync token
   */
  async getSyncToken(): Promise<string | undefined> {
    const result = await chrome.storage.local.get(["syncToken"]);
    return result.syncToken as string | undefined;
  }

  /**
   * Set sync token
   */
  async setSyncToken(token: string): Promise<void> {
    await chrome.storage.local.set({ syncToken: token });
  }

  /**
   * Get user data only
   */
  async getUser(): Promise<IUserResponse | undefined> {
    const result = await chrome.storage.local.get(["user"]);
    return result.user as IUserResponse | undefined;
  }

  /**
   * Get auth token only
   */
  async getAuthToken(): Promise<string | undefined> {
    const result = await chrome.storage.local.get(["authToken"]);
    return result.authToken as string | undefined;
  }

  // ===== EXTENSION SPECIFIC METHODS =====

  /**
   * Get settings object (monitoringEnabled, showNotificationOnSync, autoCleanupDays, etc.)
   */
  async getSettings(): Promise<ExtensionStorageKeys["settings"] | undefined> {
    const result = await chrome.storage.local.get(["settings"]);
    return result.settings as ExtensionStorageKeys["settings"] | undefined;
  }

  /**
   * Set settings object
   */
  async setSettings(settings: ExtensionStorageKeys["settings"]): Promise<void> {
    if (!settings) return;
    await chrome.storage.local.set({ settings });
  }

  /**
   * Get floating window ID
   */
  async getFloatingWindowId(): Promise<number | undefined> {
    const result = await chrome.storage.local.get(["floatingWindowId"]);
    return result.floatingWindowId as number | undefined;
  }

  /**
   * Set floating window ID
   */
  async setFloatingWindowId(windowId: number): Promise<void> {
    await chrome.storage.local.set({ floatingWindowId: windowId });
  }

  /**
   * Remove floating window ID
   */
  async removeFloatingWindowId(): Promise<void> {
    await chrome.storage.local.remove(["floatingWindowId"]);
  }

  /**
   * Get clipboard sync queue
   */
  async getClipboardSyncQueue(): Promise<any> {
    const result = await chrome.storage.local.get(["clipboardSyncQueue"]);
    return result.clipboardSyncQueue;
  }

  /**
   * Set clipboard sync queue
   */
  async setClipboardSyncQueue(queue: any): Promise<void> {
    await chrome.storage.local.set({ clipboardSyncQueue: queue });
  }

  /**
   * Get sync in progress flag
   */
  async getSyncInProgress(): Promise<boolean> {
    const result = await chrome.storage.local.get(["syncInProgress"]);
    return result.syncInProgress as boolean;
  }

  /**
   * Set sync in progress flag
   */
  async setSyncInProgress(inProgress: boolean): Promise<void> {
    await chrome.storage.local.set({ syncInProgress: inProgress });
  }

  // ===== SYNC STORAGE METHODS =====

  /**
   * Get sidebar enabled status for a specific domain
   */
  async getSidebarEnabledForDomain(domain: string): Promise<boolean> {
    const key = `sidebar_enabled_${domain}`;
    const result = await chrome.storage.sync.get([key]);
    // Default to true if not set
    return result[key] !== false;
  }

  /**
   * Set sidebar enabled status for a specific domain
   */
  async setSidebarEnabledForDomain(
    domain: string,
    enabled: boolean,
  ): Promise<void> {
    const key = `sidebar_enabled_${domain}`;
    await chrome.storage.sync.set({ [key]: enabled });
  }

  /**
   * Get sidebar position for a specific domain
   */
  async getSidebarPositionForDomain(
    domain: string,
  ): Promise<{ x: number; y: number } | undefined> {
    const key = `sidebar_position_${domain}`;
    const result = await chrome.storage.sync.get([key]);
    return result[key] as { x: number; y: number } | undefined;
  }

  /**
   * Set sidebar position for a specific domain
   */
  async setSidebarPositionForDomain(
    domain: string,
    position: { x: number; y: number },
  ): Promise<void> {
    const key = `sidebar_position_${domain}`;
    await chrome.storage.sync.set({ [key]: position });
  }

  // ===== NOTCH SETTINGS =====

  /**
   * Get notch Y position for a specific hostname
   */
  async getNotchPosition(hostname: string): Promise<number | undefined> {
    const key = `notch_position_${hostname}`;
    const result = await chrome.storage.sync.get([key]);
    return result[key] as number | undefined;
  }

  /**
   * Set notch Y position for a specific hostname
   */
  async setNotchPosition(hostname: string, topPercent: number): Promise<void> {
    const key = `notch_position_${hostname}`;
    await chrome.storage.sync.set({ [key]: topPercent });
  }

  /**
   * Check if notch is disabled for a specific hostname
   */
  async isNotchDisabled(hostname: string): Promise<boolean> {
    const key = `notch_disabled_${hostname}`;
    const result = await chrome.storage.sync.get([key]);
    return result[key] === true;
  }

  /**
   * Set notch enabled/disabled for a specific hostname
   */
  async setNotchDisabled(hostname: string, disabled: boolean): Promise<void> {
    const key = `notch_disabled_${hostname}`;
    await chrome.storage.sync.set({ [key]: disabled });
  }

  /**
   * Get all hostnames where notch is disabled
   */
  async getNotchDisabledSites(): Promise<string[]> {
    const result = await chrome.storage.sync.get(null);
    const disabledSites: string[] = [];
    for (const key of Object.keys(result)) {
      if (key.startsWith("notch_disabled_") && result[key] === true) {
        disabledSites.push(key.replace("notch_disabled_", ""));
      }
    }
    return disabledSites;
  }

  /**
   * Remove notch disabled status for a hostname (re-enable)
   */
  async removeNotchDisabled(hostname: string): Promise<void> {
    const key = `notch_disabled_${hostname}`;
    await chrome.storage.sync.remove([key]);
  }

  /**
   * Generic get from local storage (for edge cases)
   */
  async getLocal<K extends keyof ExtensionStorageKeys>(
    key: K,
  ): Promise<ExtensionStorageKeys[K] | undefined> {
    const result = await chrome.storage.local.get([key as string]);
    return result[key as string] as ExtensionStorageKeys[K] | undefined;
  }

  /**
   * Generic set in local storage (for edge cases)
   */
  async setLocal<K extends keyof ExtensionStorageKeys>(
    key: K,
    value: ExtensionStorageKeys[K],
  ): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  /**
   * Get master password status
   */
  async getMasterPasswordStatus(): Promise<boolean> {
    const result = await chrome.storage.local.get([
      "clipboardMasterPasswordSet",
    ]);
    return result.clipboardMasterPasswordSet === true;
  }

  /**
   * Generic remove from local storage
   */
  async removeLocal(keys: (keyof ExtensionStorageKeys)[]): Promise<void> {
    await chrome.storage.local.remove(keys as string[]);
  }

  /**
   * Generic get multiple keys from local storage
   */
  async get<K extends keyof ExtensionStorageKeys>(
    keys: K[],
  ): Promise<Partial<Pick<ExtensionStorageKeys, K>>> {
    const result = await chrome.storage.local.get(keys as string[]);
    return result as Partial<Pick<ExtensionStorageKeys, K>>;
  }

  /**
   * Generic set multiple keys in local storage
   */
  async set(items: Partial<ExtensionStorageKeys>): Promise<void> {
    await chrome.storage.local.set(items);
  }
}
