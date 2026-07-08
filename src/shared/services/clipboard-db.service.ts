/**
 * IndexedDB Service for Clipboard Items
 *
 * High-performance storage for clipboard history with:
 * - Text and image support
 * - Efficient pagination using cursors
 * - Thumbnail generation for images
 * - Metadata tracking (hostname, tags, favorites)
 */

import { v4 as uuidv4 } from "uuid";
import { openDB, type IDBPDatabase } from "idb";
import { ClipboardItemType } from "../enums/clipboard-item-type.enum";
import { SyncStatus } from "../enums/sync-status.enum";
import {
  type ClipboardItemMetadata,
  type ClipboardItem,
  type ClipboardDBSchema,
  type SyncDownloadedItem,
  type SyncUploadItem,
  type ServerClipboardItem,
} from "../types/db.types";
import { getClipboardDB } from "../utils/clipboard-db.util";
import { hydrateImageContent } from "../utils/image-hydration.util";

export {
  ClipboardItemType,
  type ClipboardItemMetadata,
  type SyncStatus,
  type ClipboardItem,
  type ClipboardDBSchema,
};

const STORE_NAME = "clipboard_items";
const DATA_STORE_NAME = "clipboard_data";

export class ClipboardDBService {
  private _db: IDBPDatabase<ClipboardDBSchema> | null = null;

  /**
   * Get database instance - lazy initialization
   * Protected: child services use this.getDB()
   */
  protected async getDB(): Promise<IDBPDatabase<ClipboardDBSchema>> {
    if (!this._db) {
      this._db = await getClipboardDB();
    }
    return this._db;
  }

  /**
   * Add a new clipboard item
   */
  async addItem(
    type: ClipboardItemType,
    content: string,
    metadata: ClipboardItemMetadata = {},
    thumbnail?: string,
    richContent?: string,
  ): Promise<ClipboardItem> {
    // Runtime type validation - ensure content is string for non-IMAGE types
    if (type !== ClipboardItemType.IMAGE) {
      if (typeof content !== "string") {
        console.warn(
          "[ClipboardDB] Non-string content received, coercing to string:",
          typeof content,
        );
        content = String(content ?? "");
      }
    }

    const db = await this.getDB();

    const now = Date.now();
    const item: ClipboardItem = {
      id: uuidv4(),
      type,
      content,
      richContent,
      metadata: {
        ...metadata,
        // hostname should be provided by the caller (content script)
        // DO NOT use window.location.hostname here as it would be the extension's URL
      },
      createdAt: now,
      updatedAt: now,
      isSynced: false,
      syncStatus: SyncStatus.LOCAL,
      tags: [],

      isFavorite: 0,
      thumbnail,
    };

    // Adding item to DB
    try {
      const tx = db.transaction([STORE_NAME, DATA_STORE_NAME], "readwrite");

      // If image, store content in data store and keep content empty in item store
      if (type === ClipboardItemType.IMAGE) {
        // Store heavy data
        await tx.objectStore(DATA_STORE_NAME).put({
          id: item.id,
          data: content,
        });

        // Clear content in main item (thumbnail should already be in item object if provided)
        item.content = "";
      }

      await tx.objectStore(STORE_NAME).add(item);
      await tx.done;

      // Item added successfully
      return item;
    } catch (error) {
      console.error("[ClipboardDB] Failed to add item:", error);
      throw error;
    }
  }

  /**
   * Restore a deleted item (Undo Delete)
   * This uses .put() instead of .add() to allow restoring with existing ID
   */
  async restoreItem(item: ClipboardItem): Promise<void> {
    const db = await this.getDB();
    try {
      const tx = db.transaction([STORE_NAME, DATA_STORE_NAME], "readwrite");

      // If image, ensure data is restored to data store
      if (
        item.type === ClipboardItemType.IMAGE &&
        item.content &&
        item.content.startsWith("data:")
      ) {
        await tx.objectStore(DATA_STORE_NAME).put({
          id: item.id,
          data: item.content,
        });
        // Clear content in main item record
        const itemToStore = { ...item, content: "" };
        await tx.objectStore(STORE_NAME).put(itemToStore);
      } else {
        await tx.objectStore(STORE_NAME).put(item);
      }

      await tx.done;
    } catch (error) {
      console.error("Failed to restore item:", error);
      throw error;
    }
  }

  /**
   * Get the latest item (most recently created)
   */
  async getLatestItem(): Promise<ClipboardItem | undefined> {
    const db = await this.getDB();
    const cursor = await db
      .transaction(STORE_NAME)
      .store.index("by-created")
      .openCursor(null, "prev");
    const item = cursor?.value;

    if (item && item.type === ClipboardItemType.IMAGE) {
      try {
        const dataItem = await db.get(DATA_STORE_NAME, item.id);
        if (dataItem) {
          item.content = dataItem.data;
        }
      } catch (e) {
        console.warn(
          `[ClipboardDB] Failed to read image data for ${item.id}:`,
          e,
        );
      }
    }

    return item;
  }

  /**
   * Get a single item by ID
   */
  async getItem(id: string): Promise<ClipboardItem | undefined> {
    const db = await this.getDB();
    const item = await db.get(STORE_NAME, id);

    if (item && item.type === ClipboardItemType.IMAGE) {
      try {
        const dataItem = await db.get(DATA_STORE_NAME, id);
        if (dataItem) {
          item.content = dataItem.data;
        }
      } catch (e) {
        console.warn(`[ClipboardDB] Failed to read image data for ${id}:`, e);
      }
    }

    return item;
  }

  /**
   * Batch fetch items by IDs - single transaction, parallel requests
   */
  async getItems(ids: string[]): Promise<ClipboardItem[]> {
    if (ids.length === 0) return [];
    const db = await this.getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const items = await Promise.all(ids.map((id) => tx.store.get(id)));
    await tx.done;
    const validItems = items.filter(
      (item): item is ClipboardItem => item !== undefined && !item.isDeleted,
    );
    return hydrateImageContent(validItems, db);
  }

  /**
   * Get all items (use with caution - prefer pagination)
   */
  async getAllItems(): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const all = await db.getAll(STORE_NAME);
    const validItems = all.filter((item: ClipboardItem) => !item.isDeleted);
    return hydrateImageContent(validItems, db);
  }

  /**
   * Helper to hydrate image content from clipboard_data store
   * Used for Export and Sync to ensure full data availability
   */
  private async hydrateImageContent(
    items: ClipboardItem[],
  ): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const hydratedItems = await Promise.all(
      items.map(async (item) => {
        if (item.type === ClipboardItemType.IMAGE && !item.content) {
          try {
            const dataItem = await db.get(DATA_STORE_NAME, item.id);
            if (dataItem && dataItem.data) {
              return { ...item, content: dataItem.data };
            }
          } catch (e) {
            console.warn(`[ClipboardDB] Failed to hydrate image ${item.id}`, e);
          }
        }
        return item;
      }),
    );
    return hydratedItems;
  }

  /**
   * Get items with pagination using cursor
   * @param limit Number of items to fetch
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
      .transaction(STORE_NAME)
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
      .transaction(STORE_NAME)
      .store.index(indexName)
      .openCursor(indexBound, "prev");

    let skipped = 0;
    let collected = 0;
    const lowerKeyword = filters.searchKeyword?.trim()?.toLowerCase();

    while (cursor) {
      const item = cursor.value;

      // 1. Skip deleted items
      if (item.isDeleted) {
        cursor = await cursor.continue();
        continue;
      }

      // 2. Type Match (from smart search or checkboxes)
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

      // 3. Keyword Match (for text-based types)
      let matchesKeyword = true;
      if (lowerKeyword) {
        matchesKeyword = false;
        if (
          item.type === ClipboardItemType.TEXT ||
          item.type === ClipboardItemType.JSON ||
          item.type === ClipboardItemType.EMOJI ||
          item.type === ClipboardItemType.OTP ||
          item.type === ClipboardItemType.URL ||
          item.type === ClipboardItemType.PHONE ||
          item.type === ClipboardItemType.IP ||
          item.type === ClipboardItemType.EMAIL
        ) {
          const content = typeof item.content === "string" ? item.content : "";
          matchesKeyword = content.toLowerCase().includes(lowerKeyword);
        }
      }

      if (!matchesKeyword) {
        cursor = await cursor.continue();
        continue;
      }

      // 4. Date Range Match
      if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
        const itemDate = item.createdAt;
        if (filters.dateFrom && itemDate < filters.dateFrom) {
          cursor = await cursor.continue();
          continue;
        }
        if (filters.dateTo && itemDate > filters.dateTo) {
          cursor = await cursor.continue();
          continue;
        }
      }

      // If we pass all filters, handle pagination bounds
      if (skipped < offset) {
        skipped++;
        cursor = await cursor.continue();
        continue;
      }

      items.push(item);
      collected++;

      if (collected >= limit) {
        break;
      }

      cursor = await cursor.continue();
    }

    return hydrateImageContent(items, db);
  }

  /**
   * Get the total count of items matching the current filters
   * Useful for showing "Showing X of Y matching items" without loading all Y items
   */
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
    let indexBound: number | SyncStatus | null = null;

    if (filters.showFavoritesOnly) {
      indexName = "by-favorite";
      indexBound = 1;
    } else if (filters.showSyncedOnly) {
      indexName = "by-sync-status";
      indexBound = SyncStatus.SYNCED;
    }

    let cursor = await db
      .transaction(STORE_NAME)
      .store.index(indexName)
      .openCursor(indexBound, "prev");

    let count = 0;
    const lowerKeyword = filters.searchKeyword?.trim()?.toLowerCase();

    while (cursor) {
      const item = cursor.value;

      if (item.isDeleted) {
        cursor = await cursor.continue();
        continue;
      }

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

      let matchesKeyword = true;
      if (lowerKeyword) {
        matchesKeyword = false;
        if (
          item.type === ClipboardItemType.TEXT ||
          item.type === ClipboardItemType.JSON ||
          item.type === ClipboardItemType.EMOJI ||
          item.type === ClipboardItemType.OTP ||
          item.type === ClipboardItemType.URL ||
          item.type === ClipboardItemType.PHONE ||
          item.type === ClipboardItemType.IP ||
          item.type === ClipboardItemType.EMAIL
        ) {
          const content = typeof item.content === "string" ? item.content : "";
          matchesKeyword = content.toLowerCase().includes(lowerKeyword);
        }
      }

      if (!matchesKeyword) {
        cursor = await cursor.continue();
        continue;
      }

      // Date Range Match
      if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
        const itemDate = item.createdAt;
        if (filters.dateFrom && itemDate < filters.dateFrom) {
          cursor = await cursor.continue();
          continue;
        }
        if (filters.dateTo && itemDate > filters.dateTo) {
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
  private static readonly SEARCHABLE_TYPES: ClipboardItemType[] = [
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
      const allItems = await db.getAll(STORE_NAME);
      return allItems.filter((item: ClipboardItem) => !item.isDeleted);
    }

    const lowerQuery = query.trim().toLowerCase();
    const results: ClipboardItem[] = [];

    for (const type of ClipboardDBService.SEARCHABLE_TYPES) {
      let cursor = await db
        .transaction(STORE_NAME)
        .store.index("by-type")
        .openCursor(IDBKeyRange.only(type), "prev");

      while (cursor) {
        const item = cursor.value;

        if (!item.isDeleted) {
          const content = typeof item.content === "string" ? item.content : "";
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
   * Update an existing item
   */
  async updateItem(id: string, updates: Partial<ClipboardItem>): Promise<void> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) throw new Error("Item not found");

    const updatedItem = { ...item, ...updates, id }; // Ensure ID doesn't change
    await db.put(STORE_NAME, updatedItem);
  }

  /**
   * Delete an item (Soft delete if synced, hard delete if local)
   */
  async deleteItem(id: string): Promise<void> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) return;

    // If item is already synced, we must soft delete it so we can push the deletion
    if (
      item.syncStatus === SyncStatus.SYNCED ||
      item.syncStatus === SyncStatus.ERROR ||
      item.isSynced
    ) {
      item.isDeleted = true;
      item.deletedAt = Date.now();
      item.syncStatus = SyncStatus.PENDING_DELETE;
      item.updatedAt = Date.now(); // Update timestamp so delta sync picks it up? Actually pending_delete is special query.

      await db.put(STORE_NAME, item);
      // Soft deleted item
    } else {
      // Local only or pending push (never synced), just hard delete
      await this.hardDelete(id);
      // Hard deleted local item
    }
  }

  /**
   * Hard Delete an item (Permanently remove from DB)
   */
  async hardDelete(id: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction([STORE_NAME, DATA_STORE_NAME], "readwrite");
    await tx.objectStore(STORE_NAME).delete(id);
    await tx.objectStore(DATA_STORE_NAME).delete(id);
    await tx.done;
  }

  /**
   * Delete multiple items
   */
  async deleteItems(ids: string[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  }

  /**
   * Clear all items from both stores
   */
  async clearAll(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction([STORE_NAME, DATA_STORE_NAME], "readwrite");
    await tx.objectStore(STORE_NAME).clear();
    await tx.objectStore(DATA_STORE_NAME).clear();
    await tx.done;
  }

  /**
   * Get total count of items
   */
  async getCount(): Promise<number> {
    const db = await this.getDB();
    return db.count(STORE_NAME);
  }

  /**
   * Get count of synced items
   */
  async getSyncedCount(): Promise<number> {
    const db = await this.getDB();
    return db.countFromIndex(STORE_NAME, "by-sync-status", SyncStatus.SYNCED);
  }

  /**
   * Get all synced items
   */
  async getSyncedItems(): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const items = await db.getAllFromIndex(
      STORE_NAME,
      "by-sync-status",
      SyncStatus.SYNCED,
    );
    return items.filter((i: ClipboardItem) => !i.isDeleted);
  }

  /**
   * Get items by type
   */
  async getItemsByType(type: ClipboardItemType): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const items = await db.getAllFromIndex(STORE_NAME, "by-type", type);
    return items
      .filter((i: ClipboardItem) => !i.isDeleted)
      .sort((a: ClipboardItem, b: ClipboardItem) => b.createdAt - a.createdAt);
  }

  /**
   * Get favorite items
   */
  async getFavoriteItems(): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const items = await db.getAllFromIndex(STORE_NAME, "by-favorite", 1);
    return items
      .filter((i: ClipboardItem) => !i.isDeleted)
      .sort((a: ClipboardItem, b: ClipboardItem) => b.createdAt - a.createdAt);
  }

  /**
   * Get unsynced items (local or pending)
   */
  async getUnsyncedItems(): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const localItems = await db.getAllFromIndex(
      STORE_NAME,
      "by-sync-status",
      SyncStatus.LOCAL,
    );
    const pendingItems = await db.getAllFromIndex(
      STORE_NAME,
      "by-sync-status",
      SyncStatus.PENDING,
    );
    const pendingDeleteItems = await db.getAllFromIndex(
      STORE_NAME,
      "by-sync-status",
      SyncStatus.PENDING_DELETE,
    );

    return [...localItems, ...pendingItems, ...pendingDeleteItems];
  }

  /**
   * Get items with pending sync status
   */
  async getPendingSyncItems(): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const pendingPush = await db.getAllFromIndex(
      STORE_NAME,
      "by-sync-status",
      SyncStatus.PENDING,
    );
    const pendingDelete = await db.getAllFromIndex(
      STORE_NAME,
      "by-sync-status",
      SyncStatus.PENDING_DELETE,
    );
    const errorItems = await db.getAllFromIndex(
      STORE_NAME,
      "by-sync-status",
      SyncStatus.ERROR,
    );
    const allItems = [...pendingPush, ...pendingDelete, ...errorItems];
    return hydrateImageContent(allItems, db);
  }

  /**
   * Get items with error sync status
   */
  async getErrorSyncItems(): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    return db.getAllFromIndex(STORE_NAME, "by-sync-status", SyncStatus.ERROR);
  }

  /**
   * Update sync status of an item
   */
  async updateSyncStatus(
    id: string,
    status: SyncStatus,
    serverId?: string,
    error?: string,
  ): Promise<void> {
    const db = await this.getDB();
    const item = await this.getItem(id);
    if (!item) throw new Error("Item not found");

    item.syncStatus = status;
    item.isSynced = status === SyncStatus.SYNCED; // Keep legacy field in sync

    if (status === SyncStatus.SYNCED) {
      item.lastSyncedAt = Date.now();
      if (serverId) item._id = serverId;
      item.failedSyncAttempts = 0;
      item.lastSyncError = undefined;
    } else if (status === SyncStatus.ERROR) {
      item.lastSyncError = error;
    }

    await db.put(STORE_NAME, item);
  }

  /**
   * Mark items as synced (legacy method for compatibility)
   */
  async markAsSynced(ids: string[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");

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
    await db.put(STORE_NAME, item);
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
    await db.put(STORE_NAME, item);
  }

  /**
   * Upsert item from cloud (for sync)
   * Uses by-server-id index for efficient lookup
   */
  async upsertFromCloud(serverItem: {
    _id: string;
    type: ClipboardItemType;
    content: string;
    metadata: ClipboardItemMetadata;
    tags: string[];
    isFavorite: boolean;
    createdAt: number;
    updatedAt: number;
    thumbnail?: string;
  }): Promise<void> {
    const db = await this.getDB();

    // Check if item already exists by server ID using index
    const existingItem = await this.getItemByServerId(serverItem._id);

    const now = Date.now();
    // Ensure content is string (defensive coercion for data from server)
    const safeContent =
      typeof serverItem.content === "string"
        ? serverItem.content
        : String(serverItem.content ?? "");

    const item: ClipboardItem = {
      id: existingItem?.id || uuidv4(),
      type: serverItem.type as ClipboardItemType,
      content: safeContent,
      metadata: serverItem.metadata,
      createdAt: serverItem.createdAt,
      updatedAt: serverItem.updatedAt,
      isSynced: true,
      syncStatus: SyncStatus.SYNCED,
      tags: serverItem.tags,
      isFavorite: serverItem.isFavorite ? 1 : 0,
      _id: serverItem._id,
      lastSyncedAt: now,
      thumbnail: serverItem.thumbnail, // Save thumbnail if provided
    };

    await db.put(STORE_NAME, item);
  }

  /**
   * Get item by server ID
   * Uses by-server-id index for efficient lookup
   */
  async getItemByServerId(
    serverId: string,
  ): Promise<ClipboardItem | undefined> {
    const db = await this.getDB();
    try {
      return await db.getFromIndex(STORE_NAME, "by-server-id", serverId);
    } catch {
      return undefined;
    }
  }

  /**
   * Get a map of server IDs to local IDs and timestamps
   * Efficient for batch checking existence
   */
  async getServerIdMap(): Promise<
    Map<string, { id: string; updatedAt: number }>
  > {
    const db = await this.getDB();
    const map = new Map<string, { id: string; updatedAt: number }>();
    const tx = db.transaction(STORE_NAME);
    let cursor = await tx.store.openCursor();

    while (cursor) {
      const item = cursor.value;
      if (item._id) {
        map.set(item._id, { id: item.id, updatedAt: item.updatedAt });
      }
      cursor = await cursor.continue();
    }
    return map;
  }

  /**
   * Find item by content (exact match)
   * Returns local ID if found
   */
  async findItemByContent(content: string): Promise<string | undefined> {
    const allItems = await this.getAllItems();
    const item = allItems.find((i) => i.content === content);
    return item?.id;
  }

  /**
   * Delete item by server ID
   * Uses by-server-id index for efficient lookup
   */
  async deleteByServerId(serverId: string): Promise<void> {
    const db = await this.getDB();
    const item = await this.getItemByServerId(serverId);
    if (item) {
      // Server already deleted it, so we hard delete locally.
      // Do NOT use deleteItem() as that soft-deletes synced items and queues a push.
      await this.hardDelete(item.id);
    }
  }

  /**
   * Delete multiple items by server IDs (Tombstones)
   */
  async deleteItemsByServerIds(
    serverIds: string[],
    onProgress?: (current: number, total: number) => void,
  ): Promise<void> {
    const db = await this.getDB();
    // Use efficient map lookup instead of scanning all items
    const localIdMap = await this.getServerIdMap();
    const idsToDelete: string[] = [];

    for (const serverId of serverIds) {
      const local = localIdMap.get(serverId);
      if (local) {
        idsToDelete.push(local.id);
      }
    }

    const total = idsToDelete.length;
    if (total > 0) {
      const tx = db.transaction([STORE_NAME, DATA_STORE_NAME], "readwrite");
      let completed = 0;
      await Promise.all(
        idsToDelete.map(async (id) => {
          await tx.objectStore(STORE_NAME).delete(id);
          await tx.objectStore(DATA_STORE_NAME).delete(id);
          completed++;
          onProgress?.(completed, total);
        }),
      );
      await tx.done;
    }
  }

  /**
   * Get all items without image hydration (for memory-efficient operations)
   * Use when you need items but don't need full image data immediately
   */
  async getAllItemsLightweight(): Promise<ClipboardItem[]> {
    const db = await this.getDB();
    const all = await db.getAll(STORE_NAME);
    return all.filter((item: ClipboardItem) => !item.isDeleted);
  }

  /**
   * Get total item count
   */
  async count(): Promise<number> {
    const db = await this.getDB();
    // Check customStore existence to be safe with idb wrapper types, or just use try/catch
    return await db.count(STORE_NAME);
  }

  /**
   * Get total approximate storage size in bytes
   */
  async getTotalSize(): Promise<number> {
    const db = await this.getDB();
    let totalSize = 0;

    // 1. Calculate size of items store
    let cursor = await db.transaction(STORE_NAME).store.openCursor();
    while (cursor) {
      // Rough estimation using JSON stringify
      const json = JSON.stringify(cursor.value);
      totalSize += new Blob([json]).size; // Accurate byte size including utf8 chars
      cursor = await cursor.continue();
    }

    // 2. Calculate size of data store (images)
    try {
      if (db.objectStoreNames.contains("clipboard_data")) {
        let dataCursor = await db
          .transaction(DATA_STORE_NAME)
          .store.openCursor();
        while (dataCursor) {
          const val = dataCursor.value;
          if (val && val.data) {
            // data is base64 string
            totalSize += val.data.length;
          }
          dataCursor = await dataCursor.continue();
        }
      }
    } catch (e) {
      // Ignore if store doesn't exist
    }

    return totalSize;
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
      // We don't reset isSynced to false because it IS synced, just has pending changes.
      // But our sync logic typically looks for 'pending' status.
      // Actually, standard logic often uses isSynced=false to denote 'needs sync'.
      // usage in SyncOrchestrator: pendingItems = getPendingSyncItems() -> by-sync-status 'pending'
      // So setting syncStatus = 'pending' is correct.
    }

    await db.put(STORE_NAME, item);
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

    await db.put(STORE_NAME, item);
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

    await db.put(STORE_NAME, item);
  }

  /**
   * Upsert a fully formed item (e.g. from sync)
   */
  async upsertSyncedItem(item: ClipboardItem): Promise<void> {
    const db = await this.getDB();
    await db.put(STORE_NAME, item);
  }

  async upsertSyncedItems(items: ClipboardItem[]): Promise<void> {
    if (items.length === 0) return;
    const db = await this.getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    for (const item of items) {
      await tx.store.put(item);
    }
    await tx.done;
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

    await db.put(STORE_NAME, item);
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

    await db.put(STORE_NAME, item);
  }

  /**
   * Demote ALL synced items to local (Orphan reconciliation)
   * Used when no user is logged in but items still show as synced.
   */
  async demoteAllSyncedToLocal(): Promise<void> {
    const db = await this.getDB();
    const syncedItems = await this.getSyncedItems();

    if (syncedItems.length === 0) return;

    const tx = db.transaction(STORE_NAME, "readwrite");
    const updates = syncedItems.map((item) => {
      const updatedItem = {
        ...item,
        syncStatus: SyncStatus.LOCAL as SyncStatus,
        isSynced: false,
        _id: undefined, // Clear server ID
        lastSyncError: undefined,
      };
      return tx.store.put(updatedItem);
    });

    await Promise.all(updates);
    await tx.done;
  }

  /**
   * Import items from backup
   * Generates new IDs and marks as local to prevent sync conflicts
   */
  async importItems(
    items: Partial<ClipboardItem>[],
  ): Promise<{ imported: number; skipped: number }> {
    const db = await this.getDB();

    // Pre-fetch all text-based items for deduplication
    const allItems = await this.getAllItems();
    // Create a Set of "type:content" signatures for existing items
    const existingSignatures = new Set(
      allItems
        .filter((i) => i.type !== ClipboardItemType.IMAGE)
        .map((i) => `${i.type}:${i.content}`),
    );

    const tx = db.transaction([STORE_NAME, DATA_STORE_NAME], "readwrite");
    const now = Date.now();
    let importedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      // VALIDATION: Skip empty content (Fixes "0 byte" import issue)
      if (
        !item.type ||
        (!item.content && item.type !== ClipboardItemType.IMAGE) ||
        (item.type === ClipboardItemType.IMAGE && !item.content)
      ) {
        skippedCount++;
        continue;
      }

      // Deduplication check for non-image items
      if (item.type !== ClipboardItemType.IMAGE) {
        const signature = `${item.type}:${item.content}`;
        if (existingSignatures.has(signature)) {
          // Skipping duplicate import
          skippedCount++;
          continue;
        }
        // Add to set to catch duplicates within the import batch itself
        existingSignatures.add(signature);
      }

      // Check if metadata needs size calculation (Fix for missing size on import)
      const metadata = item.metadata || {};
      if (!metadata.size && item.content) {
        metadata.size = item.content.length;
      }

      const newItem: ClipboardItem = {
        id: uuidv4(),
        type: item.type as ClipboardItemType,
        content: item.content || "",
        metadata: metadata,
        createdAt: item.createdAt || now, // Preserve creation time if available
        updatedAt: now,
        isSynced: false,
        syncStatus: SyncStatus.LOCAL,
        tags: item.tags || [],
        isFavorite: item.isFavorite ? 1 : 0,
        thumbnail: item.thumbnail,
      };

      // Handle image data if present
      if (newItem.type === ClipboardItemType.IMAGE) {
        // If content is present, it's likely the base64 data.
        // We need to store it in the separate store like addItem does.
        await tx.objectStore(DATA_STORE_NAME).put({
          id: newItem.id,
          data: newItem.content,
        });
        newItem.content = ""; // Clear content in main item
      }

      await tx.objectStore(STORE_NAME).add(newItem);
      importedCount++;
    }

    await tx.done;
    return { imported: importedCount, skipped: skippedCount };
  }

  async saveSyncDownloadedItems(items: ServerClipboardItem[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction("sync_downloaded", "readwrite");
    const store = tx.objectStore("sync_downloaded");
    for (const item of items) {
      await store.put({
        id: item._id,
        serverId: item._id,
        data: item,
        status: "downloaded",
      });
    }
    await tx.done;
  }

  async getUnprocessedSyncItems(
    batchSize: number,
  ): Promise<SyncDownloadedItem[]> {
    const db = await this.getDB();
    const items: SyncDownloadedItem[] = [];
    let cursor = await db
      .transaction("sync_downloaded")
      .store.index("by-created")
      .openCursor(null, "prev");
    while (cursor && items.length < batchSize) {
      if (cursor.value.status === "downloaded") {
        items.push(cursor.value);
      }
      cursor = await cursor.continue();
    }
    return items;
  }

  async markSyncItemsDone(ids: string[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction("sync_downloaded", "readwrite");
    const store = tx.objectStore("sync_downloaded");
    for (const id of ids) {
      const item = await store.get(id);
      if (item) {
        item.status = "done";
        await store.put(item);
      }
    }
    await tx.done;
  }

  async countUnprocessedSyncItems(): Promise<number> {
    const db = await this.getDB();
    let count = 0;
    let cursor = await db
      .transaction("sync_downloaded")
      .store.index("by-status")
      .openCursor(IDBKeyRange.only("downloaded"));
    while (cursor) {
      count++;
      cursor = await cursor.continue();
    }
    return count;
  }

  async getTotalSyncDownloadedCount(): Promise<number> {
    const db = await this.getDB();
    return await db.count("sync_downloaded");
  }

  async clearSyncStore(): Promise<void> {
    const db = await this.getDB();
    await db.clear("sync_downloaded");
  }

  // ─── Upload Temp Store ─────────────────────────────────────────────

  async saveSyncUploadItems(items: SyncUploadItem[]): Promise<void> {
    if (items.length === 0) return;
    const db = await this.getDB();
    const tx = db.transaction("sync_upload_items", "readwrite");
    const store = tx.objectStore("sync_upload_items");
    for (const item of items) {
      await store.put(item);
    }
    await tx.done;
  }

  async getPendingSyncUploadItems(limit: number): Promise<SyncUploadItem[]> {
    const db = await this.getDB();
    return await db.getAllFromIndex(
      "sync_upload_items",
      "by-status",
      "encrypted",
      limit,
    );
  }

  async markSyncUploadItemsDone(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.getDB();
    const tx = db.transaction("sync_upload_items", "readwrite");
    const store = tx.objectStore("sync_upload_items");
    for (const id of ids) {
      const item = await store.get(id);
      if (item) {
        item.status = "uploaded";
        await store.put(item);
      }
    }
    await tx.done;
  }

  async clearSyncUploadStore(): Promise<void> {
    const db = await this.getDB();
    await db.clear("sync_upload_items");
  }

  async batchUpdateSyncStatus(
    serverItems: ServerClipboardItem[],
  ): Promise<void> {
    if (serverItems.length === 0) return;
    const db = await this.getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await Promise.all(
      serverItems
        .filter(
          (si): si is ServerClipboardItem & { localId: string } => !!si.localId,
        )
        .map(async (si) => {
          const item = await store.get(si.localId);
          if (!item) return;
          item._id = si._id;
          item.syncStatus = SyncStatus.SYNCED;
          item.isSynced = true;
          item.lastSyncedAt = Date.now();
          item.updatedAt = new Date(si.updatedAt).getTime();
          await store.put(item);
        }),
    );
    await tx.done;
  }
}
