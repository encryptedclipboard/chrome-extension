import { lockService } from ".";
import { updateBadge } from "../utils/badge.util";
import { ClipboardItem } from "@shared/types";
import { SyncStatus } from "@shared/enums/sync-status.enum";
import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import { hydrateImageContent } from "@shared/utils/image-hydration.util";
import { fetchWithAuth } from "@shared/utils/http.utils";

/**
 * Sync Deletion Service
 * Handles processing of pending deletions to the cloud.
 */
export class SyncDeletionService extends ClipboardDBService {
  constructor() {
    super();
  }

  /**
   * Delete item from cloud
   */
  public async deleteRemote(serverId: string): Promise<void> {
    await fetchWithAuth(`/clipboard/${serverId}`, {
      method: "DELETE",
    });
  }

  /**
   * Delete multiple items from cloud (Batch)
   */
  public async deleteBatchRemote(serverIds: string[]): Promise<void> {
    if (serverIds.length === 0) return;

    await fetchWithAuth("/clipboard/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids: serverIds }),
    });
  }

  /**
   * Process pending deletions immediately
   * Used to free up space before uploading new items in single-item sync
   */
  public async processPendingDeletions(): Promise<void> {
    const pendingItems = await this.getPendingSyncItems();
    const deletions = pendingItems.filter(
      (i) => i.syncStatus === SyncStatus.PENDING_DELETE,
    );

    if (deletions.length === 0) return;

    // Collect server IDs for bulk deletion
    const serverIdsToDelete: string[] = [];
    const localIdsHardDelete: string[] = [];

    for (const item of deletions) {
      if (item._id) {
        serverIdsToDelete.push(item._id);
      }
      localIdsHardDelete.push(item.id);
    }

    try {
      // 1. Delete from Server in Batch
      if (serverIdsToDelete.length > 0) {
        await this.deleteBatchRemote(serverIdsToDelete);
      }

      // 2. Hard Delete local items
      for (const id of localIdsHardDelete) {
        await this.hardDelete(id);
      }

      // Update badge
      await updateBadge(this, lockService);
    } catch (e) {
      console.error(`[SyncDeletionService] Failed to process deletions:`, e);
      // Schedule retry
      if (chrome.alarms) {
        chrome.alarms.create("retry_deletions", { delayInMinutes: 1 });
      }
    }
  }
}
