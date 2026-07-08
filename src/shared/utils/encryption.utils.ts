import { CryptoEngine } from "@encryptedclipboard/crypto";
import type {
  EncryptedData,
  PasswordStrength,
} from "@encryptedclipboard/crypto";
import { workerManager } from "@shared/utils/worker-manager";
import { WorkerAction } from "@shared/types/worker.type";

export type { PasswordStrength };

export class EncryptionUtils {
  static async encrypt(data: any, password: string): Promise<EncryptedData> {
    return await workerManager.executeTask<EncryptedData>(
      WorkerAction.ENCRYPT,
      {
        data,
        password,
      },
    );
  }

  static async encryptWithCredentials(
    data: any,
    password: string,
    options: { salt: Uint8Array; iv: Uint8Array; iterations?: number },
  ): Promise<EncryptedData> {
    return await workerManager.executeTask<EncryptedData>(
      WorkerAction.ENCRYPT_WITH_CREDENTIALS,
      {
        data,
        password,
        options: {
          salt: options.salt,
          iv: options.iv,
          iterations: options.iterations,
        },
      },
    );
  }

  static async encryptBatch(
    dataList: any[],
    password: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<EncryptedData[]> {
    return await workerManager.executeBatch<any, EncryptedData>(
      WorkerAction.ENCRYPT,
      dataList,
      { password },
      onProgress,
    );
  }

  static async decrypt(
    encryptedData: EncryptedData,
    password: string,
  ): Promise<any> {
    try {
      return await workerManager.executeTask<any>(WorkerAction.DECRYPT, {
        encryptedData,
        password,
      });
    } catch (error) {
      throw new Error(
        "Failed to decrypt data. Incorrect password or corrupted data.",
      );
    }
  }

  static async decryptBatch(
    encryptedList: EncryptedData[],
    password: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<any[]> {
    return await workerManager.executeBatch<EncryptedData, any>(
      WorkerAction.DECRYPT,
      encryptedList,
      { password },
      onProgress,
    );
  }

  static async tryDecrypt(
    encryptedData: EncryptedData,
    candidatePassword: string,
  ): Promise<boolean> {
    return await workerManager.executeTask<boolean>(WorkerAction.TRY_DECRYPT, {
      encryptedData,
      password: candidatePassword,
    });
  }

  static async verifyPasswordAgainstData(
    password: string,
    encryptedData: EncryptedData,
  ): Promise<boolean> {
    return await workerManager.executeTask<boolean>(WorkerAction.TRY_DECRYPT, {
      encryptedData,
      password,
    });
  }

  static validatePasswordStrength(password: string): PasswordStrength {
    return CryptoEngine.validatePasswordStrength(password);
  }
}
