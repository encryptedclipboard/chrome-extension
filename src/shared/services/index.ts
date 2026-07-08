import initAxios from "../utils/init-axios.util";

// Import Service Classes
import { AuthService } from "./auth.service";
import { SubscriptionService } from "./subscription.service";
import { ExtensionService } from "./extension.service";
import { StorageService } from "./extension-storage.service";
import { ClipboardDBService } from "./clipboard-db.service";
import { LockService } from "./lock.service";
import { ClipboardSyncQueueService } from "./clipboard-sync-queue.service";
import { TabService } from "./tab.service";
import { LocalSettingsService } from "./local-settings.service";
import { UserService } from "./user.service";
import { ClipboardPushService } from "./clipboard-push.service";
import { SnippetsDBService } from "./snippets-db.service";
import { ShareService } from "./share.service";
import { ClipboardItemLockService } from "./clipboard-item-lock.service";
import { NotificationService } from "./notification.service";
import { ClipboardSyncService } from "./clipboard-sync.service";
import { RatingService } from "./rating.service";

// Initialize HTTP Client
const http = initAxios();

// Initialize Services (Singletons)
export const authService = new AuthService(http);
export const subscriptionService = new SubscriptionService(http);
export const extensionService = new ExtensionService(http);
export const storageService = new StorageService();
export const clipboardDBService = new ClipboardDBService();

export const lockService = new LockService();
export const clipboardItemLockService = new ClipboardItemLockService();
export const clipboardSyncQueueService = new ClipboardSyncQueueService();
export const tabService = new TabService();
export const localSettingsService = new LocalSettingsService();

export const userService = new UserService(http);
export const clipboardPushService = new ClipboardPushService();
export const snippetsDBService = new SnippetsDBService();
export const shareService = new ShareService(http);
export const notificationService = new NotificationService();
export const clipboardSyncService = new ClipboardSyncService(http);
export const syncService = clipboardSyncService;
export const ratingService = new RatingService();

// Export Classes
export {
  AuthService,
  SubscriptionService,
  ExtensionService,
  StorageService,
  ClipboardDBService,
  SnippetsDBService,
  ShareService,
  NotificationService,
  RatingService,
};

// Default Export Object
const services = {
  auth: authService,
  subscription: subscriptionService,
  extension: extensionService,
  extensionStorage: storageService,
  clipboardDB: clipboardDBService,
  lock: lockService,
  snippetsDB: snippetsDBService,
  clipboardItemLock: clipboardItemLockService,
  clipboardSyncQueue: clipboardSyncQueueService,
  tab: tabService,
  localSettings: localSettingsService,
  user: userService,
  share: shareService,
  notification: notificationService,
  rating: ratingService,
};

export default services;
