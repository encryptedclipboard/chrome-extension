import {
  MessageType,
  ClipboardItemType,
  EncryptedData,
  ClipboardItem,
  SyncProgressMessage,
} from "@shared/types";
import { ServerClipboardItem } from "@shared/types/clipboard.types";
import { SyncStage } from "@shared/enums";
import { SyncStatus } from "@shared/enums/sync-status.enum";
import { thumbnailService, lockService, localSettingsService } from ".";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { EncryptionUtils } from "@shared/utils/encryption.utils";
import { fetchWithAuth } from "@shared/utils/http.utils";
import { updateBadge } from "../utils/badge.util";
import { pMap } from "@shared/utils/concurrency.util";
import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import {
  sendUpdated,
  sendItemsUpdated,
  sendSyncProgress,
  sendInvalidMasterPassword,
  sendItemUpdated,
  sendItemBatchUpdated,
  sendToast,
} from "@shared/utils/message.utils";

/**
 * Sync Download Service
 * Handles decrypting and saving items fetched from the cloud.
 */
export class SyncDownloadService extends ClipboardDBService {
  constructor() {
    super();
  }

  async pullItem(serverItemId: string): Promise<void> {
    try {
      const response = await fetchWithAuth<{
        data: { item: ServerClipboardItem };
      }>(`/clipboard/${serverItemId}`, { method: "GET" });

      const serverItem = response.data?.item;
      if (!serverItem) return;

      const localItem = await this.getItemByServerId(serverItemId);
      if (!localItem) return;

      const isPasswordLoaded = await MasterPassUtils.isPasswordLoaded();
      let content = serverItem.content;

      if (serverItem.encryptionData && isPasswordLoaded) {
        const encryptedData: EncryptedData = {
          ciphertext: serverItem.content,
          iv: serverItem.encryptionData.iv,
          salt: serverItem.encryptionData.salt,
          authTag: serverItem.encryptionData.authTag,
          iterations: serverItem.encryptionData.iterations,
          version: serverItem.encryptionData.version || 1,
        };
        const password = MasterPassUtils.getMasterPassword()!;
        content = await EncryptionUtils.decrypt(encryptedData, password);
      } else if (serverItem.encryptionData && !isPasswordLoaded) {
        return;
      }

      const updatedItem = {
        ...localItem,
        content,
        isFavorite: serverItem.isFavorite ? 1 : 0,
        tags: serverItem.tags,
        metadata: serverItem.metadata,
        updatedAt: new Date(serverItem.updatedAt).getTime(),
      };

      await this.updateItem(localItem.id, updatedItem);

      await updateBadge(this, lockService);

      sendItemUpdated({ itemId: localItem.id });
    } catch (error: unknown) {
      throw error;
    }
  }

  /**
   * Filter out items we already have and are up-to-date
   * Also identifies local items that are newer and need to be pushed to server
   */
  public async filterNewItems(
    items: ServerClipboardItem[],
  ): Promise<{ downloadItems: ServerClipboardItem[]; uploadItems: string[] }> {
    const downloadItems: ServerClipboardItem[] = [];
    const uploadItems: string[] = [];
    const localIdMap = await this.getServerIdMap();

    for (const item of items) {
      if (item.isDeleted) continue;

      const localItem = localIdMap.get(item._id);
      const serverTime = new Date(item.updatedAt).getTime();

      if (!localItem) {
        // No local version exists → download from server
        downloadItems.push(item);
      } else if (localItem.updatedAt < serverTime) {
        // Local is older than server → download (overwrite local)
        downloadItems.push(item);
      } else if (localItem.updatedAt > serverTime) {
        // Local is newer than server → push local to server
        uploadItems.push(localItem.id);
      }
      // If timestamps are equal, skip both (already in sync)
    }
    return { downloadItems, uploadItems };
  }

  /**
   * Process a single chunk of server items: decrypt and save to DB
   * Used by the streaming pipeline - called inline every 100 items
   */
  public async processChunk(
    chunk: ServerClipboardItem[],
  ): Promise<ClipboardItem[]> {
    if (chunk.length === 0) return [];

    const savedItems: ClipboardItem[] = [];
    const isPasswordLoaded = await MasterPassUtils.isPasswordLoaded();
    const password = isPasswordLoaded
      ? MasterPassUtils.getMasterPassword()!
      : null;
    const localIdMap = await this.getServerIdMap();

    // 1. Batch Decryption
    const decryptedResults = new Map<string, string>();
    const decryptedRichResults = new Map<string, string>();
    const failedDecryptionIds: string[] = [];

    if (isPasswordLoaded && password) {
      const encryptedItems: { id: string; data: EncryptedData }[] = [];
      const richEncryptedItems: { id: string; data: EncryptedData }[] = [];

      for (const item of chunk) {
        if ((item as any).isDeleted) continue;
        if (!item.content || item.content.trim() === "" || !item.encryptionData)
          continue;

        encryptedItems.push({
          id: item._id,
          data: {
            ciphertext: item.content,
            iv: item.encryptionData.iv,
            salt: item.encryptionData.salt,
            authTag: item.encryptionData.authTag,
            iterations: item.encryptionData.iterations,
            version: item.encryptionData.version || 1,
          },
        });

        if (item.richContent && item.encryptionData.richAuthTag) {
          richEncryptedItems.push({
            id: item._id,
            data: {
              ciphertext: item.richContent,
              iv: item.encryptionData.iv,
              salt: item.encryptionData.salt,
              authTag: item.encryptionData.richAuthTag,
              iterations: item.encryptionData.iterations,
              version: item.encryptionData.version || 1,
            },
          });
        }
      }

      if (encryptedItems.length > 0) {
        const batchEncryptedList = encryptedItems.map((i) => i.data);
        try {
          const results = await EncryptionUtils.decryptBatch(
            batchEncryptedList,
            password,
          );
          for (let i = 0; i < results.length; i++) {
            if (results[i] !== null) {
              decryptedResults.set(encryptedItems[i].id, results[i]);
            } else {
              failedDecryptionIds.push(encryptedItems[i].id);
            }
          }
        } catch {
          for (const item of encryptedItems) {
            try {
              const result = await EncryptionUtils.decrypt(item.data, password);
              decryptedResults.set(item.id, result);
            } catch {
              failedDecryptionIds.push(item.id);
            }
          }
        }
      }

      if (richEncryptedItems.length > 0) {
        const batchRichList = richEncryptedItems.map((i) => i.data);
        try {
          const richResults = await EncryptionUtils.decryptBatch(
            batchRichList,
            password,
          );
          for (let i = 0; i < richResults.length; i++) {
            if (richResults[i] !== null) {
              decryptedRichResults.set(
                richEncryptedItems[i].id,
                richResults[i],
              );
            }
          }
        } catch {
          for (const item of richEncryptedItems) {
            try {
              const result = await EncryptionUtils.decrypt(item.data, password);
              decryptedRichResults.set(item.id, result);
            } catch {
              // richContent failure is non-fatal
            }
          }
        }
      }
    }

    const failedSet = new Set(failedDecryptionIds);
    const batchForSave: ClipboardItem[] = [];

    // Yield to event loop to prevent SW idle timeout during processing
    await new Promise((r) => setTimeout(r, 0));

    // 2. Build ClipboardItem for each item in the chunk
    for (const item of chunk) {
      if ((item as any).isDeleted) continue;
      if (!item.content || item.content.trim() === "") continue;
      if (failedSet.has(item._id)) continue;
      if (item.encryptionData && !isPasswordLoaded) continue;

      let itemContent = item.content;
      let itemRichContent = item.richContent;

      if (item.encryptionData && isPasswordLoaded && password) {
        if (decryptedResults.has(item._id)) {
          const decrypted = decryptedResults.get(item._id);
          if (decrypted !== undefined) {
            itemContent = decrypted;
          }
        } else {
          const encryptedData: EncryptedData = {
            ciphertext: item.content,
            iv: item.encryptionData.iv,
            salt: item.encryptionData.salt,
            authTag: item.encryptionData.authTag,
            iterations: item.encryptionData.iterations,
            version: item.encryptionData.version || 1,
          };
          itemContent = await EncryptionUtils.decrypt(encryptedData, password);
        }

        if (item.richContent && item.encryptionData.richAuthTag) {
          if (decryptedRichResults.has(item._id)) {
            itemRichContent = decryptedRichResults.get(item._id);
          } else {
            try {
              const richEncryptedData: EncryptedData = {
                ciphertext: item.richContent,
                iv: item.encryptionData.iv,
                salt: item.encryptionData.salt,
                authTag: item.encryptionData.richAuthTag,
                iterations: item.encryptionData.iterations,
                version: item.encryptionData.version || 1,
              };
              itemRichContent = await EncryptionUtils.decrypt(
                richEncryptedData,
                password,
              );
            } catch {
              itemRichContent = undefined;
            }
          }
        }

        if (itemContent !== undefined && itemContent !== null) {
          itemContent =
            typeof itemContent === "string" ? itemContent : String(itemContent);
        }
        if (itemRichContent !== undefined && itemRichContent !== null) {
          itemRichContent =
            typeof itemRichContent === "string"
              ? itemRichContent
              : String(itemRichContent);
        }
      }

      const existingShortItem = localIdMap.get(item._id);
      const id = existingShortItem ? existingShortItem.id : crypto.randomUUID();

      const encryptionData = item.encryptionData
        ? {
            iv: item.encryptionData.iv,
            salt: item.encryptionData.salt,
            authTag: item.encryptionData.authTag,
            richAuthTag: item.encryptionData.richAuthTag,
            version: item.encryptionData.version,
          }
        : undefined;

      const clientItem: ClipboardItem = {
        ...item,
        id,
        _id: item._id,
        content: itemContent,
        richContent: itemRichContent,
        thumbnail: undefined,
        isSynced: true,
        syncStatus: SyncStatus.SYNCED,
        createdAt: new Date(item.createdAt).getTime(),
        updatedAt: new Date(item.updatedAt).getTime(),
        tags: item.tags || [],
        isFavorite: item.isFavorite ? 1 : 0,
        metadata: item.metadata || {},
        isDeleted: false,
        encryptionData,
      };

      batchForSave.push(clientItem);
    }

    // 3. Batch save to IndexedDB
    if (batchForSave.length > 0) {
      // Yield before DB write to keep SW responsive
      await new Promise((r) => setTimeout(r, 0));
      await this.upsertSyncedItems(batchForSave);
      savedItems.push(...batchForSave);

      // 4. Notify sidebar
      const ids: string[] = [];
      for (const item of batchForSave) {
        ids.push(item.id);
      }

      sendItemsUpdated(ids);
    }

    return savedItems;
  }

  /**
   * Save raw server items to the temp sync store for later batch decryption.
   * Faster than full processChunk - used by the streaming pipeline.
   */
  public async saveRawChunk(chunk: ServerClipboardItem[]): Promise<void> {
    if (chunk.length === 0) return;
    await this.saveSyncDownloadedItems(chunk);
  }

  /**
   * Process a batch of server items: Decrypt, Generate Thumbnails, and save to DB
   */
  public async downloadAndSaveItems(
    items: ServerClipboardItem[],
    silent: boolean = false,
  ): Promise<{
    success: number;
    skipCount: number;
    error: number;
    decryptionFailures: string[];
  }> {
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    let decryptionErrorCount = 0;
    const failedDecryptionIds: string[] = [];
    const isPasswordLoaded = await MasterPassUtils.isPasswordLoaded();
    const password = isPasswordLoaded
      ? MasterPassUtils.getMasterPassword()!
      : null;
    const localIdMap = await this.getServerIdMap();

    // 1. Batch Decryption - chunked with resilience
    // Decrypt ALL encrypted items in small batches so one corrupted item never aborts the entire process.
    const decryptedResults = new Map<string, any>();
    const decryptedRichResults = new Map<string, any>();
    const encryptedItemsToDecrypt: { id: string; data: EncryptedData }[] = [];
    const richEncryptedItemsToDecrypt: { id: string; data: EncryptedData }[] =
      [];

    if (isPasswordLoaded) {
      for (const item of items) {
        const isDeleted = (item as any).isDeleted;
        if (
          !isDeleted &&
          item.content &&
          item.content.trim() !== "" &&
          item.encryptionData
        ) {
          encryptedItemsToDecrypt.push({
            id: item._id,
            data: {
              ciphertext: item.content,
              iv: item.encryptionData.iv,
              salt: item.encryptionData.salt,
              authTag: item.encryptionData.authTag,
              iterations: item.encryptionData.iterations,
              version: item.encryptionData.version || 1,
            },
          });

          if (item.richContent && item.encryptionData.richAuthTag) {
            richEncryptedItemsToDecrypt.push({
              id: item._id,
              data: {
                ciphertext: item.richContent,
                iv: item.encryptionData.iv,
                salt: item.encryptionData.salt,
                authTag: item.encryptionData.richAuthTag,
                iterations: item.encryptionData.iterations,
                version: item.encryptionData.version || 1,
              },
            });
          }
        }
      }

      const BATCH_SIZE = 100;
      let decryptProgressCount = 0;

      // Batch decrypt main content - chunked loop
      if (encryptedItemsToDecrypt.length > 0) {
        for (
          let batchStart = 0;
          batchStart < encryptedItemsToDecrypt.length;
          batchStart += BATCH_SIZE
        ) {
          const batch = encryptedItemsToDecrypt.slice(
            batchStart,
            batchStart + BATCH_SIZE,
          );
          const batchEncryptedList = batch.map((i) => i.data);

          try {
            const results = await EncryptionUtils.decryptBatch(
              batchEncryptedList,
              password!,
              (currentCount) => {},
            );

            for (let i = 0; i < results.length; i++) {
              if (results[i] !== null) {
                decryptedResults.set(batch[i].id, results[i]);
              } else {
                failedDecryptionIds.push(batch[i].id);
              }
            }
            decryptProgressCount += batch.length;
          } catch (e: any) {
            console.warn(
              `[SyncDownloadService] Batch decryption failed for batch ${batchStart}-${batchStart + batch.length}, falling back to individual decrypt`,
              e,
            );
            for (const item of batch) {
              try {
                const encryptedData: EncryptedData = item.data;
                const result = await EncryptionUtils.decrypt(
                  encryptedData,
                  password!,
                );
                decryptedResults.set(item.id, result);
              } catch {
                failedDecryptionIds.push(item.id);
              }
              decryptProgressCount++;
              if (!silent) {
              }
            }
          }
        }
      }

      // Batch decrypt richContent - same chunked loop pattern
      if (richEncryptedItemsToDecrypt.length > 0) {
        for (
          let batchStart = 0;
          batchStart < richEncryptedItemsToDecrypt.length;
          batchStart += BATCH_SIZE
        ) {
          const batch = richEncryptedItemsToDecrypt.slice(
            batchStart,
            batchStart + BATCH_SIZE,
          );
          const batchEncryptedList = batch.map((i) => i.data);

          try {
            const richResults = await EncryptionUtils.decryptBatch(
              batchEncryptedList,
              password!,
            );

            for (let i = 0; i < richResults.length; i++) {
              if (richResults[i] !== null) {
                decryptedRichResults.set(batch[i].id, richResults[i]);
              }
            }
          } catch (e: any) {
            console.warn(
              `[SyncDownloadService] RichContent batch decryption failed for batch ${batchStart}-${batchStart + batch.length}, falling back to individual decrypt`,
              e,
            );
            for (const item of batch) {
              try {
                const encryptedData: EncryptedData = item.data;
                const result = await EncryptionUtils.decrypt(
                  encryptedData,
                  password!,
                );
                decryptedRichResults.set(item.id, result);
              } catch {
                // richContent failure is non-fatal
              }
            }
          }
        }
      }

      // Log summary of decryption failures
      if (failedDecryptionIds.length > 0) {
        console.warn(
          `[SyncDownloadService] ${failedDecryptionIds.length} item(s) failed to decrypt and will be skipped`,
        );
      }
    }

    const failedSet = new Set(failedDecryptionIds);

    const allSuccessfullyProcessedItems: ClipboardItem[] = [];
    const CHUNK_SIZE = 100;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const chunkStartIndex = i;

      // 2. Parallel Processing (Thumbnails & saving preparation)
      // Skip progress emission - items already counted in DECRYPTING phase
      const processedChunk = await pMap(
        chunk,
        async (item, index) => {
          try {
            const content = item.content;

            // Skip items with empty content
            const isDeleted = (item as any).isDeleted;
            if (!isDeleted && (!content || content.trim() === "")) {
              console.warn(
                `[SyncDownloadService] Skipping item ${item._id} - Empty content detected`,
              );
              return { status: "skipped" };
            }

            // Skip items that already failed batch decryption
            if (failedSet.has(item._id)) {
              return { status: "skipped" };
            }

            // Decrypt
            let itemContent = item.content;
            let itemRichContent = item.richContent;

            // Decrypt content and richContent
            if (item.encryptionData && isPasswordLoaded) {
              // Decrypt main content (use batch result if available)
              if (decryptedResults.has(item._id)) {
                itemContent = decryptedResults.get(item._id);
              } else {
                const encryptedData: EncryptedData = {
                  ciphertext: item.content,
                  iv: item.encryptionData.iv,
                  salt: item.encryptionData.salt,
                  authTag: item.encryptionData.authTag,
                  iterations: item.encryptionData.iterations,
                  version: item.encryptionData.version || 1,
                };
                itemContent = await EncryptionUtils.decrypt(
                  encryptedData,
                  password!,
                );
              }

              // Decrypt richContent if present (use batch result if available)
              if (item.richContent && item.encryptionData.richAuthTag) {
                if (decryptedRichResults.has(item._id)) {
                  itemRichContent = decryptedRichResults.get(item._id);
                } else {
                  try {
                    const richEncryptedData: EncryptedData = {
                      ciphertext: item.richContent,
                      iv: item.encryptionData.iv,
                      salt: item.encryptionData.salt,
                      authTag: item.encryptionData.richAuthTag,
                      iterations: item.encryptionData.iterations,
                      version: item.encryptionData.version || 1,
                    };
                    itemRichContent = await EncryptionUtils.decrypt(
                      richEncryptedData,
                      password!,
                    );
                  } catch (e) {
                    console.warn(
                      `[SyncDownloadService] Failed to decrypt richContent for ${item._id}`,
                      e,
                    );
                    itemRichContent = undefined;
                  }
                }
              }

              // Ensure content is always a string (defensive coercion)
              if (itemContent !== undefined && itemContent !== null) {
                itemContent =
                  typeof itemContent === "string"
                    ? itemContent
                    : String(itemContent);
              }
              if (itemRichContent !== undefined && itemRichContent !== null) {
                itemRichContent =
                  typeof itemRichContent === "string"
                    ? itemRichContent
                    : String(itemRichContent);
              }
            } else if (item.encryptionData && !isPasswordLoaded) {
              console.warn(
                `[SyncDownloadService] Skipping encrypted item ${item._id} - password not loaded`,
              );
              return { status: "skipped" };
            }

            // Use Map for efficient ID lookup
            const existingShortItem = localIdMap.get(item._id);
            const id = existingShortItem
              ? existingShortItem.id
              : crypto.randomUUID();

            // Thumbnail will be generated in Phase 3 after all items are saved
            const thumbnail = undefined;

            const encryptionData = item.encryptionData
              ? {
                  iv: item.encryptionData.iv,
                  salt: item.encryptionData.salt,
                  authTag: item.encryptionData.authTag,
                  richAuthTag: item.encryptionData.richAuthTag,
                  version: item.encryptionData.version,
                }
              : undefined;

            const clientItem: ClipboardItem = {
              ...item,
              id,
              _id: item._id,
              content: itemContent,
              richContent: itemRichContent,
              thumbnail,
              isSynced: true,
              syncStatus: SyncStatus.SYNCED,
              createdAt: new Date(item.createdAt).getTime(),
              updatedAt: new Date(item.updatedAt).getTime(),
              tags: item.tags || [],
              isFavorite: item.isFavorite ? 1 : 0,
              metadata: item.metadata || {},
              isDeleted: false,
              encryptionData,
            };

            return { status: "success", item: clientItem };
          } catch (e: any) {
            return { status: "error", error: e, item };
          }
        },
        { concurrency: 10 },
      );

      // Collect items for batch DB write
      const batchItems: ClipboardItem[] = [];

      for (const result of processedChunk) {
        if (result.status === "skipped") {
          skipCount++;
        } else if (result.status === SyncStatus.ERROR) {
          const e = result.error;
          const item = result.item;
          console.error(
            `[SyncDownloadService] Error processing item ${item?._id || "unknown"}:`,
            e,
          );
          errorCount++;

          // Detailed debug logging for decryption failures
          if (
            e.message &&
            (e.message.includes("Failed to decrypt") ||
              e.message.includes("Wrong password") ||
              e.message.includes("Incorrect password"))
          ) {
            decryptionErrorCount++;
            console.error(
              `[SyncDownloadService] 🔍 DECRYPTION FAILURE DEBUG for ${item?._id}:`,
              {
                contentLength: item?.content?.length,
                hasContent: !!item?.content,
                encryptionData: item?.encryptionData
                  ? {
                      hasSalt: !!item.encryptionData.salt,
                      hasIv: !!item.encryptionData.iv,
                      hasAuthTag: !!item.encryptionData.authTag,
                      hasRichAuthTag: !!item.encryptionData.richAuthTag,
                      iterations: item.encryptionData.iterations,
                      version: item.encryptionData.version,
                    }
                  : "NO ENCRYPTION DATA",
                errorMessage: e.message,
                itemType: item?.type,
                itemCreatedAt: item?.createdAt,
              },
            );
          }
        } else if (
          result.status === "success" &&
          result.item &&
          "id" in result.item
        ) {
          batchItems.push(result.item);
        }
      }

      // Single DB transaction for the entire chunk
      if (batchItems.length > 0) {
        try {
          await this.upsertSyncedItems(batchItems);
          successCount += batchItems.length;
          allSuccessfullyProcessedItems.push(...batchItems);

          // Batched UI notification
          const savedIds: string[] = [];
          for (const item of batchItems) {
            savedIds.push(item.id);
          }
          sendItemsUpdated(savedIds);
          await updateBadge(this, lockService);
        } catch (dbError) {
          console.error(`[SyncDownloadService] Batch DB Save Error:`, dbError);
          errorCount += batchItems.length;
        }
      }
    }

    // 3. Auto-write to clipboard if enabled
    if (successCount > 0) {
      try {
        const settings = await localSettingsService.getSettings();
        if (settings.autoWriteSyncToClipboard) {
          // Find the item with the latest updatedAt among the processed items
          // We only consider items that were successfully processed in this batch
          if (allSuccessfullyProcessedItems.length > 0) {
            // Sort by updatedAt descending
            allSuccessfullyProcessedItems.sort(
              (a: ClipboardItem, b: ClipboardItem) => b.updatedAt - a.updatedAt,
            );
            const latestItem = allSuccessfullyProcessedItems[0];

            // Use thumbnailService to write to OS clipboard via offscreen document
            thumbnailService.writeToClipboard(
              latestItem.type,
              latestItem.content,
              latestItem.richContent,
            );
          }
        }
      } catch (e) {
        console.error(
          "[SyncDownloadService] Failed to auto-write to clipboard:",
          e,
        );
      }
    }

    // Phase 3: Generate thumbnails for images without thumbnails
    const imagesNeedingThumbnails = allSuccessfullyProcessedItems.filter(
      (item) =>
        item.type === ClipboardItemType.IMAGE &&
        !item.thumbnail &&
        typeof item.content === "string" &&
        item.content.startsWith("data:image"),
    );

    if (imagesNeedingThumbnails.length > 0) {
      const MAX_CONCURRENT = 2;
      let completedCount = 0;
      let activeCount = 0;
      const queue = [...imagesNeedingThumbnails];
      const batchUpdates: Array<{
        id: string;
        changes: { thumbnail: string };
      }> = [];
      let failedCount = 0;

      while (queue.length > 0 || activeCount > 0) {
        // Fill up to MAX_CONCURRENT
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
                } catch (_) {}
              }
            })
            .catch((err) => {
              activeCount--;
              completedCount++;
              failedCount++;
            });
        }

        // Wait for at least one to complete before processing more
        if (activeCount > 0) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      // After ALL thumbnails generated - emit progress at 100% and send batch update
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

    // Handle systemic decryption failure (password wrong)
    if (
      encryptedItemsToDecrypt.length > 0 &&
      failedDecryptionIds.length === encryptedItemsToDecrypt.length
    ) {
      await this.handleSystemicDecryptionFailure();
    }

    return {
      success: successCount,
      skipCount,
      error: errorCount,
      decryptionFailures: failedDecryptionIds,
    };
  }

  private emitProgress(
    stage: string,
    current: number,
    total: number,
    message: string,
  ) {
    sendSyncProgress({ stage: stage as SyncStage, current, total, message });
  }

  private async handleSystemicDecryptionFailure(): Promise<void> {
    console.error("[SyncDownloadService] 100% Decryption Failure detected.");
    await MasterPassUtils.forgetMasterPassword();
    sendInvalidMasterPassword();
  }
}
