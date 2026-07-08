/**
 * Clipboard Sync Service (Fetch-based for Background/Service Worker)
 *
 * Pure API Client for Cloud Sync using native fetch API.
 * Does NOT use axios. Safe for Chrome MV3 Service Workers.
 */

import { fetchWithAuth } from "@shared/utils/http.utils";
import type {
  ServerClipboardItem,
  ClipboardPushPayload,
  ClipboardBatchItem,
  FetchAllItemsParams,
} from "@shared/types/clipboard.types";

class CloudSyncService {
  /**
   * Push an item to the server
   */
  async pushItem(
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

  /**
   * Create items in batch
   */
  async createBatch(
    items: ClipboardBatchItem[],
  ): Promise<ServerClipboardItem[]> {
    const response = await fetchWithAuth<{
      data: { items: ServerClipboardItem[] };
    }>("/clipboard/batch", {
      method: "POST",
      body: JSON.stringify({ items }),
    });

    const serverItems = response.data?.items;
    if (!serverItems) throw new Error("No items returned from batch create");

    return serverItems;
  }

  /**
   * Get clipboard statistics
   */
  async getStats(): Promise<{ total: number; favorites: number }> {
    const response = await fetchWithAuth<{
      data: { total: number; favorites: number };
    }>("/clipboard/stats", { method: "GET" });

    if (!response.data) throw new Error("No data returned from stats");

    return response.data;
  }

  /**
   * Fetch all items (paginated) for full restore/pull
   */
  async fetchAllItems(
    params: FetchAllItemsParams = {},
  ): Promise<{ items: ServerClipboardItem[]; total: number }> {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.set("limit", params.limit.toString());
    if (params.updatedAt__gt)
      queryParams.set("updatedAt__gt", params.updatedAt__gt.toString());

    const queryString = queryParams.toString();
    const endpoint = queryString ? `/clipboard?${queryString}` : "/clipboard";

    const response = await fetchWithAuth<{
      data: { items: ServerClipboardItem[]; total: number };
    }>(endpoint, { method: "GET" });

    return {
      items: response.data?.items || [],
      total: response.data?.total || 0,
    };
  }

  /**
   * Delete item from cloud
   */
  async deleteFromCloud(serverId: string): Promise<void> {
    await fetchWithAuth(`/clipboard/${serverId}`, {
      method: "DELETE",
    });
  }

  /**
   * Delete multiple items from cloud (Batch)
   */
  async deleteBatch(serverIds: string[]): Promise<void> {
    if (serverIds.length === 0) return;

    await fetchWithAuth("/clipboard/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids: serverIds }),
    });
  }

  /**
   * Update sync status on server (Browser Session)
   */
  async updateSyncStatus(timestamp: number): Promise<void> {
    try {
      await fetchWithAuth("/clipboard/sync/status", {
        method: "POST",
        body: JSON.stringify({ timestamp }),
      });
    } catch (e) {
      console.warn(
        "[CloudSyncService] Failed to update sync status on server (safe fail)",
        e,
      );
    }
  }
}

export { CloudSyncService, CloudSyncService as SyncService };
export default CloudSyncService;
