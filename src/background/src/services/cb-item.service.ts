import { ClipboardItemType, ClipboardItem } from "@shared/types";
import { SyncStatus } from "@shared/enums/sync-status.enum";
import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import { hydrateImageContent } from "@shared/utils/image-hydration.util";

const STORE_NAME = "clipboard_items";
const DATA_STORE_NAME = "clipboard_data";

/**
 * CbItemService
 * Handles clipboard item operations including:
 * - Item CRUD (get, toggle favorite, tags)
 * - Item queries (paginated, by type, search)
 * - Sync status management
 */
export class CbItemService extends ClipboardDBService {
  /**
   * Get items with pagination
   * @param limit Number of items to return
   * @param offset Starting position
   * @param orderBy Index to use for ordering
   */
  async getItemsPaginated(
    limit: number = 50,
    offset: number = 0,
    orderBy: "by-created" | "by-type" | "by-favorite" = "by-created",
    excludeTypes: ClipboardItemType[] = [],
    includeTypes: ClipboardItemType[] = [],
  ): Promise<ClipboardItem[]> {
    const db = await this.getDB();

    const items: ClipboardItem[] = [];
    let cursor = await db
      .transaction("clipboard_items")
      .store.index(orderBy)
      .openCursor(null, "prev");

    let skipped = 0;
    let collected = 0;

    // Set of excluded/included types for fast lookup
    const excludedSet = new Set(excludeTypes);
    const includedSet = new Set(includeTypes);

    while (cursor) {
      const item = cursor.value;

      // Skip deleted items
      if (item.isDeleted) {
        cursor = await cursor.continue();
        continue;
      }

      // Skip excluded types
      if (excludedSet.has(item.type)) {
        cursor = await cursor.continue();
        continue;
      }

      // Filter by included types if set is not empty
      if (includedSet.size > 0 && !includedSet.has(item.type)) {
        cursor = await cursor.continue();
        continue;
      }

      if (skipped < offset) {
        skipped++;
        cursor = await cursor.continue();
        continue;
      }

      if (collected >= limit) {
        break;
      }

      items.push(item);
      collected++;
      cursor = await cursor.continue();
    }

    return items;
  }

  /**
   * Get filtered items with pagination using cursor
   * High performance memory-efficient filtering that applies constraints directly via cursor stream
   */
  async getFilteredItemsPaginated(
    limit: number = 50,
    offset: number = 0,
    filters: {
      searchKeyword?: string;
      searchType?: string;
      selectedTypes?: Set<ClipboardItemType>;
      showFavoritesOnly?: boolean;
      showSyncedOnly?: boolean;
      dateFrom?: number | null;
      dateTo?: number | null;
    } = {},
  ): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const items: ClipboardItem[] = [];

    type FilterIndexName = "by-created" | "by-favorite" | "by-sync-status";
    type FilterIndexBound = number | SyncStatus | null;

    let indexName: FilterIndexName = "by-created";
    let indexBound: FilterIndexBound = null;

    if (filters.showFavoritesOnly) {
      indexName = "by-favorite";
      indexBound = 1;
    } else if (filters.showSyncedOnly) {
      indexName = "by-sync-status";
      indexBound = SyncStatus.SYNCED;
    }

    let cursor = await db
      .transaction("clipboard_items")
      .store.index(indexName)
      .openCursor(indexBound, "prev");

    let skipped = 0;
    let collected = 0;

    const lowerSearch = filters.searchKeyword?.trim().toLowerCase();

    while (cursor) {
      const item = cursor.value;

      if (item.isDeleted) {
        cursor = await cursor.continue();
        continue;
      }

      // Type Match (from smart search or checkboxes)
      let matchesType = true;
      if (filters.searchType && filters.searchType !== "all") {
        matchesType = item.type === filters.searchType;
      } else if (filters.selectedTypes && filters.selectedTypes.size > 0) {
        matchesType = filters.selectedTypes.has(item.type);
      }

      if (!matchesType) {
        cursor = await cursor.continue();
        continue;
      }

      if (filters.dateFrom && item.createdAt < filters.dateFrom) {
        cursor = await cursor.continue();
        continue;
      }

      if (filters.dateTo && item.createdAt > filters.dateTo) {
        cursor = await cursor.continue();
        continue;
      }

      if (lowerSearch) {
        const content = (item.content as string) || "";
        const richContent = (item.richContent as string) || "";

        if (
          !content.toLowerCase().includes(lowerSearch) &&
          !richContent.toLowerCase().includes(lowerSearch)
        ) {
          cursor = await cursor.continue();
          continue;
        }
      }

      if (skipped < offset) {
        skipped++;
        cursor = await cursor.continue();
        continue;
      }

      if (collected >= limit) {
        break;
      }

      items.push(item);
      collected++;
      cursor = await cursor.continue();
    }

    return items;
  }

  async getFilteredCount(
    filters: {
      searchKeyword?: string;
      searchType?: string;
      selectedTypes?: Set<ClipboardItemType>;
      showFavoritesOnly?: boolean;
      showSyncedOnly?: boolean;
      dateFrom?: number | null;
      dateTo?: number | null;
    } = {},
  ): Promise<number> {
    const db = await this.getDB();

    let indexName: "by-created" | "by-favorite" | "by-sync-status" =
      "by-created";
    let indexBound: any = null;

    if (filters.showFavoritesOnly) {
      indexName = "by-favorite";
      indexBound = 1;
    } else if (filters.showSyncedOnly) {
      indexName = "by-sync-status";
      indexBound = SyncStatus.SYNCED;
    }

    let cursor = await db
      .transaction("clipboard_items")
      .store.index(indexName)
      .openCursor(indexBound, "prev");

    let count = 0;
    const lowerSearch = filters.searchKeyword?.trim().toLowerCase();

    while (cursor) {
      const item = cursor.value;

      if (item.isDeleted) {
        cursor = await cursor.continue();
        continue;
      }

      // Type Match (from smart search or checkboxes)
      let matchesType = true;
      if (filters.searchType && filters.searchType !== "all") {
        matchesType = item.type === filters.searchType;
      } else if (filters.selectedTypes && filters.selectedTypes.size > 0) {
        matchesType = filters.selectedTypes.has(item.type);
      }

      if (!matchesType) {
        cursor = await cursor.continue();
        continue;
      }

      if (filters.dateFrom && item.createdAt < filters.dateFrom) {
        cursor = await cursor.continue();
        continue;
      }

      if (filters.dateTo && item.createdAt > filters.dateTo) {
        cursor = await cursor.continue();
        continue;
      }

      if (lowerSearch) {
        const content = (item.content as string) || "";
        const richContent = (item.richContent as string) || "";

        if (
          !content.toLowerCase().includes(lowerSearch) &&
          !richContent.toLowerCase().includes(lowerSearch)
        ) {
          cursor = await cursor.continue();
          continue;
        }
      }

      count++;
      cursor = await cursor.continue();
    }

    return count;
  }

  /**
   * Searchable text-based item types (excludes IMAGE, FILE, etc.)
   */
  private static readonly ITEM_SEARCHABLE_TYPES: ClipboardItemType[] = [
    ClipboardItemType.TEXT,
    ClipboardItemType.JSON,
    ClipboardItemType.EMOJI,
    ClipboardItemType.OTP,
    ClipboardItemType.URL,
    ClipboardItemType.PHONE,
    ClipboardItemType.IP,
    ClipboardItemType.EMAIL,
  ];

  /**
   * Search items by content using cursor-based iteration (memory efficient)
   * Only searches text-based types using the by-type index
   */
  async searchItems(query: string): Promise<ClipboardItem[]> {
    const db = await this.getDB();

    if (!query || !query.trim()) {
      const db = await this.getDB();
      const allItems = await db.getAll("clipboard_items");
      return allItems.filter((item: ClipboardItem) => !item.isDeleted);
    }

    const lowerQuery = query.trim().toLowerCase();
    const results: ClipboardItem[] = [];

    for (const type of CbItemService.ITEM_SEARCHABLE_TYPES) {
      let cursor = await db
        .transaction("clipboard_items")
        .store.index("by-type")
        .openCursor(IDBKeyRange.only(type), "prev");

      while (cursor) {
        const item = cursor.value;

        if (!item.isDeleted) {
          const content = (item.content as string) || "";
          if (content.toLowerCase().includes(lowerQuery)) {
            results.push(item);
          }
        }

        cursor = await cursor.continue();
      }
    }

    return results;
  }

  /**
   * Get items by type
   */
  async getItemsByType(type: ClipboardItemType): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const items = await db.getAllFromIndex("clipboard_items", "by-type", type);
    return items
      .filter((i: ClipboardItem) => !i.isDeleted)
      .sort((a: ClipboardItem, b: ClipboardItem) => b.createdAt - a.createdAt);
  }

  /**
   * Get favorite items
   */
  async getFavoriteItems(): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const items = await db.getAllFromIndex("clipboard_items", "by-favorite", 1);
    return items
      .filter((i: ClipboardItem) => !i.isDeleted)
      .sort((a: ClipboardItem, b: ClipboardItem) => b.createdAt - a.createdAt);
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(id: string): Promise<number> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) throw new Error("Item not found");

    item.isFavorite = item.isFavorite ? 0 : 1;
    item.updatedAt = Date.now();

    // If item is synced (has _id), mark as pending sync so changes are uploaded
    if (item._id && item.syncStatus !== SyncStatus.PENDING_DELETE) {
      item.syncStatus = SyncStatus.PENDING;
    }

    await db.put("clipboard_items", item);
    return item.isFavorite;
  }

  /**
   * Add tags to an item
   */
  async addTags(id: string, tags: string[]): Promise<void> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) throw new Error("Item not found");

    item.tags = [...new Set([...item.tags, ...tags])];
    item.updatedAt = Date.now();

    // Sync propagation
    if (item._id && item.syncStatus !== SyncStatus.PENDING_DELETE) {
      item.syncStatus = SyncStatus.PENDING;
    }

    await db.put("clipboard_items", item);
  }

  /**
   * Remove tags from an item
   */
  async removeTags(id: string, tags: string[]): Promise<void> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) throw new Error("Item not found");

    item.tags = item.tags.filter((tag) => !tags.includes(tag));
    item.updatedAt = Date.now();

    // Sync propagation
    if (item._id && item.syncStatus !== SyncStatus.PENDING_DELETE) {
      item.syncStatus = SyncStatus.PENDING;
    }

    await db.put("clipboard_items", item);
  }

  /**
   * Update sync status of an item
   */
  async updateSyncStatus(
    id: string,
    status: SyncStatus | string,
    serverId?: string,
    error?: string,
  ): Promise<void> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) throw new Error("Item not found");

    item.syncStatus = status as any;
    item.isSynced = status === SyncStatus.SYNCED; // Keep legacy field in sync

    if (status === SyncStatus.SYNCED) {
      item.lastSyncedAt = Date.now();
      if (serverId) item._id = serverId;
      item.failedSyncAttempts = 0;
      item.lastSyncError = undefined;
    } else if (status === SyncStatus.ERROR) {
      item.lastSyncError = error;
    }

    await db.put("clipboard_items", item);
  }

  /**
   * Mark items as synced (legacy method for compatibility)
   */
  async markAsSynced(ids: string[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction("clipboard_items", "readwrite");

    for (const id of ids) {
      const item = await tx.store.get(id);
      if (item) {
        item.isSynced = true;
        item.syncStatus = SyncStatus.SYNCED;
        item.lastSyncedAt = Date.now();
        item.failedSyncAttempts = 0;
        item.lastSyncError = undefined;
        await tx.store.put(item);
      }
    }

    await tx.done;
  }

  /**
   * Increment failed sync attempts for an item
   */
  async incrementSyncAttempts(id: string): Promise<number> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) throw new Error("Item not found");

    item.failedSyncAttempts = (item.failedSyncAttempts || 0) + 1;
    await db.put("clipboard_items", item);
    return item.failedSyncAttempts;
  }

  /**
   * Mark item as updated (sets updatedAt to now)
   */
  async markAsUpdated(id: string): Promise<void> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) throw new Error("Item not found");

    item.updatedAt = Date.now();
    // When local item is updated, mark as needing sync
    if (item.syncStatus === SyncStatus.SYNCED) {
      item.syncStatus = SyncStatus.LOCAL;
      item.isSynced = false;
    }
    await db.put("clipboard_items", item);
  }

  /**
   * Demote an item to local status (Orphan reconciliation)
   * Clears server ID and sync status
   */
  async demoteToLocal(id: string): Promise<void> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) return;

    item.syncStatus = SyncStatus.LOCAL;
    item.isSynced = false;
    item._id = undefined; // Clear server ID
    item.lastSyncError = undefined;

    await db.put("clipboard_items", item);
  }

  /**
   * Mark an item as retention expired
   * Clears server ID and sets sync status to retention_expired
   * This prevents it from being re-synced automatically
   */
  async markRetentionExpired(id: string): Promise<void> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) return;

    item.syncStatus = SyncStatus.RETENTION_EXPIRED;
    item.isSynced = false;
    item._id = undefined; // Clear server ID
    item.lastSyncError = undefined;

    await db.put("clipboard_items", item);
  }

  /**
   * Demote ALL synced items to local (Orphan reconciliation)
   * Used when no user is logged in but items still show as synced.
   */
  async demoteAllSyncedToLocal(): Promise<void> {
    const db = await this.getDB();
    const syncedItems = await this.getSyncedItems();

    if (syncedItems.length === 0) return;

    const tx = db.transaction("clipboard_items", "readwrite");

    for (const item of syncedItems) {
      item.syncStatus = SyncStatus.LOCAL;
      item.isSynced = false;
      item._id = undefined;
      item.lastSyncError = undefined;
      await tx.store.put(item);
    }

    await tx.done;
  }

  async *getItemsWithContent(batchSize = 100): AsyncIterable<ClipboardItem[]> {
    const db = await this.getDB();
    let lastKey: IDBValidKey | undefined;
    while (true) {
      const tx = db.transaction([STORE_NAME], "readonly");
      const range = lastKey ? IDBKeyRange.lowerBound(lastKey, true) : undefined;
      const items = await tx.objectStore(STORE_NAME).getAll(range, batchSize);
      await tx.done;
      if (items.length === 0) break;
      const valid = items.filter((item: ClipboardItem) => !item.isDeleted);
      if (valid.length > 0) {
        const hydrated = await hydrateImageContent(valid, db);
        yield hydrated;
      }
      lastKey = items[items.length - 1].id;
    }
  }

  async addRestoredItem(item: ClipboardItem): Promise<void> {
    const db = await this.getDB();
    await db.put(STORE_NAME, item);
  }
}
