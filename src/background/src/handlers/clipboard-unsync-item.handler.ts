import { SyncStatus } from "@/shared/enums/sync-status.enum";
import { syncDeletionService, cbItemService, lockService } from "../services";
import { storageService } from "@/shared/services";
import { sendItemUpdated, sendUpdated } from "@shared/utils/message.utils";

export const clipboardUnsyncItemHandler = async (payload: {
  id?: string;
  serverId?: string;
}) => {
  const { id: localId, serverId } = payload || {};

  if (!localId || !serverId) return { success: false };

  if ((await lockService.isLockActive()) || lockService.isLockInProgress())
    return { success: false, error: "Locked" };

  try {
    // 1. Mark as pending_delete locally to show spinner (and persist across reloads)
    await cbItemService.updateSyncStatus(
      localId,
      SyncStatus.PENDING_DELETE,
      serverId,
    );

    // Notify UI immediately regarding pending state
    sendItemUpdated({ itemId: localId });

    // 2. Delete from cloud
    await syncDeletionService.deleteRemote(serverId);

    // 3. Demote to local in DB (removes server ID and sync status)
    await cbItemService.demoteToLocal(localId);

    // Update totalCloudItems locally
    const storage = await storageService.get(["totalCloudItems"]);
    const totalCloudItems = (storage as any).totalCloudItems;
    if (typeof totalCloudItems === "number" && totalCloudItems > 0) {
      await storageService.set({
        totalCloudItems: totalCloudItems - 1,
      });
    }

    // 4. Notify UI of final state and general clipboard update
    sendItemUpdated({ itemId: localId });
    sendUpdated();
  } catch (error: unknown) {
    console.error(
      `[SyncOrchestrator] Failed to unsync item ${localId}:`,
      error,
    );

    // Revert to synced state on failure
    await cbItemService.updateSyncStatus(localId, SyncStatus.SYNCED, serverId);

    // Notify UI to revert spinner
    sendItemUpdated({ itemId: localId });

    return { success: false };
  }

  return { success: true };
};
