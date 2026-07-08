/**
 * A simple Async Mutex for locking asynchronous operations.
 * Ensures that only one execution context can acquire the lock at a time.
 */
export class AsyncMutex {
  private _queue: Array<(release: () => void) => void> = [];
  private _isLocked = false;

  /**
   * Acquire the lock.
   * Returns a promise that resolves to a release function.
   * caller MUST call the release function when done.
   */
  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        if (this._queue.length > 0) {
          const next = this._queue.shift();
          if (next) next(release);
        } else {
          this._isLocked = false;
        }
      };

      if (!this._isLocked) {
        this._isLocked = true;
        resolve(release);
      } else {
        this._queue.push(resolve);
      }
    });
  }

  /**
   * Helper to run an exclusive task.
   * Acquires lock, runs task, and ensures release is called (even if task fails).
   */
  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await task();
    } finally {
      release();
    }
  }

  /**
   * Check if currently locked
   */
  isLocked(): boolean {
    return this._isLocked;
  }
}
