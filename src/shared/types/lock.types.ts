import type { DBSchema } from "idb";

export interface EncryptedClipboardItem {
  id: string;
  encryptedData: string; // JSON stringified then encrypted
  iv: string;
  salt: string;
  authTag: string;
  createdAt: number;
}

export interface LockDBSchema extends DBSchema {
  encrypted_items: {
    key: string;
    value: EncryptedClipboardItem;
    indexes: {
      "by-created": number;
    };
  };
}

export interface LockSettings {
  isLocked: boolean;
  pinHash: string | null;
  autoLockMinutes: number;
  lastActivityAt: number;
}
