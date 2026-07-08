const STORAGE_KEY = "sync_notification_last_shown";
const DEDUP_WINDOW_MS = 30 * 60 * 1000;

export enum NotificationCategory {
  NETWORK_OFFLINE = "network_offline",
  SERVER_ERROR = "server_error",
  AUTH_ERROR = "auth_error",
  SYNC_LIMIT = "sync_limit",
  ENCRYPTION_FAILED = "encryption_failed",
  UPLOAD_FAILED = "upload_failed",
  OTHER = "other",
}

const USER_FRIENDLY_MESSAGES: Record<NotificationCategory, string> = {
  [NotificationCategory.NETWORK_OFFLINE]:
    "Unable to sync. Check your internet connection.",
  [NotificationCategory.SERVER_ERROR]:
    "Server temporarily unavailable. Will retry automatically.",
  [NotificationCategory.AUTH_ERROR]:
    "Authentication failed. Please sign in again.",
  [NotificationCategory.SYNC_LIMIT]:
    "Sync limit reached. Upgrade your plan or delete items.",
  [NotificationCategory.ENCRYPTION_FAILED]:
    "Encryption failed. Please try again.",
  [NotificationCategory.UPLOAD_FAILED]:
    "Failed to upload items. Will retry automatically.",
  [NotificationCategory.OTHER]: "Sync failed. Will retry automatically.",
};

const NOTIFICATION_TITLES: Record<NotificationCategory, string> = {
  [NotificationCategory.NETWORK_OFFLINE]: "Sync Error",
  [NotificationCategory.SERVER_ERROR]: "Sync Error",
  [NotificationCategory.AUTH_ERROR]: "Authentication Error",
  [NotificationCategory.SYNC_LIMIT]: "Sync Limit Reached",
  [NotificationCategory.ENCRYPTION_FAILED]: "Encryption Error",
  [NotificationCategory.UPLOAD_FAILED]: "Upload Failed",
  [NotificationCategory.OTHER]: "Sync Error",
};

export class NotificationService {
  private lastShownCache: Partial<Record<NotificationCategory, number>> = {};

  async init(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      this.lastShownCache = result[STORAGE_KEY] || {};
    } catch (e) {
      this.lastShownCache = {};
    }
  }

  classifyError(error: unknown): NotificationCategory {
    const errorObj = error as any;
    const message = errorObj?.message || "";
    const status = errorObj?.response?.status;
    const statusText = errorObj?.response?.statusText || "";

    if (
      !navigator.onLine ||
      message.includes("Failed to fetch") ||
      message.includes("NetworkError") ||
      message.includes("net::ERR") ||
      message.includes("Network request failed")
    ) {
      return NotificationCategory.NETWORK_OFFLINE;
    }

    if (status >= 500 && status < 600) {
      return NotificationCategory.SERVER_ERROR;
    }

    if (status === 401 || status === 403) {
      return NotificationCategory.AUTH_ERROR;
    }

    if (
      status === 403 ||
      message.includes("limit") ||
      statusText.includes("limit")
    ) {
      return NotificationCategory.SYNC_LIMIT;
    }

    if (
      message.includes("encrypt") ||
      message.includes("crypto") ||
      message.includes("Encryption failed")
    ) {
      return NotificationCategory.ENCRYPTION_FAILED;
    }

    if (message.includes("upload") || message.includes("Upload failed")) {
      return NotificationCategory.UPLOAD_FAILED;
    }

    return NotificationCategory.OTHER;
  }

  async canShowNotification(category: NotificationCategory): Promise<boolean> {
    const lastShown = this.lastShownCache[category];
    const now = Date.now();

    if (!lastShown) {
      return true;
    }

    if (category === NotificationCategory.AUTH_ERROR) {
      return false;
    }

    return now - lastShown > DEDUP_WINDOW_MS;
  }

  async show(
    category: NotificationCategory,
    itemCount?: number,
  ): Promise<void> {
    const canShow = await this.canShowNotification(category);
    if (!canShow) {
      return;
    }

    this.lastShownCache[category] = Date.now();
    await this.persistLastShown();

    const title = NOTIFICATION_TITLES[category];
    let message = USER_FRIENDLY_MESSAGES[category];

    if (itemCount && itemCount > 1) {
      message = message.replace(".", ` (${itemCount} items).`);
    }

    if (itemCount && itemCount === 1) {
      message = message.replace("items", "item").replace(".", ".");
    }

    if (chrome.notifications) {
      chrome.notifications.create(`sync-${category}-${Date.now()}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
        title,
        message,
      });
    }
  }

  async clearAllNotifications(): Promise<void> {
    this.lastShownCache = {};
    await chrome.storage.local.remove(STORAGE_KEY);

    if (chrome.notifications) {
      await chrome.notifications.getAll((notifications) => {
        for (const id in notifications) {
          if (id.startsWith("sync-")) {
            chrome.notifications.clear(id);
          }
        }
      });
    }
  }

  private async persistLastShown(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: this.lastShownCache,
      });
    } catch (e) {
      console.error("[NotificationService] Failed to persist last shown:", e);
    }
  }
}

export const notificationService = new NotificationService();
