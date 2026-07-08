import { AsyncMutex } from "@shared/utils/mutex.util";
import { SyncStatus } from "@shared/enums/sync-status.enum";
import { ClipboardItemType } from "@shared/enums/clipboard-item-type.enum";
import type { ClipboardItem } from "@shared/types/db.types";
import type { ServerClipboardItem } from "@shared/types/clipboard.types";
import { SyncStage } from "@shared/enums";
import { FullSyncOptions } from "@shared/types";
import {
  sendSyncProgress,
  sendSynced,
  sendNewItemsAvailable,
  sendItemBatchUpdated,
  sendItemsUpdated,
  sendToast,
} from "@shared/utils/message.utils";
import {
  syncService,
  storageService,
  lockService,
  notificationService,
  thumbnailService,
} from ".";
import { updateBadge } from "../utils/badge.util";
import { SyncDeletionService } from "./sync-deletion.service";
import { SyncDownloadService } from "./sync-download.service";
import { SyncUploadService } from "./sync-upload.service";
import { SyncReconciliationService } from "./sync-reconciliation.service";
import { SyncProcessorService } from "./sync-processor.service";
import { SyncUploadProcessorService } from "./sync-upload-processor.service";
import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { STORAGE_KEY_MPC } from "@shared/services/mpc.service";

export class SyncOrchestratorService extends ClipboardDBService {
  constructor() {
    super();
  }

  private deletionService = new SyncDeletionService();
  private downloadService = new SyncDownloadService();
  private uploadService = new SyncUploadService();
  private reconciliationService = new SyncReconciliationService();
  private processorService = new SyncProcessorService();

  // Exposed for handlers to read decryption/upload failures after sync completes
  public lastSyncDecryptionFailures: string[] = [];
  public lastSyncUploadFailures: string[] = [];

  // Mutex for serializing sync operations
  private syncMutex = new AsyncMutex();

  // Tracks whether a real (non-checkOnly, non-auto) sync is in progress
  private syncType: "none" | "checkOnly" | "auto" | "full" = "none";

  // Streaming pipeline state
  private totalDownloadItems = 0;
  private processedDownloadCount = 0;

  getSyncProgress(): { processed: number; total: number } {
    return {
      processed: this.processorService.getProcessedCount(),
      total: this.totalDownloadItems,
    };
  }

  /**
   * Perform Full Sync
   * Wrapped in mutex to prevent concurrent syncs (Race Condition Fix)
   */
  async performFullSync(options?: FullSyncOptions) {
    console.log("[Sync] performFullSync called:", {
      checkOnly: !!options?.checkOnly,
      silent: !!options?.silent,
      isManual: !!options?.isManual,
      skipFetch: !!options?.skipFetch,
    });
    return this.syncMutex.runExclusive(async () => {
      console.log("[Sync] Mutex acquired - executing sync");
      this.syncType = options?.checkOnly
        ? "checkOnly"
        : options?.silent
          ? "auto"
          : "full";
      try {
        await this._performFullSyncInternal(options);
      } finally {
        this.syncType = "none";
      }
    });
  }

  /**
   * Check if a real (non-checkOnly) sync is currently in progress
   */
  public isSyncing(): boolean {
    return this.syncType === "full";
  }

  /**
   * Helper to emit progress (delegated to UI)
   */
  private emitProgress(
    stage: SyncStage,
    current?: number,
    total?: number,
    message?: string,
    skipUI?: boolean,
  ) {
    if (skipUI) return;
    sendSyncProgress({ stage, current, total, message });
  }

  private async getItemsNeedingThumbnails(): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const items: ClipboardItem[] = [];
    const images = await db.getAllFromIndex(
      "clipboard_items",
      "by-type",
      ClipboardItemType.IMAGE,
    );
    for (const item of images) {
      if (
        !item.isDeleted &&
        !item.thumbnail &&
        typeof item.content === "string" &&
        item.content.startsWith("data:image")
      ) {
        items.push(item);
      }
    }
    return items;
  }

  private async generateThumbnails(items: ClipboardItem[]): Promise<void> {
    const imagesNeedingThumbnails = items.filter(
      (item) =>
        item.type === ClipboardItemType.IMAGE &&
        !item.thumbnail &&
        typeof item.content === "string" &&
        item.content.startsWith("data:image"),
    );

    if (imagesNeedingThumbnails.length === 0) return;

    const MAX_CONCURRENT = 2;
    let completedCount = 0;
    let activeCount = 0;
    const queue = [...imagesNeedingThumbnails];
    const batchUpdates: Array<{ id: string; changes: { thumbnail: string } }> =
      [];
    let failedCount = 0;

    while (queue.length > 0 || activeCount > 0) {
      while (queue.length > 0 && activeCount < MAX_CONCURRENT) {
        const item = queue.shift()!;
        activeCount++;

        thumbnailService
          .generateThumbnailForContent(item.content!)
          .then(async (thumbnail) => {
            activeCount--;
            completedCount++;

            if (thumbnail) {
              try {
                await this.updateItem(item.id, { thumbnail });
                batchUpdates.push({ id: item.id, changes: { thumbnail } });
              } catch (e) {
                console.warn(
                  `[SyncOrchestrator] Failed to save thumbnail for ${item.id}:`,
                  e,
                );
              }
            }
          })
          .catch((err) => {
            activeCount--;
            completedCount++;
            failedCount++;
            console.warn(
              `[SyncOrchestrator] Thumbnail generation failed for ${item.id}:`,
              err,
            );
          });
      }

      if (activeCount > 0) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (batchUpdates.length > 0) {
      this.emitProgress(
        SyncStage.THUMBNAIL_GENERATING,
        batchUpdates.length,
        batchUpdates.length,
        `Generating thumbnails ${batchUpdates.length}/${batchUpdates.length}...`,
      );
      sendItemBatchUpdated({ items: batchUpdates });
    }

    if (failedCount > 0) {
      sendToast({
        type: "warning",
        message: `Failed to generate thumbnails for ${failedCount} image${failedCount > 1 ? "s" : ""}`,
      });
    }
  }

  /**
   * Internal Sync Logic (Protected by Mutex)
   */
  private async _performFullSyncInternal(options?: FullSyncOptions) {
    // Block sync if clipboard is locked or lock in progress (unless explicitly ignored)
    const isLocked =
      (await lockService.isLockActive()) || lockService.isLockInProgress();
    if (!options?.ignoreLock && isLocked) {
      console.log("[Sync] Exiting - lock is active");
      return;
    }

    // Block sync if master password change is in progress (unless this is part of the change)
    if (!options?.mpc) {
      const storage = (await chrome.storage.local.get([
        STORAGE_KEY_MPC,
      ])) as Record<string, { inProgress?: boolean }>;
      if (storage[STORAGE_KEY_MPC]?.inProgress) {
        console.log(
          "[Sync] Exiting - MPC in progress",
          storage[STORAGE_KEY_MPC],
        );
        return;
      }
    }

    try {
      // Mark sync as in progress
      await storageService.set({ syncInProgress: true });

      // Show progress immediately so modal appears without delay
      if (!options?.checkOnly) {
        sendSyncProgress({
          stage: SyncStage.DOWNLOADING,
          current: 0,
          total: 100,
          message: "Starting...",
        });
        console.log("[Sync] Early progress emitted at 0%");
      }

      // 1. Get settings and auth
      const settings = await storageService.get([
        "clipboardAutoSync",
        "lastSyncTimestamp",
      ]);
      const authData = await storageService.getAuthData();

      console.log("[Sync] Auth check:", {
        hasAuth: !!authData?.authToken,
        checkOnly: !!options?.checkOnly,
        skipFetch: !!options?.skipFetch,
        isManual: !!options?.isManual,
      });

      if (!authData?.authToken) {
        console.log("[Sync] Exiting - no auth token");
        await storageService.set({ syncInProgress: false });
        return;
      }

      const lastSync = settings.lastSyncTimestamp || 0;
      const after = lastSync || 0;

      // 2. Determine Capability & Intent
      const abilities =
        (authData.subscription?.planDetails?.abilities as string[]) || [];
      const hasAutoSyncAbility = abilities.includes("auto_sync");
      const isAutoSyncEnabled = settings.clipboardAutoSync === true;

      const shouldProcessAdditions =
        !options?.checkOnly &&
        !options?.skipFetch &&
        ((hasAutoSyncAbility && isAutoSyncEnabled) || !!options?.isManual);

      const shouldProcessDeletions =
        !options?.checkOnly &&
        !options?.skipFetch &&
        (!hasAutoSyncAbility || isAutoSyncEnabled || !!options?.isManual);

      const skipUI = options?.checkOnly || options?.silent;

      // 3. Fetch changes
      const items: ServerClipboardItem[] = [];
      const tombstones: string[] = [];
      let timestamp = 0;
      let pendingAdditionsDetected = false;

      console.log(
        "[Sync] Starting reconciliation - first HTTP request pending",
        {
          shouldProcessAdditions,
          shouldProcessDeletions,
        },
      );

      // [RECOVERY] Detect "Fresh Start"
      console.log("[Sync] Before getSyncedCount");
      const localCount = await this.getSyncedCount();
      console.log("[Sync] After getSyncedCount:", localCount);
      const isFreshStart =
        options?.isManual &&
        !options?.skipFetch &&
        localCount === 0 &&
        lastSync > 0;

      // Optimize: Process local deletions FIRST
      await this.deletionService.processPendingDeletions();

      // Set up streaming pipeline state
      this.totalDownloadItems = 0;
      this.processedDownloadCount = 0;
      let streamEnded = false;
      const isStreamEnded = () => streamEnded;
      let processorRunning = false;
      let processorPromise: Promise<void> | null = null;

      const startProcessor = () => {
        if (processorRunning) return;
        processorRunning = true;
        processorPromise = new Promise<void>((resolve, reject) => {
          this.processorService.setCallbacks(
            (processed) => {
              sendSyncProgress({
                stage: SyncStage.DOWNLOADING,
                current: processed,
                total: this.totalDownloadItems || processed,
                message: `Downloaded ${processed} of ${this.totalDownloadItems} items`,
              });
            },
            () => {
              processorRunning = false;
              resolve();
            },
            (failedIds) => {
              this.lastSyncDecryptionFailures = failedIds;
            },
            (ids) => {
              sendItemsUpdated(ids);
              updateBadge(this, lockService).catch(() => {});
            },
          );
          this.processorService
            .processAll(isStreamEnded)
            .then(resolve)
            .catch((err) => {
              processorRunning = false;
              console.error("[SyncOrchestrator] Processor failed:", err);
              sendSyncProgress({
                stage: SyncStage.ERROR,
                current: 0,
                total: 0,
                message: "Sync failed - processor error",
              });
              reject(err);
            });
        });
      };

      const onChunk = async (chunk: ServerClipboardItem[]) => {
        await this.downloadService.saveRawChunk(chunk);
        this.processedDownloadCount += chunk.length;
        await updateBadge(this, lockService);
        startProcessor();
      };

      const onTotal = (total: number) => {
        this.totalDownloadItems = total;
        sendSyncProgress({
          stage: SyncStage.DOWNLOADING,
          current: 1,
          total: total || 1,
          message: `Downloading 0 of ${total} items`,
        });
      };

      if (isFreshStart) {
        await this.reconciliationService.performSmartSync(
          items,
          tombstones,
          onChunk,
          onTotal,
        );

        streamEnded = true;
        try {
          if (processorPromise) await processorPromise;
        } finally {
          await this.clearSyncStore();
        }
        timestamp = Date.now();
      } else if (shouldProcessAdditions || shouldProcessDeletions) {
        await this.reconciliationService.performSmartSync(
          items,
          tombstones,
          onChunk,
          onTotal,
        );

        streamEnded = true;
        try {
          if (processorPromise) await processorPromise;
        } finally {
          await this.clearSyncStore();
        }
        timestamp = Date.now();
      } else if (options?.checkOnly) {
        // [CHECK ONLY] Metadata only
        const result = await this.reconciliationService.checkUpdates(after);
        if (!result) {
          await storageService.set({ syncInProgress: false });
          return;
        }

        const checkTombstones = result.changes
          .filter((c: any) => c.isDeleted)
          .map((c: any) => c._id);

        if (checkTombstones.length > 0) {
          tombstones.push(...checkTombstones);
        }

        const candidates = result.changes.filter(
          (c: any) => !c.isDeleted && !c.deletedAt,
        );

        const newItems: any[] = [];
        for (const candidate of candidates) {
          const localItem = await this.getItemByServerId(candidate._id);
          const serverTime = new Date(candidate.updatedAt).getTime();
          if (!localItem || localItem.updatedAt < serverTime) {
            newItems.push(candidate);
          }
        }

        if (newItems.length > 0) {
          pendingAdditionsDetected = true;
          await storageService.set({ hasPendingCloudItems: true });
        }
        timestamp = result.timestamp;
      }

      // Always update total cloud count
      try {
        const stats = await syncService.getStats();
        await storageService.set({ totalCloudItems: stats.total });
      } catch (statsError) {}

      // 5. Process Deletions
      let skippedDeletions = 0;
      if (tombstones.length > 0) {
        if (shouldProcessDeletions) {
          this.emitProgress(
            SyncStage.PROCESSING,
            0,
            tombstones.length,
            "Processing deletions...",
            skipUI,
          );
          let deleteProgress = 0;
          await this.deleteItemsByServerIds(tombstones, (cur, total) => {
            if (cur === total || cur - deleteProgress >= 5) {
              deleteProgress = cur;
              this.emitProgress(
                SyncStage.PROCESSING,
                cur,
                total,
                `Deleting ${cur}/${total}...`,
                skipUI,
              );
            }
          });
          await updateBadge(this, lockService);
          sendSynced({ changeType: "deleted", itemIds: tombstones });
        } else {
          skippedDeletions = tombstones.length;
        }
      }

      // 5. Process Additions - handle remaining items after streaming (if any)
      let shouldUpdateTimestamp = true;

      // Process remaining items (< CHUNK_SIZE) from streaming, or all items from fetchBatch
      if (shouldProcessAdditions && items.length > 0) {
        // For items from fetchBatch (< 20), run filterNewItems to detect upload candidates
        const { downloadItems, uploadItems } =
          await this.downloadService.filterNewItems(items);

        for (const localItemId of uploadItems) {
          await this.updateSyncStatus(localItemId, SyncStatus.LOCAL);
        }

        if (downloadItems.length > 0) {
          const saved = await this.downloadService.processChunk(downloadItems);

          await updateBadge(this, lockService);
          sendSynced({ changeType: "added", itemIds: saved.map((i) => i.id) });
        }

        await storageService.set({ hasPendingCloudItems: false });

        if (skippedDeletions > 0) {
          shouldUpdateTimestamp = false;
        }
      } else if (!shouldProcessAdditions && items.length > 0) {
        pendingAdditionsDetected = true;
        await storageService.set({ hasPendingCloudItems: true });
        sendNewItemsAvailable();
      }

      // Generate thumbnails for image items saved during sync (download only)
      if (!options?.skipFetch) {
        const needsThumbnail = await this.getItemsNeedingThumbnails();
        if (needsThumbnail.length > 0 && !skipUI) {
          await this.generateThumbnails(needsThumbnail);
        }
      }

      // 6. Push Changes
      const uploadSettings = await storageService.get([
        "clipboardDisableUploadToCloud",
        "clipboardAutoSync",
      ]);

      // Strict Skip Conditions:
      // 1. checkOnly mode (Metadata check only)
      // 2. Global Upload Disable Setting
      // 3. Explicit skipPush flag
      // 4. Auto-Sync is OFF AND it's not a manual sync

      const isAutoSyncOff = !uploadSettings.clipboardAutoSync;
      const isManual = !!options?.isManual;

      const shouldSkipPush =
        options?.checkOnly ||
        uploadSettings.clipboardDisableUploadToCloud ||
        options?.skipPush ||
        (isAutoSyncOff && !isManual);

      if (!shouldSkipPush) {
        // Force manual behavior (upload all 'local' items) if this is the first sync
        const isFirstSync = lastSync === 0;
        const uploadIsManual = options?.isManual || isFirstSync;

        try {
          // 1. Setup + updates
          const { result: uploadResult, creations } =
            await this.uploadService.prepareUpload(
              uploadIsManual,
              authData,
              (stage, current, total, message) =>
                this.emitProgress(
                  stage,
                  current,
                  total,
                  message,
                  options?.checkOnly || options?.silent,
                ),
              options?.mpc,
            );

          // 2. Parallel encryption + upload pipeline for creations
          if (creations.length > 0) {
            const uploadProcessor = new SyncUploadProcessorService();
            let isEncryptionComplete = false;
            const checkEncryptionComplete = () => isEncryptionComplete;
            let processorPromise: Promise<void> | null = null;
            let processorRunning = false;

            const startUploadProcessor = () => {
              if (processorRunning) return;
              processorRunning = true;
              const totalCreations = creations.length;

              processorPromise = new Promise<void>((resolve, reject) => {
                uploadProcessor.setCallbacks(
                  (processed) => {
                    const totalItems =
                      options?.mpc?.totalItems || totalCreations;
                    const uploaded = options?.mpc?.totalItems
                      ? options.mpc.totalItems - totalCreations + processed
                      : processed;
                    sendSyncProgress({
                      stage: SyncStage.UPLOADING,
                      current: uploaded,
                      total: totalItems,
                      message: `Uploaded ${uploaded} of ${totalItems} items`,
                    });
                  },
                  () => {
                    processorRunning = false;
                    resolve();
                  },
                  (failedIds) => {
                    this.lastSyncUploadFailures = failedIds;
                  },
                  (savedIds) => {
                    sendItemBatchUpdated({
                      items: savedIds.map((id) => ({
                        id,
                        changes: {
                          syncStatus: SyncStatus.SYNCED,
                          isSynced: true,
                        },
                      })),
                    });
                  },
                );

                uploadProcessor
                  .processAll(
                    checkEncryptionComplete,
                    [10, 20, 25, 50, 50],
                    options?.mpc,
                  )
                  .then(resolve)
                  .catch((err) => {
                    processorRunning = false;
                    console.error(
                      "[SyncOrchestrator] Upload processor failed:",
                      err,
                    );
                    reject(err);
                  });
              });
            };

            // Start consumer, then run producer
            startUploadProcessor();
            await MasterPassUtils.ensurePasswordLoaded();
            const password = MasterPassUtils.getMasterPassword()!;
            const failedEncryptionIds: string[] = [];

            // Clear old temp store when resuming MPC to prevent stale entries
            if (options?.mpc) {
              await this.clearSyncUploadStore().catch(() => {});
            }

            await this.uploadService.encryptToTempStore(
              creations,
              password,
              failedEncryptionIds,
            );

            isEncryptionComplete = true;

            try {
              if (processorPromise) await processorPromise;
            } finally {
              await this.clearSyncUploadStore();
            }

            if (failedEncryptionIds.length > 0) {
              this.lastSyncUploadFailures = failedEncryptionIds;
            }
          }

          if (
            uploadResult.failed > 0 &&
            uploadResult.errors.length > 0 &&
            !options?.silent
          ) {
            for (const error of uploadResult.errors) {
              const category = notificationService.classifyError(error);
              if (await notificationService.canShowNotification(category)) {
                notificationService.show(category);
              }
            }
          }
        } catch (err) {
          await this.clearSyncUploadStore().catch(() => {});
          if (!options?.silent) {
            const category = notificationService.classifyError(err);
            if (await notificationService.canShowNotification(category)) {
              notificationService.show(category);
            }
          }
        }
      }

      if (shouldUpdateTimestamp) {
        await storageService.set({
          lastSyncTimestamp: timestamp,
          lastSyncStatus: "success",
          lastSyncError: null,
          hasPendingCloudItems: false,
        });

        await syncService.updateSyncStatus(timestamp);
      }

      await storageService.set({ syncInProgress: false });

      if (!options?.checkOnly) {
        const wasSilent = !options?.isManual && items.length <= 1;
        // Always send COMPLETE for manual syncs to properly reset progress bar
        // For auto-syncs with few items, we can skip to avoid UI flickering
        const shouldHideComplete = skipUI || (wasSilent && !options?.isManual);

        if (!shouldHideComplete) {
          this.emitProgress(
            SyncStage.COMPLETE,
            100,
            100,
            "Sync complete",
            shouldHideComplete,
          );
        } else {
          sendSyncProgress({
            stage: SyncStage.COMPLETE,
            current: 100,
            total: 100,
            message: "",
          });
        }
      }
    } catch (error: any) {
      console.error("[SyncOrchestrator] Sync failed:", error);

      const msg = (error.message || "").toLowerCase();
      const isNetworkError =
        !navigator.onLine ||
        error.name === "TypeError" ||
        msg.includes("failed to fetch") ||
        msg.includes("networkerror") ||
        msg.includes("network") ||
        msg.includes("fetch") ||
        msg.includes("stream timeout");

      if (
        isNetworkError &&
        !options?.checkOnly &&
        !options?.silent &&
        !options?.skipRetry
      ) {
        // Save resume state
        await storageService.set({
          lastSyncStatus: "waiting",
          syncInProgress: true,
        });

        // Emit waiting state
        this.emitProgress(
          SyncStage.WAITING_FOR_CONNECTIVITY,
          this.processedDownloadCount,
          this.totalDownloadItems,
          "Waiting for network...",
        );

        // Retry every 30s for up to 5 minutes
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise((r) => setTimeout(r, 30000));

          if (navigator.onLine) {
            this.emitProgress(
              SyncStage.WAITING_FOR_CONNECTIVITY,
              this.processedDownloadCount,
              this.totalDownloadItems,
              "Network restored, retrying...",
            );

            try {
              await this._performFullSyncInternal({
                ...options,
                skipRetry: true,
              });
              return;
            } catch (retryError: any) {
              const retryMsg = (retryError.message || "").toLowerCase();
              const stillOffline =
                !navigator.onLine ||
                retryError.name === "TypeError" ||
                retryMsg.includes("failed to fetch") ||
                retryMsg.includes("network");

              if (!stillOffline) {
                throw retryError;
              }

              this.emitProgress(
                SyncStage.WAITING_FOR_CONNECTIVITY,
                this.processedDownloadCount,
                this.totalDownloadItems,
                "Waiting for network...",
              );
            }
          }
        }

        // Still offline after 5 minutes - emit paused
        this.emitProgress(
          SyncStage.PAUSED,
          this.processedDownloadCount,
          this.totalDownloadItems,
          "Sync paused - tap to resume",
        );

        await storageService.set({
          lastSyncStatus: "paused",
          syncInProgress: false,
        });
        return;
      }

      // Non-network error or silent/checkOnly: existing error behavior
      this.emitProgress(
        SyncStage.ERROR,
        0,
        0,
        error.message,
        options?.checkOnly || options?.silent,
      );

      await storageService.set({
        lastSyncStatus: "error",
        lastSyncError: error.message,
        syncInProgress: false,
      });
    }
  }
}
