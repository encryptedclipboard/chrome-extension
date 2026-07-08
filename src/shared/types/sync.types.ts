import { StorageType, SyncStage } from "../enums";
import { MessageType } from "./message.types";
import type { CookieItem } from "./storage-item.type";

// ─── Encryption ───────────────────────────────────────────────

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
  authTag: string;
  richAuthTag?: string;
  version?: number;
  iterations?: number;
}

// ─── Sync Data ────────────────────────────────────────────────

export interface DecryptedPayload {
  metadata: {
    timestamp: number;
    domain: string;
    storageType: StorageType;
  };
  data: { [key: string]: string };
}

export interface SyncData {
  domain: string;
  storageType: StorageType;
  // For cookies we store an array of CookieItem; otherwise a key->value map
  data: { [key: string]: string } | CookieItem[];
  deviceId?: string;
  deviceName?: string;
}

// ─── Sync Response ────────────────────────────────────────────

// Discriminated union so callers can safely narrow based on `encrypted` flag
export type SyncResponseData =
  | {
      domain: string;
      storageType: StorageType;
      data: EncryptedData;
      encrypted: true;
      lastSynced: Date;
    }
  | {
      domain: string;
      storageType: StorageType;
      data: { [key: string]: string } | CookieItem[];
      encrypted: false;
      lastSynced: Date;
    };

// Axios response - automatically wraps in { data: ... }
export interface SyncResponse {
  data: SyncResponseData;
  message?: string;
}

// ─── Sync Status ──────────────────────────────────────────────

export interface SyncedStorageInfo {
  domain: string;
  storageType: StorageType;
  itemCount: number;
  lastSynced: Date;
  deviceName?: string;
}

export interface SyncStatusResponse {
  lastSynced?: Date;
  totalItems: number;
  domains: string[];
  syncedStorages: SyncedStorageInfo[];
}

// ─── Sync Progress ────────────────────────────────────────────

export interface SyncProgress {
  stage: SyncStage;
  current?: number;
  total?: number;
  message?: string;
}

export interface SyncProgressMessage {
  type: MessageType.SYNC_PROGRESS;
  syncProgress: SyncProgress;
}

// ─── Sync Options ─────────────────────────────────────────────

export interface FullSyncOptions {
  isManual?: boolean;
  checkOnly?: boolean;
  ignoreLock?: boolean;
  skipPush?: boolean;
  skipFetch?: boolean;
  silent?: boolean;
  skipRetry?: boolean;
  mpc?: {
    totalItems: number;
  };
}
