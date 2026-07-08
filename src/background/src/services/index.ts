/**
 * Background Services Index
 *
 * All services for background/service worker are initialized here as singletons.
 * Import service instances from this file.
 */

// Import service classes from shared (safe - no axios dependency)
import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import { LocalSettingsService } from "@shared/services/local-settings.service";
import { StorageService } from "@shared/services/extension-storage.service";
import { ClipboardSyncQueueService } from "@shared/services/clipboard-sync-queue.service";
import { LockService } from "@shared/services/lock.service";
import { SnippetsDBService } from "@shared/services/snippets-db.service";

// Import local fetch-based service classes
import { AuthService } from "./auth.service";
import { CloudSyncService } from "./clipboard-sync.service";
import { ClipboardPushService } from "./clipboard-push.service";

import { SyncUploadService } from "./sync-upload.service";
import { SyncDownloadService } from "./sync-download.service";
import { SyncReconciliationService } from "./sync-reconciliation.service";
import { ThumbnailService } from "./thumbnail.service";
import { SyncOrchestratorService } from "./sync-orchestrator.service";
import { FirefoxPollerService } from "./firefox-poller.service";
import { TabManagerService } from "./tab-manager.service";
import { CleanupService } from "./cleanup.service";
import { NotificationService } from "@shared/services/notification.service";
import { CbItemService } from "./cb-item.service";
import { SyncDeletionService } from "./sync-deletion.service";
import { SyncProcessorService } from "./sync-processor.service";
import { SyncUploadProcessorService } from "./sync-upload-processor.service";

// Initialize singleton instances
export const clipboardDBService = new ClipboardDBService();
export const localSettingsService = new LocalSettingsService();
export const storageService = new StorageService();
export const clipboardSyncQueueService = new ClipboardSyncQueueService();
export const lockService = new LockService();
export const snippetsDBService = new SnippetsDBService();

// Local fetch-based services
export const authService = new AuthService();
export const syncService = new CloudSyncService();
export const clipboardPushService = new ClipboardPushService();

export const thumbnailService = new ThumbnailService();
export const syncDeletionService = new SyncDeletionService();
export const syncUploadService = new SyncUploadService();
export const syncDownloadService = new SyncDownloadService();
export const syncReconciliationService = new SyncReconciliationService();
export const cbItemService = new CbItemService();
export const syncOrchestratorService = new SyncOrchestratorService();
export const tabManagerService = new TabManagerService();
export const cleanupService = new CleanupService();
export const notificationService = new NotificationService();
// FirefoxPoller needs args, instantiated in main

// Re-export types needed by consumers
export { ClipboardItemType } from "@shared/enums/clipboard-item-type.enum";
export { FirefoxPollerService };
