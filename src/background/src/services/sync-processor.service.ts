import { EncryptedData, ClipboardItem } from "@shared/types";
import { SyncStatus } from "@shared/enums/sync-status.enum";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { EncryptionUtils } from "@shared/utils/encryption.utils";
import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import type { SyncDownloadedItem } from "@shared/types/db.types";

const INITIAL_BATCH_SIZE = 50;
const FULL_BATCH_SIZE = 100;
const INITIAL_BATCHES = 2;

export class SyncProcessorService extends ClipboardDBService {
  private running = false;
  private processedCount = 0;
  private onProgress: ((processed: number) => void) | null = null;
  private onComplete: (() => void) | null = null;
  private onBatch: ((ids: string[]) => void) | null = null;
  private onFailedDecryption: ((ids: string[]) => void) | null = null;
  private round = 0;

  setCallbacks(
    onProgress: (processed: number) => void,
    onComplete: () => void,
    onFailedDecryption: (ids: string[]) => void,
    onBatch?: (ids: string[]) => void,
  ): void {
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onFailedDecryption = onFailedDecryption;
    this.onBatch = onBatch || null;
  }

  isRunning(): boolean {
    return this.running;
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  async processAll(isStreamEnded: () => boolean): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.round = 0;

    try {
      this.processedCount = 0;
      const allFailedIds: string[] = [];
      let idleIterations = 0;
      const MAX_IDLE_ITERATIONS = 600; // 600 * 100ms = 60s

      while (this.running) {
        this.round++;
        const batchSize =
          this.round <= INITIAL_BATCHES ? INITIAL_BATCH_SIZE : FULL_BATCH_SIZE;
        const items = await this.getUnprocessedSyncItems(batchSize);

        if (items.length === 0) {
          if (isStreamEnded()) break;
          idleIterations++;
          if (idleIterations >= MAX_IDLE_ITERATIONS) break;
          await new Promise((r) => setTimeout(r, 100));
          this.round--;
          continue;
        }

        idleIterations = 0;

        const result = await this.processBatch(items);
        await this.markSyncItemsDone(items.map((i) => i.id));
        this.processedCount += result.saved.length;
        allFailedIds.push(...result.failedIds);
        this.onProgress?.(this.processedCount);
        if (result.saved.length > 0) {
          this.onBatch?.(result.saved.map((i) => i.id));
        }
      }

      if (allFailedIds.length > 0) {
        this.onFailedDecryption?.(allFailedIds);
      }

      this.onComplete?.();
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    this.running = false;
  }

  private async processBatch(
    batch: SyncDownloadedItem[],
  ): Promise<{ saved: ClipboardItem[]; failedIds: string[] }> {
    const savedItems: ClipboardItem[] = [];
    const isPasswordLoaded = await MasterPassUtils.isPasswordLoaded();
    const password = isPasswordLoaded
      ? MasterPassUtils.getMasterPassword()!
      : null;
    const localIdMap = await this.getServerIdMap();

    const decryptedResults = new Map<string, string>();
    const decryptedRichResults = new Map<string, string>();
    const failedDecryptionIds: string[] = [];

    if (isPasswordLoaded && password) {
      const encryptedItems: { id: string; data: EncryptedData }[] = [];
      const richEncryptedItems: { id: string; data: EncryptedData }[] = [];

      for (const item of batch) {
        const sd = item.data;
        if ((sd as any).isDeleted) continue;
        if (!sd.content || sd.content.trim() === "" || !sd.encryptionData)
          continue;

        encryptedItems.push({
          id: sd._id,
          data: {
            ciphertext: sd.content,
            iv: sd.encryptionData.iv,
            salt: sd.encryptionData.salt,
            authTag: sd.encryptionData.authTag,
            iterations: sd.encryptionData.iterations,
            version: sd.encryptionData.version || 1,
          },
        });

        if (sd.richContent && sd.encryptionData.richAuthTag) {
          richEncryptedItems.push({
            id: sd._id,
            data: {
              ciphertext: sd.richContent,
              iv: sd.encryptionData.iv,
              salt: sd.encryptionData.salt,
              authTag: sd.encryptionData.richAuthTag,
              iterations: sd.encryptionData.iterations,
              version: sd.encryptionData.version || 1,
            },
          });
        }
      }

      if (encryptedItems.length > 0) {
        const SUB_BATCH = 10;
        for (let start = 0; start < encryptedItems.length; start += SUB_BATCH) {
          const subBatch = encryptedItems.slice(start, start + SUB_BATCH);
          const subList = subBatch.map((i) => i.data);
          try {
            const results = await EncryptionUtils.decryptBatch(
              subList,
              password,
            );
            for (let i = 0; i < results.length; i++) {
              if (results[i] !== null) {
                decryptedResults.set(subBatch[i].id, results[i]);
              } else {
                failedDecryptionIds.push(subBatch[i].id);
              }
            }
          } catch {
            for (const item of subBatch) {
              try {
                const result = await EncryptionUtils.decrypt(
                  item.data,
                  password,
                );
                decryptedResults.set(item.id, result);
              } catch {
                failedDecryptionIds.push(item.id);
              }
            }
          }
        }
      }

      if (richEncryptedItems.length > 0) {
        const SUB_BATCH = 10;
        for (
          let start = 0;
          start < richEncryptedItems.length;
          start += SUB_BATCH
        ) {
          const subBatch = richEncryptedItems.slice(start, start + SUB_BATCH);
          const subList = subBatch.map((i) => i.data);
          try {
            const richResults = await EncryptionUtils.decryptBatch(
              subList,
              password,
            );
            for (let i = 0; i < richResults.length; i++) {
              if (richResults[i] !== null) {
                decryptedRichResults.set(subBatch[i].id, richResults[i]);
              }
            }
          } catch {
            for (const item of subBatch) {
              try {
                const result = await EncryptionUtils.decrypt(
                  item.data,
                  password,
                );
                decryptedRichResults.set(item.id, result);
              } catch {
                // richContent failure non-fatal
              }
            }
          }
        }
      }
    }

    const failedSet = new Set(failedDecryptionIds);

    for (const item of batch) {
      const sd = item.data;
      if ((sd as any).isDeleted) continue;
      if (!sd.content || sd.content.trim() === "") continue;
      if (failedSet.has(sd._id)) continue;
      if (sd.encryptionData && !isPasswordLoaded) continue;

      let itemContent = sd.content;
      let itemRichContent = sd.richContent;

      if (sd.encryptionData && isPasswordLoaded && password) {
        if (decryptedResults.has(sd._id)) {
          const decrypted = decryptedResults.get(sd._id);
          if (decrypted !== undefined) {
            itemContent = decrypted;
          }
        } else {
          const encryptedData: EncryptedData = {
            ciphertext: sd.content,
            iv: sd.encryptionData.iv,
            salt: sd.encryptionData.salt,
            authTag: sd.encryptionData.authTag,
            iterations: sd.encryptionData.iterations,
            version: sd.encryptionData.version || 1,
          };
          itemContent = await EncryptionUtils.decrypt(encryptedData, password);
        }

        if (sd.richContent && sd.encryptionData.richAuthTag) {
          if (decryptedRichResults.has(sd._id)) {
            itemRichContent = decryptedRichResults.get(sd._id);
          } else {
            try {
              const richEncryptedData: EncryptedData = {
                ciphertext: sd.richContent,
                iv: sd.encryptionData.iv,
                salt: sd.encryptionData.salt,
                authTag: sd.encryptionData.richAuthTag,
                iterations: sd.encryptionData.iterations,
                version: sd.encryptionData.version || 1,
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

        if (itemContent !== null && itemContent !== undefined) {
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

      const existingLocalItem = localIdMap.get(sd._id);
      const id = existingLocalItem ? existingLocalItem.id : crypto.randomUUID();

      const encryptionData = sd.encryptionData
        ? {
            iv: sd.encryptionData.iv,
            salt: sd.encryptionData.salt,
            authTag: sd.encryptionData.authTag,
            richAuthTag: sd.encryptionData.richAuthTag,
            version: sd.encryptionData.version,
          }
        : undefined;

      const clientItem: ClipboardItem = {
        ...sd,
        id,
        _id: sd._id,
        content: itemContent,
        richContent: itemRichContent,
        thumbnail: undefined,
        isSynced: true,
        syncStatus: SyncStatus.SYNCED,
        createdAt: new Date(sd.createdAt).getTime(),
        updatedAt: new Date(sd.updatedAt).getTime(),
        tags: sd.tags || [],
        isFavorite: sd.isFavorite ? 1 : 0,
        metadata: sd.metadata || {},
        isDeleted: false,
        encryptionData,
      };

      savedItems.push(clientItem);
    }

    if (savedItems.length > 0) {
      await this.upsertSyncedItems(savedItems);
    }

    return { saved: savedItems, failedIds: failedDecryptionIds };
  }
}
