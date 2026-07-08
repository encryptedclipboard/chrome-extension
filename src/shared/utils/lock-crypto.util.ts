import { LOCK_CONFIG } from "../../config";
import type { ClipboardItem } from "../types/db.types";
import type { EncryptedClipboardItem } from "../types/lock.types";
import { CryptoEngine } from "@encryptedclipboard/crypto";

export async function encryptLockItem(
  item: ClipboardItem,
  pin: string,
  engine: CryptoEngine,
): Promise<EncryptedClipboardItem> {
  const encrypted = await engine.encryptData(item, pin);

  return {
    id: item.id,
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    salt: encrypted.salt,
    authTag: encrypted.authTag,
    createdAt: item.createdAt,
  };
}

export async function decryptLockItem(
  encrypted: EncryptedClipboardItem,
  pin: string,
  engine: CryptoEngine,
): Promise<ClipboardItem> {
  const encryptedData = {
    ciphertext: encrypted.encryptedData,
    iv: encrypted.iv,
    salt: encrypted.salt,
    authTag: encrypted.authTag,
    version: 1,
    iterations: LOCK_CONFIG.PBKDF2_ITERATIONS,
  };

  return await engine.decryptData<ClipboardItem>(encryptedData, pin);
}
