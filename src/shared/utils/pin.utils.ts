import { CryptoEngine } from "@encryptedclipboard/crypto";
import type { EncryptedData } from "@encryptedclipboard/crypto";
import { LOCK_CONFIG } from "../../config";

export class PinUtils {
  private static readonly lockCrypto = new CryptoEngine({
    iterations: LOCK_CONFIG.PBKDF2_ITERATIONS,
  });

  static async encryptPasswordWithPin(
    password: string,
    pin: string,
  ): Promise<EncryptedData> {
    return await PinUtils.lockCrypto.encryptPasswordWithPin(password, pin);
  }

  static async decryptPasswordWithPin(
    encrypted: EncryptedData,
    pin: string,
  ): Promise<string> {
    return await PinUtils.lockCrypto.decryptPasswordWithPin(encrypted, pin);
  }
}
