import { CryptoEngine } from "@encryptedclipboard/crypto";
import { workerManager } from "@shared/utils/worker-manager";
import { WorkerAction } from "@shared/types/worker.type";
import { EncryptionUtils } from "@shared/utils/encryption.utils";

export class MasterPassUtils {
  private static masterPassword: string | null = null;

  // Fixed salt for password storage encryption (not for data encryption)
  // Split into parts to obfuscate in bundled code
  private static readonly _saltPart1 = "E2E_STORAGE";
  private static readonly _saltPart2 = "_PROTECTION";
  private static readonly _saltPart3 = "_V1_DO_NOT";
  private static readonly _saltPart4 = "_CHANGE";

  private static readonly STORAGE_ENCRYPTION_SALT = new TextEncoder().encode(
    MasterPassUtils._saltPart1 +
      MasterPassUtils._saltPart2 +
      MasterPassUtils._saltPart3 +
      MasterPassUtils._saltPart4,
  );

  private static readonly VERIFICATION_PEPPER = "E2E_VERIFICATION_SALT";

  /**
   * Set user's master password (called during setup or login)
   * Password is stored encrypted in local storage if auto-sync is enabled
   */
  static async setMasterPassword(password: string): Promise<void> {
    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }

    MasterPassUtils.masterPassword = password;

    try {
      const encryptedPassword =
        await MasterPassUtils.encryptPasswordForStorage(password);
      await chrome.storage.local.set({
        e2eMasterPasswordEncrypted: encryptedPassword,
      });
    } catch (error) {
      console.error("[E2E] Failed to store encrypted password:", error);
    }

    const passwordHash = await workerManager.executeTask<string>(
      WorkerAction.HASH_PASSWORD,
      {
        password,
        salt: MasterPassUtils.VERIFICATION_PEPPER,
      },
    );
    await chrome.storage.local.set({
      e2ePasswordHash: passwordHash,
      e2ePasswordSet: true,
    });
  }

  /**
   * Verify if provided password matches the stored hash
   */
  static async verifyMasterPassword(password: string): Promise<boolean> {
    const result = await chrome.storage.local.get(["e2ePasswordHash"]);
    if (!result || !result.e2ePasswordHash) {
      return false;
    }

    const passwordHash = await workerManager.executeTask<string>(
      WorkerAction.HASH_PASSWORD,
      {
        password,
        salt: MasterPassUtils.VERIFICATION_PEPPER,
      },
    );
    return passwordHash === result.e2ePasswordHash;
  }

  /**
   * Check if user has set up a master password
   */
  static async hasMasterPassword(): Promise<boolean> {
    const result = await chrome.storage.local.get(["e2ePasswordSet"]);
    return result.e2ePasswordSet === true;
  }

  /**
   * Load master password (user must enter it)
   */
  static async loadMasterPassword(password: string): Promise<boolean> {
    const isValid = await MasterPassUtils.verifyMasterPassword(password);
    if (isValid) {
      MasterPassUtils.masterPassword = password;
      const encryptedPassword =
        await MasterPassUtils.encryptPasswordForStorage(password);
      await chrome.storage.local.set({
        e2eMasterPasswordEncrypted: encryptedPassword,
      });
      return true;
    }
    return false;
  }

  /**
   * Try to load master password from local storage
   */
  static async ensurePasswordLoaded(): Promise<void> {
    if (MasterPassUtils.masterPassword) return;

    try {
      const result = await chrome.storage.local.get([
        "e2eMasterPasswordPinEncrypted",
        "e2eMasterPasswordEncrypted",
      ]);

      if (result && result.e2eMasterPasswordPinEncrypted) {
        return;
      }

      if (result && result.e2eMasterPasswordEncrypted) {
        MasterPassUtils.masterPassword =
          await MasterPassUtils.decryptPasswordFromStorage(
            result.e2eMasterPasswordEncrypted as {
              ciphertext: string;
              iv: string;
              authTag: string;
            },
          );
      }
    } catch (_) {}
  }

  /**
   * Clear password from memory (logout)
   */
  static clearPassword(): void {
    MasterPassUtils.masterPassword = null;
  }

  /**
   * Forget master password - removes it from local storage
   */
  static async forgetMasterPassword(): Promise<void> {
    MasterPassUtils.masterPassword = null;
    await MasterPassUtils.removeMasterPasswordFromStorage();
  }

  /**
   * Remove master password from storage (keep in memory)
   */
  static async removeMasterPasswordFromStorage(): Promise<void> {
    await chrome.storage.local.remove([
      "e2eMasterPasswordEncrypted",
      "e2eMasterPasswordPinEncrypted",
      "clipboardMasterPasswordSet",
    ]);
  }

  /**
   * Persist current master password to storage
   */
  static async persistCurrentPassword(): Promise<void> {
    if (MasterPassUtils.masterPassword) {
      const encryptedPassword = await MasterPassUtils.encryptPasswordForStorage(
        MasterPassUtils.masterPassword,
      );
      await chrome.storage.local.set({
        e2eMasterPasswordEncrypted: encryptedPassword,
      });
    }
  }

  /**
   * Check if password is loaded in memory
   */
  static async isPasswordLoaded(): Promise<boolean> {
    await MasterPassUtils.ensurePasswordLoaded();
    return MasterPassUtils.masterPassword !== null;
  }

  /**
   * Alias for checking if password is ready for use (loaded)
   */
  static async isMasterPasswordSet(): Promise<boolean> {
    return MasterPassUtils.isPasswordLoaded();
  }

  /**
   * Get the current master password (internal use only)
   */
  static getMasterPassword(): string | null {
    return MasterPassUtils.masterPassword;
  }

  /**
   * Change master password (re-encrypt all data)
   */
  static async changeMasterPassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const isValid = await MasterPassUtils.verifyMasterPassword(oldPassword);
    if (!isValid) {
      throw new Error("Current password is incorrect");
    }

    const strength = EncryptionUtils.validatePasswordStrength(newPassword);
    if (!strength.isStrong) {
      throw new Error(
        "New password is not strong enough: " + strength.feedback.join(", "),
      );
    }

    await MasterPassUtils.setMasterPassword(newPassword);
    return true;
  }

  static async encryptPasswordForStorage(password: string): Promise<{
    ciphertext: string;
    iv: string;
    authTag: string;
  }> {
    return await CryptoEngine.encryptPasswordForStorage(
      password,
      MasterPassUtils.STORAGE_ENCRYPTION_SALT,
      600000, // Always use 600k for master password storage
    );
  }

  static async decryptPasswordFromStorage(encrypted: {
    ciphertext: string;
    iv: string;
    authTag: string;
  }): Promise<string> {
    return await CryptoEngine.decryptPasswordFromStorage(
      encrypted,
      MasterPassUtils.STORAGE_ENCRYPTION_SALT,
    );
  }
}
