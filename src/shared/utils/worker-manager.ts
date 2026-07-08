import {
  WorkerAction,
  type WorkerMessageRequest,
  type WorkerMessageResponse,
} from "../types/worker.type";
import { v4 as uuidv4 } from "uuid";
import { CryptoEngine } from "@encryptedclipboard/crypto";
import { pMap } from "./concurrency.util";
import { encryptLockItem, decryptLockItem } from "./lock-crypto.util";

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: Error) => void;
  onProgress?: (current: number, total: number) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds per request

export class WorkerManager {
  private workers: Worker[] = [];
  private nextWorkerIndex = 0;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private poolSize = 0;

  private readonly syncCrypto = new CryptoEngine({
    iterations: 400000,
  });

  private readonly lockCrypto = new CryptoEngine({
    iterations: 100000,
  });

  constructor() {
    this.poolSize = this.calculatePoolSize();
    this.initPool();
  }

  private calculatePoolSize(): number {
    if (typeof navigator === "undefined" || !navigator.hardwareConcurrency) {
      return 1;
    }
    const cores = navigator.hardwareConcurrency;
    return Math.max(1, Math.min(8, cores * 2));
  }

  private initPool() {
    for (let i = 0; i < this.poolSize; i++) {
      this.addWorkerToPool();
    }
  }

  private addWorkerToPool() {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const workerUrl = chrome.runtime.getURL("crypto.worker.js");
      const worker = new Worker(workerUrl, { type: "module" });

      worker.onmessage = (event: MessageEvent<WorkerMessageResponse>) => {
        const { id, success, payload, error, progress } = event.data;
        const request = this.pendingRequests.get(id);

        if (request) {
          if (progress) {
            request.onProgress?.(progress.current, progress.total);
            return;
          }

          if (request.timeoutId) {
            clearTimeout(request.timeoutId);
          }

          if (success) {
            request.resolve(payload);
          } else {
            request.reject(new Error(error || "Worker operation failed"));
          }
          this.pendingRequests.delete(id);
        }
      };

      worker.onerror = (error) => {
        console.error("[WorkerManager] Worker encountered an error:", error);
        this.handleWorkerCrash(worker);
      };

      this.workers.push(worker);
    } catch (error) {
      console.error(
        "[WorkerManager] Failed to initialize a worker in pool:",
        error,
      );
    }
  }

  private handleWorkerCrash(worker: Worker) {
    const index = this.workers.indexOf(worker);
    if (index > -1) {
      this.workers.splice(index, 1);
    }

    for (const [id, request] of this.pendingRequests) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error("Worker died"));
      this.pendingRequests.delete(id);
    }

    this.addWorkerToPool();
  }

  private getNextWorker(): Worker | null {
    if (this.workers.length === 0) return null;
    const worker = this.workers[this.nextWorkerIndex] ?? null;
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  async executeTask<T>(
    action: WorkerAction,
    payload: any,
    onProgress?: (current: number, total: number) => void,
  ): Promise<T> {
    const worker = this.getNextWorker();
    if (!worker) {
      return this.executeFallback<T>(action, payload);
    }

    const id = uuidv4();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Worker request timed out"));
        }
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        onProgress,
        timeoutId,
        worker,
      } as PendingRequest);
      worker.postMessage({ id, action, payload });
    });
  }

  async executeBatch<T, R>(
    action: WorkerAction,
    items: T[],
    payload: any,
    onProgress?: (current: number, total: number) => void,
  ): Promise<R[]> {
    if (this.workers.length === 0) {
      return this.executeBatchFallback<T, R>(
        action,
        items,
        payload,
        onProgress,
      );
    }

    const isSyncBatch =
      action === WorkerAction.ENCRYPT_BATCH ||
      action === WorkerAction.DECRYPT_BATCH ||
      action === WorkerAction.ENCRYPT ||
      action === WorkerAction.DECRYPT;
    const isLockBatch =
      action === WorkerAction.LOCK_ENCRYPT_BATCH ||
      action === WorkerAction.LOCK_DECRYPT_BATCH;

    let batchAction: WorkerAction | null = null;
    if (
      action === WorkerAction.ENCRYPT ||
      action === WorkerAction.ENCRYPT_BATCH
    )
      batchAction = WorkerAction.ENCRYPT_BATCH;
    else if (
      action === WorkerAction.DECRYPT ||
      action === WorkerAction.DECRYPT_BATCH
    )
      batchAction = WorkerAction.DECRYPT_BATCH;
    else if (action === WorkerAction.LOCK_ENCRYPT_BATCH)
      batchAction = WorkerAction.LOCK_ENCRYPT_BATCH;
    else if (action === WorkerAction.LOCK_DECRYPT_BATCH)
      batchAction = WorkerAction.LOCK_DECRYPT_BATCH;

    let completedCount = 0;
    const total = items.length;

    if ((isSyncBatch || isLockBatch) && batchAction) {
      const numWorkers = this.workers.length || 1;
      const minItemsPerChunk = 10;
      const MIN_CHUNKS = 2;
      const targetChunksPerWorker = 2;
      const targetChunks = numWorkers * targetChunksPerWorker;

      const flattenResults = (resultsArrays: R[][]): R[] => {
        const flattened: R[] = [];
        for (const arr of resultsArrays) {
          flattened.push(...arr);
        }
        return flattened;
      };

      if (batchAction === WorkerAction.ENCRYPT_BATCH) {
        const iterations = 400000;
        const salt = crypto.getRandomValues(new Uint8Array(32));
        const rawKey = await CryptoEngine.generateRawKey(
          payload.password,
          salt,
          iterations,
        );
        const saltBase64 = btoa(String.fromCharCode(...salt));

        const chunkSize = Math.max(
          minItemsPerChunk,
          Math.ceil(items.length / targetChunks),
        );
        const chunks: T[][] = [];
        for (let i = 0; i < items.length; i += chunkSize) {
          chunks.push(items.slice(i, i + chunkSize));
        }

        try {
          const resultsArrays: R[][] = await pMap(
            chunks,
            async (chunk, chunkIndex) => {
              const chunkOffset = chunkIndex * chunkSize;
              const chunkPayload = {
                ...payload,
                items: chunk,
                concurrency: chunk.length,
                rawKey,
                salt: saltBase64,
                iterations,
              };

              return this.executeTask<R[]>(
                batchAction!,
                chunkPayload,
                (chunkCurrent) => {
                  if (onProgress) {
                    const globalCurrent = chunkOffset + chunkCurrent;
                    onProgress(Math.min(globalCurrent, total), total);
                  }
                },
              );
            },
            { concurrency: numWorkers },
          );

          return flattenResults(resultsArrays);
        } finally {
          this.zeroArrayBuffer(rawKey);
        }
      } else if (batchAction === WorkerAction.DECRYPT_BATCH) {
        const groups = new Map<
          string,
          { items: T[]; rawKeyPromise: Promise<ArrayBuffer>; indices: number[] }
        >();
        const password = payload.password;

        for (let i = 0; i < items.length; i++) {
          const item = items[i] as any;
          const iterations = item.iterations || 600000;
          const saltStr = item.salt;
          const groupKey = `${saltStr}_${iterations}`;

          if (!groups.has(groupKey)) {
            const binary = atob(saltStr);
            const saltBuffer = new Uint8Array(binary.length);
            for (let j = 0; j < binary.length; j++) {
              saltBuffer[j] = binary.charCodeAt(j);
            }
            const rawKeyPromise = CryptoEngine.generateRawKey(
              password,
              saltBuffer,
              iterations,
            );
            groups.set(groupKey, { items: [], rawKeyPromise, indices: [] });
          }
          const group = groups.get(groupKey)!;
          group.items.push(item);
          group.indices.push(i);
        }

        const finalResults = new Array(items.length) as R[];
        let globalCompleted = 0;

        try {
          const DESIRED_PER_CHUNK = 50;
          const MAX_CHUNK_SIZE = 100;

          await pMap(
            Array.from(groups.values()),
            async (group) => {
              const rawKey = await group.rawKeyPromise;

              const numChunks = Math.max(
                MIN_CHUNKS,
                Math.ceil(group.items.length / DESIRED_PER_CHUNK),
              );
              const chunkSize = Math.min(
                MAX_CHUNK_SIZE,
                Math.max(
                  minItemsPerChunk,
                  Math.ceil(group.items.length / numChunks),
                ),
              );
              const chunks: T[][] = [];
              const chunkIndices: number[][] = [];
              for (let i = 0; i < group.items.length; i += chunkSize) {
                chunks.push(group.items.slice(i, i + chunkSize));
                chunkIndices.push(group.indices.slice(i, i + chunkSize));
              }

              await pMap(
                chunks,
                async (chunk, chunkIdx) => {
                  const indices = chunkIndices[chunkIdx]!;
                  const chunkPayload = {
                    ...payload,
                    items: chunk,
                    concurrency: chunk.length,
                    rawKey,
                  };

                  const chunkResult = await this.executeTask<R[]>(
                    batchAction!,
                    chunkPayload,
                  );

                  for (let i = 0; i < chunkResult.length; i++) {
                    finalResults[indices[i]!] = chunkResult[i];
                    globalCompleted++;
                    if (onProgress) {
                      onProgress(globalCompleted, total);
                    }
                  }
                },
                { concurrency: numWorkers },
              );

              this.zeroArrayBuffer(rawKey);
            },
            { concurrency: 2 },
          );

          return finalResults;
        } finally {
          if (password) {
            this.zeroString(password);
          }
        }
      } else if (batchAction === WorkerAction.LOCK_ENCRYPT_BATCH) {
        const pin = payload.pin;
        try {
          return await this.processLockEncryptBatch(
            items as any[],
            pin,
            onProgress,
            total,
          );
        } finally {
          if (pin) this.zeroString(pin);
        }
      } else if (batchAction === WorkerAction.LOCK_DECRYPT_BATCH) {
        const pin = payload.pin;
        try {
          return await this.processLockDecryptBatch(
            items as any[],
            pin,
            onProgress,
            total,
          );
        } finally {
          if (pin) this.zeroString(pin);
        }
      }
    }

    return pMap(
      items,
      async (item) => {
        const itemPayload = { ...payload };
        if (action === WorkerAction.DECRYPT) {
          itemPayload.encryptedData = item;
        } else if (action === WorkerAction.LOCK_ENCRYPT_BATCH) {
          itemPayload.item = item;
        } else if (action === WorkerAction.LOCK_DECRYPT_BATCH) {
          itemPayload.encryptedData = item;
        } else {
          itemPayload.data = item;
        }

        const result = await this.executeTask<R>(action, itemPayload);

        completedCount++;
        if (onProgress) {
          onProgress(completedCount, total);
        }

        return result;
      },
      { concurrency: Math.min(items.length, 50) },
    );
  }

  private async processLockEncryptBatch(
    items: any[],
    pin: string,
    onProgress?: (current: number, total: number) => void,
    total?: number,
  ): Promise<any[]> {
    const chunkSize = Math.max(
      10,
      Math.ceil((items.length / (this.workers.length || 1)) * 2),
    );
    const chunks: any[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }

    const resultsArrays: any[][] = await pMap(
      chunks,
      async (chunk, chunkIndex) => {
        return this.executeTask<any[]>(
          WorkerAction.LOCK_ENCRYPT_BATCH,
          { items: chunk, pin, concurrency: chunk.length },
          (chunkCurrent) => {
            if (onProgress) {
              const globalCurrent = chunkIndex * chunkSize + chunkCurrent;
              onProgress(
                Math.min(globalCurrent, total || items.length),
                total || items.length,
              );
            }
          },
        );
      },
      { concurrency: this.workers.length || 1 },
    );

    return resultsArrays.flat();
  }

  private async processLockDecryptBatch(
    items: any[],
    pin: string,
    onProgress?: (current: number, total: number) => void,
    total?: number,
  ): Promise<any[]> {
    const chunkSize = Math.max(
      10,
      Math.ceil((items.length / (this.workers.length || 1)) * 2),
    );
    const chunks: any[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }

    const resultsArrays: any[][] = await pMap(
      chunks,
      async (chunk, chunkIndex) => {
        return this.executeTask<any[]>(
          WorkerAction.LOCK_DECRYPT_BATCH,
          { items: chunk, pin, concurrency: chunk.length },
          (chunkCurrent) => {
            if (onProgress) {
              const globalCurrent = chunkIndex * chunkSize + chunkCurrent;
              onProgress(
                Math.min(globalCurrent, total || items.length),
                total || items.length,
              );
            }
          },
        );
      },
      { concurrency: this.workers.length || 1 },
    );

    return resultsArrays.flat();
  }

  private zeroArrayBuffer(buffer: ArrayBuffer): void {
    try {
      const view = new Uint8Array(buffer);
      view.fill(0);
    } catch {
      // Buffer may already be detached
    }
  }

  private zeroString(str: string): void {
    try {
      const arr = new Uint8Array(new TextEncoder().encode(str));
      arr.fill(0);
    } catch {
      // String may already be garbage collected
    }
  }

  private async executeBatchFallback<T, R>(
    action: WorkerAction,
    items: T[],
    payload: any,
    onProgress?: (current: number, total: number) => void,
  ): Promise<R[]> {
    let completedCount = 0;
    const total = items.length;

    return pMap(
      items,
      async (item) => {
        let result: R;
        if (action === WorkerAction.LOCK_ENCRYPT_BATCH) {
          result = (await encryptLockItem(
            item as any,
            payload.pin,
            this.lockCrypto,
          )) as any;
        } else if (action === WorkerAction.LOCK_DECRYPT_BATCH) {
          result = (await decryptLockItem(
            item as any,
            payload.pin,
            this.lockCrypto,
          )) as any;
        } else {
          const itemPayload = { ...payload };
          if (action === WorkerAction.DECRYPT) {
            itemPayload.encryptedData = item;
          } else {
            itemPayload.data = item;
          }
          result = await this.executeFallback<R>(action, itemPayload);
        }

        completedCount++;
        if (onProgress) {
          onProgress(completedCount, total);
        }

        return result;
      },
      { concurrency: 10 },
    );
  }

  private async executeFallback<T>(
    action: WorkerAction,
    payload: any,
  ): Promise<T> {
    try {
      let result;
      switch (action) {
        case WorkerAction.ENCRYPT:
          result = await this.syncCrypto.encryptData(
            payload.data,
            payload.password,
          );
          break;
        case WorkerAction.DECRYPT:
          result = await CryptoEngine.decryptData(
            payload.encryptedData,
            payload.password,
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
        case WorkerAction.ENCRYPT_WITH_CREDENTIALS:
          result = await CryptoEngine.encryptDataWithCredentials(
            payload.data,
            payload.password,
            payload.options,
          );
          break;
        case WorkerAction.ENCRYPT_BATCH:
          result = await pMap(
            payload.items,
            async (item: any) =>
              await this.syncCrypto.encryptData(item, payload.password),
            { concurrency: 10 },
          );
          break;
        case WorkerAction.DECRYPT_BATCH:
          result = await pMap(
            payload.items,
            async (item: any) =>
              await CryptoEngine.decryptData(item, payload.password),
            { concurrency: 10 },
          );
          break;
        case WorkerAction.LOCK_ENCRYPT_BATCH:
          result = await pMap(
            payload.items,
            async (item: any) =>
              await encryptLockItem(item, payload.pin, this.lockCrypto),
            { concurrency: 10 },
          );
          break;
        case WorkerAction.LOCK_DECRYPT_BATCH:
          result = await pMap(
            payload.items,
            async (item: any) =>
              await decryptLockItem(item, payload.pin, this.lockCrypto),
            { concurrency: 10 },
          );
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      return result as T;
    } catch (error) {
      console.error(
        `[WorkerManager] Fallback execution failed for ${action}:`,
        error,
      );
      throw error;
    }
  }

  terminate() {
    for (const request of this.pendingRequests.values()) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
    }
    this.pendingRequests.clear();

    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
  }
}

export const workerManager = new WorkerManager();
