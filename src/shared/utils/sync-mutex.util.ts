import { AsyncMutex } from "@shared/utils/mutex.util";

const syncMutex = new AsyncMutex();

export async function withSyncLock<T>(
  fn: () => Promise<T>,
  withLock: boolean = true,
): Promise<T> {
  if (!withLock) {
    return fn();
  }
  return syncMutex.runExclusive(fn);
}

export { syncMutex };
