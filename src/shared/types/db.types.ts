import type { DBSchema } from "idb";
import { ClipboardItemType } from "../enums/clipboard-item-type.enum";
import { SyncStatus } from "../enums/sync-status.enum";
import type { EncryptedData } from "./encryption.type";

export interface ClipboardItemMetadata {
  sourceUrl?: string;
  hostname?: string;
  size?: number;
  hasRichContent?: boolean;
}

export interface ClipboardItem {
  id: string;
  type: ClipboardItemType;
  content: string;
  richContent?: string; // HTML representation for formatted text
  metadata: ClipboardItemMetadata;
  createdAt: number;
  updatedAt: number;
  isSynced: boolean; // Deprecated, use syncStatus instead
  syncStatus: SyncStatus;

  // Deletion tracking
  isDeleted?: boolean;
  deletedAt?: number;

  tags: string[];
  isFavorite: number; // 0 = false, 1 = true (for IndexedDB compatibility)
  thumbnail?: string; // Base64 thumbnail for images
  // Encryption
  isEncrypted?: boolean;
  encryptionData?: Omit<EncryptedData, "ciphertext">; // Ciphertext is stored in content
  // Cloud sync fields
  _id?: string; // MongoDB ObjectId for synced items
  lastSyncedAt?: number;
  failedSyncAttempts?: number;
  lastSyncError?: string;
}

export interface ClipboardData {
  id: string;
  data: string; // Full content data (e.g., full resolution image base64)
}

import type { ServerClipboardItem } from "./clipboard.types";
export type { ServerClipboardItem };

export interface SyncDownloadedItem {
  id: string;
  serverId: string;
  data: ServerClipboardItem;
  status: "downloaded" | "done";
}

import type { ClipboardBatchItem } from "./clipboard.types";

export interface SyncUploadItem {
  id: string;
  localId: string;
  payload: ClipboardBatchItem;
  status: "encrypted" | "uploaded" | "failed";
}

export interface ClipboardDBSchema extends DBSchema {
  clipboard_items: {
    key: string;
    value: ClipboardItem;
    indexes: {
      "by-type": string;
      "by-created": number;
      "by-synced": number;
      "by-favorite": number;
      "by-sync-status": SyncStatus;
      "by-updated": number;
      "by-is-deleted": number;
      "by-server-id": string;
    };
  };
  clipboard_data: {
    key: string;
    value: ClipboardData;
  };
  sync_downloaded: {
    key: string;
    value: SyncDownloadedItem;
    indexes: {
      "by-status": string;
      "by-created": number;
    };
  };
  sync_upload_items: {
    key: string;
    value: SyncUploadItem;
    indexes: {
      "by-status": string;
    };
  };
}
