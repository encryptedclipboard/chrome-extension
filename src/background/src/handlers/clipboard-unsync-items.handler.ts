import { SyncStatus } from "@/shared/enums/sync-status.enum";
import { syncDeletionService, cbItemService, lockService } from "../services";
import { storageService } from "@/shared/services";
import { sendUpdated } from "@shared/utils/message.utils";

export const clipboardUnsyncItemsHandler = async (payload: {
  items?: Array<{ id: string; serverId: string }>;
}) => {
  const { items } = payload || {};

  if (!items || !Array.isArray(items) || items.length === 0)
    return { success: false };

  if ((await lockService.isLockActive()) || lockService.isLockInProgress())
    return { success: false, error: "Locked" };

  const localIds = items.map((i) => i.id);
  const serverIds = items.map((i) => i.serverId);

  try {
    // 1. Mark as pending_delete locally to show spinner (and persist across reloads)
    await Promise.all(
      items.map((item) =>
        cbItemService.updateSyncStatus(
          item.id,
          SyncStatus.PENDING_DELETE,
          item.serverId,
        ),
      ),
    );

    // Notify UI immediately regarding pending state
    sendUpdated(); // General update will refresh the list and show pending spinners

    // 2. Delete from cloud
    await syncDeletionService.deleteBatchRemote(serverIds);

    // 3. Demote to local in DB (removes server ID and sync status)
    await Promise.all(
      localIds.map((localId) => cbItemService.demoteToLocal(localId)),
    );

    // Update totalCloudItems locally
    const storage = await storageService.get(["totalCloudItems"]);
    if (storage.totalCloudItems && storage.totalCloudItems > 0) {
      await storageService.set({
        totalCloudItems: Math.max(0, storage.totalCloudItems - items.length),
      });
    }

    // 4. Notify UI of final state
    sendUpdated();
  } catch (error: unknown) {
    console.error(`[SyncOrchestrator] Failed to unsync items in batch:`, error);

    // Revert to synced state on failure
    await Promise.all(
      items.map((item) =>
        cbItemService.updateSyncStatus(
          item.id,
          SyncStatus.SYNCED,
          item.serverId,
        ),
      ),
    );

    // Notify UI to revert spinner
    sendUpdated();

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  return { success: true };
};
