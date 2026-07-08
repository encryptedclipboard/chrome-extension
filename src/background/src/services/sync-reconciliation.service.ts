import {
  ServerClipboardItem,
  CheckUpdatesResponse,
} from "@shared/types/clipboard.types";
import { ClipboardItem } from "@shared/types";
import { SyncStatus } from "@shared/enums/sync-status.enum";
import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import { sendUpdated } from "@shared/utils/message.utils";
import { fetchWithAuth } from "@shared/utils/http.utils";
import { API_CONFIG } from "@/config";
import { storageService } from "./index";

/**
 * Sync Reconciliation Service
 * Handles complex reconciliation between local and cloud states (Smart Sync).
 */
export class SyncReconciliationService extends ClipboardDBService {
  constructor() {
    super();
  }

  /**
   * Check for updates (Metadata only)
   */
  async checkUpdates(after: number): Promise<CheckUpdatesResponse | null> {
    try {
      const response = await fetchWithAuth<{
        data: {
          changes: {
            _id: string;
            updatedAt: string | number;
            isDeleted: boolean;
            deletedAt?: string | number;
          }[];
          count: number;
          timestamp: number;
        };
      }>(`/clipboard/sync/check?after=${after}`, { method: "GET" });

      if (!response.data) throw new Error("No data returned from sync check");

      // Clear alarm if successful
      chrome.alarms.clear("retry_check_updates").catch(() => {});

      return response.data;
    } catch (error) {
      console.warn("[SyncTrace] checkUpdates: FAILED -", error);
      return null;
    }
  }

  /**
   * Fetch changes using NDJSON streaming
   * Processes items in chunks of 100 inline - stream pauses briefly to decrypt and save
   */
  private async fetchStream(
    after: number,
    onChunk?: (chunk: ServerClipboardItem[]) => Promise<void>,
    onTotal?: (total: number) => void,
  ): Promise<{
    items: ServerClipboardItem[];
    tombstones: string[];
    timestamp: number;
  }> {
    const authToken = await chrome.storage.local.get("authToken");
    const token = authToken.authToken;

    if (!token) {
      throw new Error("No auth token found");
    }

    const response = await fetch(
      `${API_CONFIG.BASE_URL}/clipboard/sync/stream?after=${after}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Stream sync failed: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body for stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const items: ServerClipboardItem[] = [];
    let total = 0;
    let timestamp = Date.now();
    let lastProgressTime = Date.now();

    const CHUNK_SIZE = 50;
    const STREAM_TIMEOUT_MS = 60000;

    const checkTimeout = () => {
      const now = Date.now();
      if (now - lastProgressTime > STREAM_TIMEOUT_MS) {
        throw new Error("Stream timeout - no data received within 60 seconds");
      }
    };

    try {
      let consecutiveTimeouts = 0;
      const MAX_CONSECUTIVE_TIMEOUTS = 3;

      while (true) {
        const readPromise = reader.read();
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("Stream read timeout")),
            STREAM_TIMEOUT_MS,
          );
        });

        let readResult;
        try {
          readResult = await Promise.race([readPromise, timeoutPromise]);
          clearTimeout(timeoutId!);
        } catch (readError: any) {
          clearTimeout(timeoutId!);

          if (readError.message?.includes("timeout")) {
            consecutiveTimeouts++;
            if (consecutiveTimeouts > MAX_CONSECUTIVE_TIMEOUTS) {
              throw new Error("Stream failed - too many consecutive timeouts");
            }
            checkTimeout();
            // If checkTimeout didn't throw, we were actively processing data -
            // retry the read instead of failing
            continue;
          }

          throw readError;
        }

        consecutiveTimeouts = 0;
        const { done, value } = readResult;
        lastProgressTime = Date.now();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const message = JSON.parse(line);

            if (message.type === "metadata") {
              total = message.total;
              timestamp = message.timestamp;

              if (onTotal) {
                onTotal(total);
              }
            } else if (message.type === "item") {
              items.push(message.data);

              // Process chunk inline every CHUNK_SIZE items - stream pauses briefly
              if (onChunk && items.length >= CHUNK_SIZE) {
                const chunk = items.splice(0, CHUNK_SIZE);

                lastProgressTime = Date.now();
                await onChunk(chunk);
              }
            } else if (message.type === "summary") {
              timestamp = message.timestamp;
            } else if (message.type === SyncStatus.ERROR) {
              throw new Error(message.message);
            }
          } catch (parseError) {
            console.error(
              "[SyncReconciliation] Failed to parse NDJSON line:",
              line,
              parseError,
            );
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Fetch tombstones separately
    const tombstoneData = await this.fetchTombstones(after);

    return {
      items, // remaining items (< CHUNK_SIZE)
      tombstones: tombstoneData.tombstones,
      timestamp: Math.max(timestamp, tombstoneData.timestamp),
    };
  }

  /**
   * Fetch tombstones from server
   */
  private async fetchTombstones(
    after: number,
  ): Promise<{ tombstones: string[]; timestamp: number }> {
    const response = await fetchWithAuth<{
      data: {
        tombstones: string[];
        timestamp: number;
      };
    }>(`/clipboard/sync/tombstones?after=${after}`, { method: "GET" });

    const data = response.data;
    if (!data) throw new Error("No data returned from tombstones endpoint");

    return {
      tombstones: data.tombstones || [],
      timestamp: data.timestamp,
    };
  }

  /**
   * Fetch batch of items by IDs
   */
  private async fetchBatch(ids: string[]): Promise<ServerClipboardItem[]> {
    const response = await fetchWithAuth<{
      data: { items: ServerClipboardItem[] };
    }>("/clipboard/batch-retrieve", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });

    const items = response.data?.items;
    if (!items) throw new Error("No items returned from batch fetch");

    return items;
  }

  /**
   * Reconcile everything using lightweight manifest and targeted downloads
   */
  public async performSmartSync(
    items: ServerClipboardItem[],
    tombstones: string[],
    onChunk?: (chunk: ServerClipboardItem[]) => Promise<void>,
    onTotal?: (total: number) => void,
  ): Promise<void> {
    // 1. Get lightweight manifest
    const result = await this.checkUpdates(0);
    if (!result) {
      return;
    }
    const allChanges = result.changes;

    const cloudActive = allChanges.filter((c) => !c.isDeleted);
    const cloudTombstones = allChanges
      .filter((c) => c.isDeleted)
      .map((c) => c._id);

    tombstones.push(...cloudTombstones);

    // 2. Reconciliation Logic
    const localItems = await this.getAllItems();
    const localMap = new Map(localItems.map((i) => [i._id, i]));
    // Build a secondary index of items without _id by updatedAt to catch the
    // auto-sync race: item was uploaded to server (server has _id) but
    // updateSyncStatus hasn't committed _id to IndexedDB yet. If we match
    // by updatedAt, we can set _id on the local item and avoid a re-download.
    const pendingByUpdatedAt = new Map<number, ClipboardItem>();
    for (const item of localItems) {
      if (!item._id) {
        pendingByUpdatedAt.set(item.updatedAt, item);
      }
    }
    const missingIds: string[] = [];

    for (const cloudMeta of cloudActive) {
      const localItem = localMap.get(cloudMeta._id);
      if (!localItem) {
        const cloudTime = new Date(cloudMeta.updatedAt).getTime();
        const pendingMatch = pendingByUpdatedAt.get(cloudTime);
        if (pendingMatch) {
          // This server item matches a local item that was just uploaded but
          // its _id hasn't been persisted yet. Set _id now to prevent
          // re-downloading and creating a duplicate.
          await this.updateItem(pendingMatch.id, {
            _id: cloudMeta._id,
            syncStatus: SyncStatus.SYNCED,
            lastSyncedAt: Date.now(),
            updatedAt: cloudTime,
          });
          continue;
        }
        missingIds.push(cloudMeta._id);
      } else {
        const cloudTime = new Date(cloudMeta.updatedAt).getTime();
        if (cloudTime > localItem.updatedAt) {
          missingIds.push(cloudMeta._id);
        }
      }
    }

    // 3. Optimized Download Strategy
    if (missingIds.length > 0) {
      if (missingIds.length > 20) {
        const streamResult = await this.fetchStream(0, onChunk, onTotal);

        // Remaining items (< CHUNK_SIZE) go back to orchestrator for final processing
        items.push(...streamResult.items);
        tombstones.push(...streamResult.tombstones);
      } else {
        const batchItems = await this.fetchBatch(missingIds);
        items.push(...batchItems);
      }
    }
  }

  async reconcileOrphanedItems(): Promise<void> {
    try {
      const authData = await storageService.getAuthData();
      if (!authData?.authToken) return;

      const serverResult = await this.checkUpdates(0);

      if (!serverResult) {
        console.warn(
          "[SyncReconciliation] Orphan reconciliation skipped - server unavailable",
        );
        return;
      }

      const activeServerIds = new Set(
        serverResult.changes
          .filter((c: any) => !c.isDeleted)
          .map((c: any) => c._id),
      );

      const dbItems = await this.getAllItems();
      const locallySyncedItems = dbItems.filter(
        (item) => item.syncStatus === SyncStatus.SYNCED && item._id,
      );

      let orphanedCount = 0;

      for (const item of locallySyncedItems) {
        if (item._id && !activeServerIds.has(item._id)) {
          await this.demoteToLocal(item.id);
          orphanedCount++;
        }
      }

      if (orphanedCount > 0) {
        sendUpdated();
        this.updateBadge();
      }
    } catch (error: any) {
      if (
        error.response?.status === 401 ||
        error.message?.includes("Session invalid")
      ) {
        console.warn(
          "[SyncReconciliation] Orphan reconciliation skipped: Session expired",
        );
        return;
      }
      console.error(
        "[SyncReconciliation] Orphan reconciliation failed:",
        error,
      );
    }
  }

  private updateBadge(): void {
    if (typeof chrome !== "undefined" && chrome.action) {
      chrome.action
        .getBadgeText({})
        .then((text) => {
          if (!text) return;
          const count = parseInt(text, 10) || 0;
          if (count > 0) {
            chrome.action.setBadgeText({ text: count.toString() });
          }
        })
        .catch(() => {});
    }
  }
}
