import { ClipboardItemType, AuthData, ClipboardItem } from "@shared/types";
import { storageService, syncDeletionService } from ".";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { EncryptionUtils } from "@shared/utils/encryption.utils";
import { SyncStage } from "@shared/enums";
import { SyncStatus } from "@shared/enums/sync-status.enum";
import { pMap } from "@shared/utils/concurrency.util";
import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import { hydrateImageContent } from "@shared/utils/image-hydration.util";
import { sendSynced } from "@shared/utils/message.utils";
import { fetchWithAuth } from "@shared/utils/http.utils";
import type {
  ServerClipboardItem,
  ClipboardPushPayload,
} from "@shared/types/clipboard.types";
import type { SyncUploadItem } from "@shared/types/db.types";

type ProgressCallback = (
  stage: SyncStage,
  current: number,
  total: number,
  message: string,
) => void;

export interface PushPendingChangesResult {
  uploaded: number;
  failed: number;
  limitReached: boolean;
  limitReachedPartial: boolean;
  deniedItems: number;
  encryptionFailed: boolean;
  errors: any[];
}

/**
 * Sync Upload Service
 * Handles batch uploading of pending local changes.
 */
export class SyncUploadService extends ClipboardDBService {
  constructor() {
    super();
  }

  /**
   * Push item to cloud (API call)
   */
  private async pushItemToCloud(
    itemServerId: string | undefined,
    payload: ClipboardPushPayload,
  ): Promise<ServerClipboardItem> {
    let response: any;

    if (itemServerId) {
      response = await fetchWithAuth<{ data: { item: ServerClipboardItem } }>(
        `/clipboard/${itemServerId}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
    } else {
      response = await fetchWithAuth<{ data: { item: ServerClipboardItem } }>(
        "/clipboard",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
    }

    const serverItem = response.data?.item;
    if (!serverItem) throw new Error("No item returned from server");
    return serverItem;
  }

  async pushItem(
    itemId: string,
    suppressError: boolean = false,
  ): Promise<void> {
    await syncDeletionService.processPendingDeletions();

    const item = await this.getItem(itemId);
    if (!item) return;

    const settings = await storageService.get([
      "clipboardDisableUploadToCloud",
      "clipboardDisableImageSync",
    ]);

    if (settings.clipboardDisableUploadToCloud) return;

    if (item.type === ClipboardItemType.IMAGE) {
      if (settings.clipboardDisableImageSync) {
        await this.demoteToLocal(item.id);
        return;
      }
    }

    await MasterPassUtils.ensurePasswordLoaded();
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const password = MasterPassUtils.getMasterPassword()!;

    const contentEncrypted = await EncryptionUtils.encryptWithCredentials(
      item.content,
      password,
      { salt, iv },
    );

    let encryptedRichContent: string | undefined;
    let richAuthTag: string | undefined;
    if (item.richContent) {
      const richEncrypted = await EncryptionUtils.encryptWithCredentials(
        item.richContent,
        password,
        { salt, iv },
      );
      encryptedRichContent = richEncrypted.ciphertext;
      richAuthTag = richEncrypted.authTag;
    }

    try {
      const serverItem = await this.pushItemToCloud(item._id, {
        type: item.type,
        content: contentEncrypted.ciphertext,
        richContent: encryptedRichContent,
        metadata: item.metadata,
        tags: item.tags,
        isFavorite: !!item.isFavorite,
        isEncrypted: true,
        encryptionData: {
          iv: contentEncrypted.iv,
          salt: contentEncrypted.salt,
          authTag: contentEncrypted.authTag,
          richAuthTag,
          iterations: contentEncrypted.iterations,
        },
      });

      await this.updateItem(item.id, {
        updatedAt: new Date(serverItem.updatedAt).getTime(),
      });
      await this.updateSyncStatus(item.id, SyncStatus.SYNCED, serverItem._id);

      sendSynced({ itemId, serverId: serverItem._id });
    } catch (error) {
      if (suppressError) {
        await this.demoteToLocal(itemId);
      } else {
        await this.updateSyncStatus(
          itemId,
          SyncStatus.ERROR,
          undefined,
          error instanceof Error ? error.message : "Sync failed",
        );
      }
      throw error;
    }
  }

  /**
   * Push all pending local changes to the cloud
   */
  public async prepareUpload(
    isManual: boolean | undefined,
    authData: AuthData,
    onProgress?: ProgressCallback,
    mpc?: { totalItems: number },
  ): Promise<{
    result: PushPendingChangesResult;
    creations: ClipboardItem[];
  }> {
    const result: PushPendingChangesResult = {
      uploaded: 0,
      failed: 0,
      limitReached: false,
      limitReachedPartial: false,
      deniedItems: 0,
      encryptionFailed: false,
      errors: [],
    };

    let pendingItems: ClipboardItem[];
    if (isManual) {
      pendingItems = await this.getUnsyncedItems();
    } else {
      pendingItems = await this.getPendingSyncItems();
    }

    if (pendingItems.length === 0) {
      return { result, creations: [] };
    }

    const settings = await storageService.get(["clipboardDisableImageSync"]);

    if (settings.clipboardDisableImageSync) {
      const imagesToSkip = pendingItems.filter(
        (i) => i.type === ClipboardItemType.IMAGE,
      );

      for (const img of imagesToSkip) {
        await this.demoteToLocal(img.id);
      }

      pendingItems = pendingItems.filter(
        (i) => i.type !== ClipboardItemType.IMAGE,
      );
    }

    pendingItems.sort((a, b) => b.createdAt - a.createdAt);

    const maxLimit =
      authData.subscription?.planDetails?.maxClipboardItemsLimit || 0;

    if (maxLimit > 0) {
      const currentSyncedCount = await this.getSyncedCount();
      const allowance = Math.max(0, maxLimit - currentSyncedCount);

      const additions = pendingItems.filter((i) => !i._id);
      const existingItems = pendingItems.filter((i) => !!i._id);

      if (allowance === 0 && additions.length > 0) {
        console.warn(
          `[SyncUploadService] User at plan limit (${currentSyncedCount}/${maxLimit}). Demoting ${additions.length} new items to local.`,
        );
        for (const item of additions) {
          await this.demoteToLocal(item.id);
        }
        result.limitReached = true;
        pendingItems = existingItems;
      } else if (additions.length > allowance) {
        const allowed = additions.slice(0, allowance);
        const denied = additions.slice(allowance);

        for (const item of denied) {
          await this.demoteToLocal(item.id);
        }

        result.limitReachedPartial = true;
        result.deniedItems = denied.length;
        pendingItems = [...existingItems, ...allowed];
      }
    }

    if (pendingItems.length === 0) {
      return { result, creations: [] };
    }

    // Separate updates (with _id) from creations (without _id)
    const updates = pendingItems.filter(
      (i) =>
        i.syncStatus !== SyncStatus.PENDING_DELETE &&
        i.syncStatus !== SyncStatus.RETENTION_EXPIRED &&
        !!i._id,
    );
    const creations = pendingItems.filter(
      (i) =>
        i.syncStatus !== SyncStatus.PENDING_DELETE &&
        i.syncStatus !== SyncStatus.RETENTION_EXPIRED &&
        !i._id,
    );

    // Process Updates (Individual)
    let updatesCompleted = 0;
    for (const item of updates) {
      updatesCompleted++;
      if (onProgress) {
        onProgress(
          SyncStage.UPLOADING,
          updatesCompleted,
          updates.length,
          `Updating ${updatesCompleted}/${updates.length}`,
        );
      }
      try {
        await this.pushItem(item.id, !isManual);
        result.uploaded++;
      } catch (err) {
        console.error(
          `[SyncUploadService] Individual item update failed:`,
          err,
        );
        result.failed++;
        result.errors.push(err);
        if (isManual) throw err;
      }
    }

    return { result, creations };
  }

  async encryptToTempStore(
    creations: ClipboardItem[],
    password: string,
    failedEncryptionIds: string[],
  ): Promise<number> {
    const BATCH_SIZES = [10, 20, 25, 50, 50];
    let encryptedCount = 0;
    let batchIndex = 0;

    for (let i = 0; i < creations.length; ) {
      const size = BATCH_SIZES[Math.min(batchIndex++, BATCH_SIZES.length - 1)];
      const subBatch = creations.slice(i, i + size);
      const itemsToEncrypt = subBatch.map((c) => c.content);

      let encryptedContents: any[];
      try {
        encryptedContents = await EncryptionUtils.encryptBatch(
          itemsToEncrypt,
          password,
        );
      } catch {
        encryptedContents = [];
        for (const item of subBatch) {
          try {
            const result = await EncryptionUtils.encryptBatch(
              [item.content],
              password,
            );
            encryptedContents.push(result[0]);
          } catch {
            failedEncryptionIds.push(item.id);
            encryptedContents.push(null);
          }
        }
      }

      const payloads: any[] = [];
      for (let j = 0; j < subBatch.length; j++) {
        const item = subBatch[j];
        const encryptedData = encryptedContents[j];
        if (!encryptedData) continue;

        payloads.push({
          type: item.type,
          content: encryptedData.ciphertext,
          metadata: {
            ...item.metadata,
            size:
              item.metadata?.size ||
              item.content?.length ||
              encryptedData.ciphertext.length,
          },
          tags: item.tags,
          isFavorite: !!item.isFavorite,
          isEncrypted: true,
          encryptionData: {
            iv: encryptedData.iv,
            salt: encryptedData.salt,
            authTag: encryptedData.authTag,
            iterations: encryptedData.iterations,
            version: encryptedData.version,
          },
          localId: item.id,
        });
      }

      if (payloads.length > 0) {
        const uploadItems: SyncUploadItem[] = payloads.map((p, idx) => ({
          id: `${p.localId}-${i + idx}`,
          localId: p.localId,
          payload: p,
          status: "encrypted",
        }));
        await this.saveSyncUploadItems(uploadItems);
      }

      encryptedCount += payloads.length;

      // Yield after each sub-batch
      await new Promise((r) => setTimeout(r, 0));

      i += size;
    }

    return encryptedCount;
  }
}
