import { openDB, type IDBPDatabase } from "idb";
import type { ClipboardItem } from "./clipboard-db.service";
import type {
  EncryptedClipboardItem,
  LockDBSchema,
  LockSettings,
} from "@shared/types/lock.types";
import { LOCK_CONFIG } from "../../config";
import { workerManager } from "@shared/utils/worker-manager";
import { WorkerAction } from "@shared/types/worker.type";
import { StorageUtil } from "../utils/extension-storage.util";
import { MasterPassUtils } from "../utils/master-pass.utils";
import { PinUtils } from "../utils/pin.utils";

/**
 * Lock Service
 *
 * Provides PIN-based locking for clipboard data with encryption.
 * When locked, all items are encrypted and moved to a secure store.
 * When unlocked, items are decrypted and restored to main store.
 * Pure service: Does not access main ClipboardDB directly.
 */

export class LockService {
  private lockDB: IDBPDatabase<LockDBSchema> | null = null;
  private cachedPin: string | null = null;
  private _isLockInProgress = false;

  readonly LOCK_BATCH_SIZE = 100;

  isLockInProgress(): boolean {
    return this._isLockInProgress;
  }

  setLockInProgress(value: boolean): void {
    this._isLockInProgress = value;
  }

  // private activityCheckInterval: any = null; // Removed in favor of Alarms API

  async init(): Promise<void> {
    if (this.lockDB) return;

    this.lockDB = await openDB<LockDBSchema>(
      LOCK_CONFIG.DB_NAME,
      LOCK_CONFIG.DB_VERSION,
      {
        upgrade(db) {
          if (!db.objectStoreNames.contains(LOCK_CONFIG.STORE_NAME)) {
            const store = db.createObjectStore(LOCK_CONFIG.STORE_NAME, {
              keyPath: "id",
            });
            store.createIndex("by-created", "createdAt");
          }
        },
      },
    );

    // Start auto-lock check - NO, we wait for activity or explicit set
    // await this.startAutoLockCheck(); // Removed
  }

  /**
   * Get database instance safely
   */
  private async getDb(): Promise<IDBPDatabase<LockDBSchema>> {
    if (!this.lockDB) await this.init();
    if (!this.lockDB) throw new Error("Failed to initialize lock database");
    return this.lockDB;
  }

  /**
   * Get lock settings from storage
   */
  async getLockSettings(): Promise<LockSettings> {
    const result = (await chrome.storage.local.get([
      "clipboardLocked",
      "clipboardPinHash",
      "clipboardAutoLockMinutes",
      "clipboardLastActivity",
    ])) as {
      clipboardLocked?: boolean;
      clipboardPinHash?: string;
      clipboardAutoLockMinutes?: number;
      clipboardLastActivity?: number;
    };

    return {
      isLocked: result.clipboardLocked ?? false,
      pinHash: result.clipboardPinHash ?? null,
      autoLockMinutes: result.clipboardAutoLockMinutes ?? 0,
      lastActivityAt: result.clipboardLastActivity ?? Date.now(),
    };
  }

  /**
   * Check if clipboard is currently locked (Helper)
   */
  async isLockActive(): Promise<boolean> {
    const result = (await chrome.storage.local.get(["clipboardLocked"])) as {
      clipboardLocked?: boolean;
    };
    return result.clipboardLocked ?? false;
  }

  /**
   * Check if PIN is set
   */
  async isPinSet(): Promise<boolean> {
    const settings = await this.getLockSettings();
    return settings.pinHash !== null;
  }

  /**
   * Hash PIN for storage (not for encryption)
   */
  private async hashPin(pin: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return this.arrayBufferToBase64(hashBuffer);
  }

  /**
   * Derive encryption key from PIN
   */
  private async deriveKeyFromPin(
    pin: string,
    salt: ArrayBuffer,
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const pinBuffer = encoder.encode(pin);

    const baseKey = await crypto.subtle.importKey(
      "raw",
      pinBuffer,
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"],
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: LOCK_CONFIG.PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  /**
   * Set PIN for the first time
   */
  async setPin(pin: string): Promise<void> {
    if (!/^\d{6}$/.test(pin)) {
      throw new Error("PIN must be exactly 6 digits");
    }

    const pinHash = await this.hashPin(pin);

    await chrome.storage.local.set({
      clipboardPinHash: pinHash,
      clipboardLastActivity: Date.now(),
    });

    this.cachedPin = pin;
  }

  /**
   * Verify PIN
   */
  async verifyPin(pin: string): Promise<boolean> {
    const settings = await this.getLockSettings();
    if (!settings.pinHash) return false;

    const pinHash = await this.hashPin(pin);
    return pinHash === settings.pinHash;
  }

  /**
   * Lock clipboard - encrypt all provided items and move to secure store
   * Uses chunked processing to minimize memory usage
   * @param pin The PIN to encrypt with
   * @param itemStream Async iterable of items to encrypt and store
   * @param totalItems Total number of items to lock (for progress denominator)
   * @param onProgress Optional callback for progress updates (current, total)
   * @returns Object with total processed and failed count
   */
  async lock(
    pin: string,
    itemStream: AsyncIterable<ClipboardItem[]>,
    totalItems: number = 0,
    onProgress?: (
      current: number,
      total: number,
      stage: "password" | "items",
    ) => void,
  ): Promise<{ total: number; failed: number }> {
    await this.init();

    // Verify PIN is set and valid
    const isValid = await this.verifyPin(pin);
    if (!isValid) {
      throw new Error("Invalid PIN");
    }

    // Re-encrypt master password with PIN if it exists
    await MasterPassUtils.ensurePasswordLoaded();
    const isPasswordLoaded = await MasterPassUtils.isPasswordLoaded();

    if (isPasswordLoaded) {
      const masterPassword = MasterPassUtils.getMasterPassword();

      if (masterPassword) {
        const pinEncrypted = await PinUtils.encryptPasswordWithPin(
          masterPassword,
          pin,
        );

        await chrome.storage.local.set({
          e2eMasterPasswordPinEncrypted: pinEncrypted,
        });

        await chrome.storage.local.remove(["e2eMasterPasswordEncrypted"]);
        MasterPassUtils.clearPassword();
      }
    }

    const db = await this.getDb();
    let failed = 0;
    let globalCompleted = 0;

    try {
      for await (const batch of itemStream) {
        try {
          const encrypted = await workerManager.executeBatch<
            ClipboardItem,
            EncryptedClipboardItem
          >(
            WorkerAction.LOCK_ENCRYPT_BATCH,
            batch,
            { pin },
            (batchCurrent, batchTotal) => {
              if (onProgress) {
                onProgress(globalCompleted + batchCurrent, totalItems, "items");
              }
            },
          );

          const writeTx = db.transaction(LOCK_CONFIG.STORE_NAME, "readwrite");
          const store = writeTx.objectStore(LOCK_CONFIG.STORE_NAME);
          for (const enc of encrypted) {
            await store.put(enc);
          }
          await writeTx.done;
          globalCompleted += batch.length;
        } catch (err) {
          console.error("[ClipboardLock] Batch encryption failed:", err);
          failed += batch.length;
        }
      }
    } catch (err) {
      throw err;
    }

    this.cachedPin = null;

    return { total: globalCompleted, failed };
  }

  /**
   * Unlock clipboard - decrypt all items and restore to main clipboard
   * Uses chunked processing to minimize memory usage
   * @param pin The PIN to decrypt with
   * @param onProgress Optional callback for progress updates
   * @param addItemCallback Callback to add each decrypted item to main clipboard DB
   * @returns Object with total restored and failed count
   */
  async unlock(
    pin: string,
    onProgress?: (current: number, total: number) => void,
    addItemCallback?: (item: ClipboardItem) => Promise<void>,
  ): Promise<{ total: number; failed: number }> {
    await this.init();

    // Verify PIN
    const isValid = await this.verifyPin(pin);
    if (!isValid) {
      throw new Error("Invalid PIN");
    }

    this.cachedPin = pin;

    const db = await this.getDb();
    const total = await db.count(LOCK_CONFIG.STORE_NAME);

    if (total === 0) {
      await chrome.storage.local.set({
        clipboardLocked: false,
        clipboardLastActivity: Date.now(),
      });
      return { total: 0, failed: 0 };
    }

    let restored = 0;
    let failed = 0;
    let lastKey: IDBValidKey | undefined;

    for (;;) {
      const readTx = db.transaction(LOCK_CONFIG.STORE_NAME, "readonly");
      const range = lastKey ? IDBKeyRange.lowerBound(lastKey, true) : undefined;
      const batch = await (readTx.store as any).getAll(
        range,
        this.LOCK_BATCH_SIZE,
      );
      await readTx.done;

      if (batch.length === 0) break;

      try {
        const decrypted = await workerManager.executeBatch<
          EncryptedClipboardItem,
          ClipboardItem
        >(
          WorkerAction.LOCK_DECRYPT_BATCH,
          batch,
          { pin },
          (batchCurrent, batchTotal) => {
            if (onProgress) {
              onProgress(restored + batchCurrent, total);
            }
          },
        );

        // Write restored items
        if (addItemCallback) {
          for (const item of decrypted) {
            await addItemCallback(item);
          }
        }

        // Delete from lock store
        const deleteTx = db.transaction(LOCK_CONFIG.STORE_NAME, "readwrite");
        for (const enc of batch) {
          await deleteTx.objectStore(LOCK_CONFIG.STORE_NAME).delete(enc.id);
        }
        await deleteTx.done;

        restored += decrypted.length;
      } catch (err) {
        console.error("[ClipboardLock] Batch decryption failed:", err);
        failed += batch.length;
      }

      lastKey = batch[batch.length - 1].id;
    }

    // Re-encrypt master password with extension secret if it was PIN-encrypted
    try {
      const result = (await chrome.storage.local.get([
        "e2eMasterPasswordPinEncrypted",
      ])) as {
        e2eMasterPasswordPinEncrypted?: any;
      };

      if (result.e2eMasterPasswordPinEncrypted) {
        const masterPassword = await PinUtils.decryptPasswordWithPin(
          result.e2eMasterPasswordPinEncrypted,
          pin,
        );

        const extensionEncrypted =
          await MasterPassUtils.encryptPasswordForStorage(masterPassword);

        await chrome.storage.local.set({
          e2eMasterPasswordEncrypted: extensionEncrypted,
        });

        await chrome.storage.local.remove(["e2eMasterPasswordPinEncrypted"]);
        await MasterPassUtils.setMasterPassword(masterPassword);
      }
    } catch (error) {
      console.error(
        "[LockService] Failed to re-encrypt master password:",
        error,
      );
    }

    await chrome.storage.local.set({
      clipboardLocked: false,
      clipboardLastActivity: Date.now(),
    });

    return { total: restored, failed };
  }

  /**
   * Reset PIN and delete all encrypted data
   */
  async resetPin(): Promise<void> {
    await this.init();
    const db = await this.getDb();

    // Clear encrypted store
    await db.clear(LOCK_CONFIG.STORE_NAME);

    // Clear lock settings
    await chrome.storage.local.remove([
      "clipboardPinHash",
      "clipboardLocked",
      "clipboardAutoLockMinutes",
      "clipboardLastActivity",
    ]);

    // PIN reset
  }

  /**
   * Update last activity timestamp
   */
  async updateActivity(): Promise<void> {
    const settings = await this.getLockSettings();
    if (!settings.isLocked) {
      await chrome.storage.local.set({
        clipboardLastActivity: Date.now(),
      });
      // Reschedule alarms on activity
      if (settings.autoLockMinutes > 0) {
        await this.scheduleLockAlarms(settings.autoLockMinutes);
      }
    }
  }

  /**
   * Set auto-lock timer
   */
  async setAutoLock(minutes: number): Promise<void> {
    await chrome.storage.local.set({
      clipboardAutoLockMinutes: minutes,
      clipboardLastActivity: Date.now(),
    });

    await this.scheduleLockAlarms(minutes);
  }

  /**
   * Schedule Lock Alarms (Warning and Trigger)
   */
  async scheduleLockAlarms(minutes: number): Promise<void> {
    if (minutes <= 0) {
      chrome.alarms.clear("lock-warning");
      chrome.alarms.clear("lock-trigger");
      return;
    }

    // Alarm 1: Warning (1 minute before, if possible)
    if (minutes > 1) {
      chrome.alarms.create("lock-warning", {
        delayInMinutes: minutes - 1,
      });
    }

    // Alarm 2: Trigger
    chrome.alarms.create("lock-trigger", {
      delayInMinutes: minutes,
    });
  }

  /**
   * Handle Alarm Trigger
   */
  async handleAlarm(alarm: chrome.alarms.Alarm): Promise<boolean> {
    if (alarm.name === "lock-warning") {
      const settings = await this.getLockSettings();
      return !settings.isLocked && settings.autoLockMinutes > 0;
    }
    return false;
  }

  /**
   * Check if auto-lock should trigger (Called by Alarm)
   */
  private async checkAutoLock(): Promise<void> {
    const settings = await this.getLockSettings();

    // Double check conditions
    if (
      settings.isLocked ||
      settings.autoLockMinutes === 0 ||
      !settings.pinHash
    ) {
      return;
    }

    // Check if sync is in progress - don't auto-lock during sync
    const syncInProgress = await StorageUtil.getSyncInProgress();
    if (syncInProgress) {
      return;
    }

    // Mark as locked
    await chrome.storage.local.set({
      clipboardLocked: true,
    });

    // Clear password from memory
    MasterPassUtils.clearPassword();

    // Notify UI
    chrome.runtime.sendMessage({ type: "CLIPBOARD_LOCKED" }).catch(() => {});

    // Clear alarms
    chrome.alarms.clear("lock-warning");
    chrome.alarms.clear("lock-trigger");

    // Auto-lock triggered
  }

  /**
   * Utility: ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Utility: Base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Get count of encrypted items
   */
  async getEncryptedItemCount(): Promise<number> {
    const db = await this.getDb();
    return await db.count(LOCK_CONFIG.STORE_NAME);
  }

  /**
   * Clean up encrypted store (remove any partial data on failed lock)
   */
  async cleanupLockDb(): Promise<void> {
    const db = await this.getDb();
    await db.clear(LOCK_CONFIG.STORE_NAME);
  }
  /**
   * Get cached PIN for auto-lock
   */
  getCachedPin(): string | null {
    return this.cachedPin;
  }
}
