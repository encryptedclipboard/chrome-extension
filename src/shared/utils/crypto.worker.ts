import { CryptoEngine } from "@encryptedclipboard/crypto";
import {
  WorkerAction,
  type WorkerMessageRequest,
  type WorkerMessageResponse,
} from "../types/worker.type";
import { LOCK_CONFIG } from "../../config";

const workerSyncCrypto = new CryptoEngine({
  iterations: 400000,
  concurrency: 50,
});

const workerLockCrypto = new CryptoEngine({
  iterations: LOCK_CONFIG.PBKDF2_ITERATIONS,
  concurrency: 10,
});

self.onmessage = async (event: MessageEvent<WorkerMessageRequest>) => {
  const { id, action, payload } = event.data;

  try {
    let result;

    switch (action) {
      case WorkerAction.ENCRYPT:
        result = await workerSyncCrypto.encryptData(
          payload.data,
          payload.password,
        );
        break;

      case WorkerAction.ENCRYPT_WITH_CREDENTIALS:
        result = await CryptoEngine.encryptDataWithCredentials(
          payload.data,
          payload.password,
          payload.options,
        );
        break;

      case WorkerAction.DECRYPT:
        result = await CryptoEngine.decryptData(
          payload.encryptedData,
          payload.password,
        );
        break;

      case WorkerAction.ENCRYPT_BATCH:
        if (payload.rawKey) {
          const results = [];
          const items = payload.items as any[];
          for (let i = 0; i < items.length; i++) {
            results.push(
              await CryptoEngine.encryptWithRawKey(
                items[i],
                payload.rawKey,
                payload.salt,
                payload.iterations,
              ),
            );
            if (i % 50 === 0 || i === items.length - 1) {
              self.postMessage({
                id,
                success: true,
                progress: { current: i + 1, total: items.length },
              });
            }
          }
          result = results;
        } else {
          result = await workerSyncCrypto.encryptBatch(
            payload.items as any[],
            payload.password,
            {
              onProgress: (current, total) => {
                self.postMessage({
                  id,
                  success: true,
                  progress: { current, total },
                });
              },
            },
          );
        }
        break;

      case WorkerAction.DECRYPT_BATCH:
        if (payload.rawKey) {
          const results = [];
          const items = payload.items as any[];
          for (let i = 0; i < items.length; i++) {
            try {
              results.push(
                await CryptoEngine.decryptWithRawKey(items[i], payload.rawKey),
              );
            } catch (error) {
              results.push(null);
            }
            if (i % 50 === 0 || i === items.length - 1) {
              self.postMessage({
                id,
                success: true,
                progress: { current: i + 1, total: items.length },
              });
            }
          }
          result = results;
        } else {
          result = await workerSyncCrypto.decryptBatch(
            payload.items as any[],
            payload.password,
            {
              onProgress: (current, total) => {
                self.postMessage({
                  id,
                  success: true,
                  progress: { current, total },
                });
              },
            },
          );
        }
        break;

      case WorkerAction.LOCK_ENCRYPT_BATCH:
        result = await workerLockCrypto.encryptBatch(
          payload.items as any[],
          payload.pin,
          {
            onProgress: (current, total) => {
              self.postMessage({
                id,
                success: true,
                progress: { current, total },
              });
            },
          },
        );
        break;

      case WorkerAction.LOCK_DECRYPT_BATCH:
        result = await workerLockCrypto.decryptBatch(
          payload.items as any[],
          payload.pin,
          {
            onProgress: (current, total) => {
              self.postMessage({
                id,
                success: true,
                progress: { current, total },
              });
            },
          },
        );
        break;

      case WorkerAction.HASH_PASSWORD:
        result = await CryptoEngine.hashPassword(
          payload.password,
          payload.salt,
        );
        break;

      case WorkerAction.TRY_DECRYPT:
        result = await CryptoEngine.tryDecrypt(
          payload.encryptedData,
          payload.password,
        );
        break;

      case WorkerAction.VALIDATE_STRENGTH:
        result = CryptoEngine.validatePasswordStrength(payload.password);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const response: WorkerMessageResponse = {
      id,
      success: true,
      payload: result,
    };

    self.postMessage(response);
  } catch (error: any) {
    const response: WorkerMessageResponse = {
      id,
      success: false,
      error: error.message || "Unknown error occurred in worker",
    };

    self.postMessage(response);
  }
};
