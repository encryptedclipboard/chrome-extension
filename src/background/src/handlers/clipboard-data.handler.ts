import { MessageType } from "@shared/types";
import { lockService, syncDownloadService, cbItemService } from "../services";

/**
 * Handle Clipboard Data retrieval messages
 */
export async function handleClipboardDataMessage(message: any): Promise<{
  success: boolean;
  items?: any[];
  item?: any;
  error?: string;
  warning?: string;
  sizeMB?: string;
  isFavorite?: number;
}> {
  switch (message.type) {
    case MessageType.TOGGLE_FAVORITE: {
      if (
        (await lockService.isLockActive()) ||
        lockService.isLockInProgress()
      ) {
        return { success: false, error: "Locked" };
      }

      const { id } = message.payload || {};
      if (!id) {
        return { success: false, error: "Item ID required" };
      }

      // Toggle favorite in local DB
      const newFavoriteState = await cbItemService.toggleFavorite(id);

      // Sync to server via existing sync service
      try {
        await syncDownloadService.pullItem(id);
      } catch (err) {
        console.warn(
          "[Background] Failed to sync favorite update to server:",
          err,
        );
      }

      return { success: true, isFavorite: newFavoriteState };
    }

    case MessageType.GET_CLIPBOARD_ITEMS: {
      const isLocked =
        (await lockService.isLockActive()) || lockService.isLockInProgress();
      if (isLocked) {
        return { success: true, items: [] };
      }

      const limit = message.limit || message.payload?.limit || 20;
      const offset = message.offset || message.payload?.offset || 0;
      const excludeTypes =
        message.excludeTypes || message.payload?.excludeTypes || [];
      const onlyType = message.onlyType || message.payload?.onlyType;

      let items = [];

      if (onlyType) {
        const safeLimit = onlyType === "image" ? Math.min(limit, 10) : limit;
        items = await cbItemService.getItemsByType(onlyType);
        items = items.slice(offset, offset + safeLimit);
      } else {
        items = await cbItemService.getItemsPaginated(
          limit,
          offset,
          "by-created",
          excludeTypes,
        );
      }

      try {
        const serialized = JSON.parse(JSON.stringify(items));
        const jsonString = JSON.stringify(serialized);
        const sizeBytes = new TextEncoder().encode(jsonString).length;
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

        if (sizeBytes > 25 * 1024 * 1024) {
          return {
            success: true,
            items: [],
            warning: "Payload too large",
            sizeMB,
          };
        }

        return { success: true, items: serialized };
      } catch (err) {
        console.error("[Background] Serialization/Send Error:", err);
        return {
          success: false,
          error: "Data serialization failed",
        };
      }
    }

    case MessageType.SEARCH_CLIPBOARD_ITEMS: {
      if (
        (await lockService.isLockActive()) ||
        lockService.isLockInProgress()
      ) {
        return { success: true, items: [] };
      }

      const {
        query,
        typeFilter,
        limit = 50,
        offset = 0,
      } = message.payload || {};
      const results = await cbItemService.getFilteredItemsPaginated(
        limit,
        offset,
        {
          searchKeyword: query,
          searchType: typeFilter || undefined,
        },
      );
      const serialized = JSON.parse(JSON.stringify(results));
      const jsonString = JSON.stringify(serialized);
      const sizeBytes = new TextEncoder().encode(jsonString).length;

      if (sizeBytes > 25 * 1024 * 1024) {
        return { success: true, items: [], warning: "Payload too large" };
      }

      return { success: true, items: serialized };
    }

    case MessageType.GET_CLIPBOARD_ITEM: {
      if (
        (await lockService.isLockActive()) ||
        lockService.isLockInProgress()
      ) {
        return { success: false, error: "Locked" };
      }

      const { id } = message.payload || {};
      const item = await cbItemService.getItem(id);
      return { success: true, item };
    }

    default:
      return { success: false };
  }
}
