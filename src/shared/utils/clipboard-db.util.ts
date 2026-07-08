import { openDB, type IDBPDatabase } from "idb";
import type { ClipboardDBSchema } from "@shared/types/db.types";

const DB_NAME = "clipboard-manager-db";
const DB_VERSION = 11;
const STORE_NAME = "clipboard_items";

let dbInstance: IDBPDatabase<ClipboardDBSchema> | null = null;

export async function getClipboardDB(): Promise<
  IDBPDatabase<ClipboardDBSchema>
> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ClipboardDBSchema>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by-type", "type");
        store.createIndex("by-created", "createdAt");
        store.createIndex("by-synced", "isSynced");
        store.createIndex("by-favorite", "isFavorite");
        store.createIndex("by-sync-status", "syncStatus");
        store.createIndex("by-updated", "updatedAt");
        store.createIndex("by-is-deleted", "isDeleted");
        store.createIndex("by-server-id", "_id");
      }

      if (!db.objectStoreNames.contains("clipboard_data")) {
        db.createObjectStore("clipboard_data", { keyPath: "id" });
      }

      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
        const store = transaction.objectStore(STORE_NAME);
        if (!store.indexNames.contains("by-sync-status")) {
          store.createIndex("by-sync-status", "syncStatus");
        }
        if (!store.indexNames.contains("by-updated")) {
          store.createIndex("by-updated", "updatedAt");
        }
      }

      if (oldVersion < 4 && db.objectStoreNames.contains(STORE_NAME)) {
        const store = transaction.objectStore(STORE_NAME);
        if (!store.indexNames.contains("by-is-deleted")) {
          store.createIndex("by-is-deleted", "isDeleted");
        }
      }

      if (oldVersion < 7 && db.objectStoreNames.contains(STORE_NAME)) {
        const store = transaction.objectStore(STORE_NAME);
        let cursor = await store.openCursor();

        while (cursor) {
          const item = cursor.value;
          if (typeof item.isFavorite === "boolean") {
            item.isFavorite = item.isFavorite ? 1 : 0;
            await cursor.update(item);
          }
          cursor = await cursor.continue();
        }
      }

      if (oldVersion < 8 && db.objectStoreNames.contains(STORE_NAME)) {
        const store = transaction.objectStore(STORE_NAME);
        if (!store.indexNames.contains("by-server-id")) {
          store.createIndex("by-server-id", "_id");
        }
      }

      if (oldVersion < 9 && !db.objectStoreNames.contains("sync_downloaded")) {
        const store = db.createObjectStore("sync_downloaded", {
          keyPath: "id",
        });
        store.createIndex("by-status", "status");
      }

      if (oldVersion < 10 && db.objectStoreNames.contains("sync_downloaded")) {
        const store = transaction.objectStore("sync_downloaded");
        if (!store.indexNames.contains("by-created")) {
          store.createIndex("by-created", "data.createdAt");
        }
      }

      if (
        oldVersion < 11 &&
        !db.objectStoreNames.contains("sync_upload_items")
      ) {
        const store = db.createObjectStore("sync_upload_items", {
          keyPath: "id",
        });
        store.createIndex("by-status", "status");
      }
    },
  });

  return dbInstance;
}

export function resetClipboardDB(): void {
  dbInstance = null;
}
