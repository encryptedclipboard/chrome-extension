import type { AxiosInstance } from "axios";
import { BaseService } from "./base.service";
import type { IApiResponse } from "@shared/types";
import type { ServerClipboardItem } from "../types/clipboard.types";

/**
 * Clipboard Sync Service
 *
 * Pure API Client for Cloud Sync.
 * Does NOT depend on other services (Except Push for exclusion optimization).
 * Does NOT handle encryption or database operations.
 */
export class ClipboardSyncService extends BaseService {
  constructor(http: AxiosInstance) {
    super(http);
  }

  /**
   * Push an item to the server
   */
  async pushItem(
    itemServerId: string | undefined, // Pass _id if it exists (for update)
    payload: {
      type: string;
      content: string; // Encrypted ciphertext
      metadata?: any;
      tags?: string[];
      isFavorite?: boolean;
      isEncrypted: boolean;
      encryptionData?: {
        iv: string;
        salt: string;
        authTag: string;
      };
    },
    senderEndpoint?: string,
  ): Promise<ServerClipboardItem> {
    try {
      const headers = senderEndpoint
        ? { "x-sender-endpoint": senderEndpoint }
        : {};

      let response;
      if (itemServerId) {
        response = await this.http.put<
          IApiResponse<{ item: ServerClipboardItem }>
        >(`/clipboard/${itemServerId}`, payload, { headers });
      } else {
        response = await this.http.post<
          IApiResponse<{ item: ServerClipboardItem }>
        >("/clipboard", payload, {
          headers,
        });
      }

      const serverItem = response.data?.data?.item;
      if (!serverItem) throw new Error("No item returned from server");

      return serverItem;
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Create items in batch
   */
  async createBatch(
    items: Array<{
      type: string;
      content: string;
      metadata?: any;
      tags?: string[];
      isEncrypted: boolean;
      encryptionData?: any;
      localId: string;
    }>,
    senderEndpoint?: string,
  ): Promise<ServerClipboardItem[]> {
    try {
      const headers = senderEndpoint
        ? { "x-sender-endpoint": senderEndpoint }
        : {};

      const response = await this.http.post<
        IApiResponse<{ items: ServerClipboardItem[] }>
      >("/clipboard/batch", { items }, { headers });

      const serverItems = response.data?.data?.items;
      if (!serverItems) throw new Error("No items returned from batch create");

      return serverItems;
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Fetch changes from server
   */
  async fetchChanges(
    after: number,
    limit = 50,
  ): Promise<{
    items: ServerClipboardItem[];
    timestamp: number;
    hasMore: boolean;
    nextAfter: number;
  }> {
    const response = await this.http.get<
      IApiResponse<{
        items: ServerClipboardItem[];
        timestamp: number;
        hasMore: boolean;
        nextAfter: number;
      }>
    >("/clipboard/sync", {
      params: { after, limit },
    });

    const data = response.data?.data;
    if (!data) throw new Error("No data returned from sync endpoint");

    return {
      items: data.items,
      timestamp: data.timestamp,
      hasMore: data.hasMore || false,
      nextAfter: data.nextAfter || data.timestamp,
    };
  }

  /**
   * Fetch tombstones from server
   */
  async fetchTombstones(after: number): Promise<{
    tombstones: string[];
    timestamp: number;
  }> {
    const response = await this.http.get<
      IApiResponse<{
        tombstones: string[];
        timestamp: number;
      }>
    >("/clipboard/sync/tombstones", {
      params: { after },
    });

    const data = response.data?.data;
    if (!data) throw new Error("No data returned from tombstones endpoint");

    return {
      tombstones: data.tombstones || [],
      timestamp: data.timestamp,
    };
  }

  /**
   * Delete item from cloud
   */
  async deleteFromCloud(
    serverId: string,
    senderEndpoint?: string,
  ): Promise<void> {
    const headers = senderEndpoint
      ? { "x-sender-endpoint": senderEndpoint }
      : {};
    await this.http.delete(`/clipboard/${serverId}`, { headers });
  }

  /**
   * Delete multiple items from cloud
   */
  async deleteBatchFromCloud(
    serverIds: string[],
    senderEndpoint?: string,
  ): Promise<void> {
    const headers = senderEndpoint
      ? { "x-sender-endpoint": senderEndpoint }
      : {};
    await this.http.post(
      "/clipboard/bulk-delete",
      { ids: serverIds },
      { headers },
    );
  }

  /**
   * Fetch batch of items by IDs
   */
  async fetchBatch(ids: string[]): Promise<ServerClipboardItem[]> {
    const response = await this.http.post<
      IApiResponse<{ items: ServerClipboardItem[] }>
    >("/clipboard/batch-retrieve", {
      ids,
    });

    const items = response.data?.data?.items;
    if (!items) throw new Error("No items returned from batch fetch");

    return items;
  }

  async checkUpdates(after: number): Promise<{
    changes: Array<{
      _id: string;
      updatedAt: string;
      isDeleted?: boolean;
    }>;
    timestamp: number;
  }> {
    const response = await this.http.get<IApiResponse<any>>(
      "/clipboard/check-updates",
      {
        params: { after },
      },
    );

    const data = response.data?.data;
    if (!data) throw new Error("No data from check-updates");
    return {
      changes: data.changes || [],
      timestamp: data.timestamp || Date.now(),
    };
  }

  /**
   * Fetch all items (paginated) for full restore/pull
   */
  async fetchAllItems(
    params: { limit?: number; updatedAt__gt?: number } = {},
  ): Promise<{ items: ServerClipboardItem[]; total: number }> {
    const response = await this.http.get<
      IApiResponse<{ items: ServerClipboardItem[]; total: number }>
    >("/clipboard", {
      params,
    });

    return {
      items: response.data?.data?.items || [],
      total: response.data?.data?.total || 0,
    };
  }
}
