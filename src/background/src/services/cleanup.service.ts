import { SyncStatus } from "@shared/enums/sync-status.enum";
import { StorageUtil } from "@shared/utils/extension-storage.util";
import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import { sendSyncTrigger, sendUpdated } from "@shared/utils/message.utils";

/**
 * Cleanup Service
 * Handles automatic pruning of old clipboard items based on user settings
 */
export class CleanupService extends ClipboardDBService {
  constructor() {
    super();
  }

  private readonly BATCH_SIZE = 50;

  /**
   * Run the auto-cleanup process using cursor-based iteration
   * 1. Get autoCleanupDays from storage
   * 2. Find items older than N days using cursor
   * 3. Clear cloud items (mark as pending_delete)
   * 4. Delete local-only items permanently
   */
  public async runAutoCleanup(): Promise<void> {
    try {
      const settings = await StorageUtil.getSettings();
      const autoCleanupDays = settings?.autoCleanupDays || 0;

      // 0 or unset means disabled
      if (autoCleanupDays <= 0) return;

      const cutoffTimestamp =
        Date.now() - autoCleanupDays * 24 * 60 * 60 * 1000;

      const db = await this.getDB();
      const toMarkPendingDelete: string[] = [];
      const toHardDelete: string[] = [];

      const readTx = db.transaction("clipboard_items", "readonly");
      let cursor = await readTx.store.openCursor();
      let processed = 0;

      while (cursor) {
        processed++;
        const item = cursor.value;

        if (!item.isDeleted && item.createdAt < cutoffTimestamp) {
          if (item._id) {
            toMarkPendingDelete.push(item.id);
          } else {
            toHardDelete.push(item.id);
          }
        }

        cursor = await cursor.continue();
      }
      await readTx.done;

      if (toMarkPendingDelete.length > 0) {
        const writeTx = db.transaction("clipboard_items", "readwrite");
        for (const id of toMarkPendingDelete) {
          const item = await writeTx.store.get(id);
          if (item) {
            item.syncStatus = SyncStatus.PENDING_DELETE;
            item.updatedAt = Date.now();
            await writeTx.store.put(item);
          }
        }
        await writeTx.done;
      }

      if (toHardDelete.length > 0) {
        await this.deleteItems(toHardDelete);
      }

      const cloudDeleted = toMarkPendingDelete.length;
      const localDeleted = toHardDelete.length;

      if (processed === 0) {
        return;
      }

      // If we marked items as pending_delete, trigger a sync to push those deletions
      if (cloudDeleted > 0) {
        sendSyncTrigger({ reason: "auto_cleanup" });
      }

      // Refresh UI if anything was deleted
      if (cloudDeleted > 2 || localDeleted > 0) {
        sendUpdated();
      }
    } catch (error) {}
  }

  async trimHistory(limit: number): Promise<void> {
    if (limit <= 0) return;

    const db = await this.getDB();
    const count = await this.getCount();

    if (count <= limit) return;

    const items = await this.getItemsPaginated(count, 0, "by-created");

    const itemsToDelete = items.slice(limit);

    if (itemsToDelete.length > 0) {
      const idsToDelete = itemsToDelete.map((item) => item.id);
      await this.deleteItems(idsToDelete);
    }
  }

  async clearAll(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(
      ["clipboard_items", "clipboard_data"],
      "readwrite",
    );
    await tx.objectStore("clipboard_items").clear();
    await tx.objectStore("clipboard_data").clear();
    await tx.done;
  }

  async deleteSyncedItems(): Promise<void> {
    const db = await this.getDB();
    const syncedItems = await db.getAllFromIndex(
      "clipboard_items",
      "by-sync-status",
      SyncStatus.SYNCED,
    );
    const ids = syncedItems
      .filter((i: any) => !i.isDeleted)
      .map((i: any) => i.id);

    if (ids.length === 0) return;

    const tx = db.transaction(
      ["clipboard_items", "clipboard_data"],
      "readwrite",
    );
    for (const id of ids) {
      await tx.objectStore("clipboard_items").delete(id);
      await tx.objectStore("clipboard_data").delete(id);
    }
    await tx.done;
  }
}

export const cleanupService = new CleanupService();
