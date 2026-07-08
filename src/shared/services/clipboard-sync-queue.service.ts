/**
 * Clipboard Sync Queue Service
 *
 * Handles retry queue with exponential backoff for failed sync operations.
 * Uses chrome.alarms API for reliable background task scheduling in MV3.
 * Pure service: Does not access DB directly.
 */

import type { QueueState } from "../types/queue.types";
import { StorageUtil } from "../utils/extension-storage.util";

const ALARM_NAME = "clipboard-sync-queue";
const ALARM_INTERVAL_MINUTES = 1; // Check queue every minute

// Exponential backoff configuration
const RETRY_CONFIG = {
  INITIAL_DELAY_MS: 2000, // 2 seconds
  MAX_DELAY_MS: 5 * 60 * 1000, // 5 minutes
  MULTIPLIER: 2,
  MAX_ATTEMPTS: 10,
};

export class ClipboardSyncQueueService {
  private queueState: QueueState = {
    items: [],
    processing: false,
  };

  private isProcessing = false;

  private onSyncItemCallback?: (itemId: string) => Promise<void>;
  private onMaxRetriesCallback?: (
    itemId: string,
    error: string,
  ) => Promise<void>;

  /**
   * Initialize the queue service and set up alarm
   */
  async init(
    onSyncItem: (itemId: string) => Promise<void>,
    onMaxRetries?: (itemId: string, error: string) => Promise<void>,
  ): Promise<void> {
    this.onSyncItemCallback = onSyncItem;
    this.onMaxRetriesCallback = onMaxRetries;

    // Load queue state from storage
    await this.loadQueueState();

    // Set up periodic alarm to process queue
    await this.setupAlarm();

    // Process queue immediately on init
    await this.processQueue();
  }

  /**
   * Add item to retry queue
   */
  async addToQueue(itemId: string, error?: string): Promise<void> {
    const existingIndex = this.queueState.items.findIndex(
      (item) => item.itemId === itemId,
    );

    const now = Date.now();

    if (existingIndex >= 0) {
      // Update existing queue item
      const item = this.queueState.items[existingIndex];
      item.attempts++;
      item.lastError = error;
      item.nextRetryAt = this.calculateNextRetry(item.attempts);
    } else {
      // Add new queue item
      this.queueState.items.push({
        itemId,
        attempts: 1,
        nextRetryAt: now + RETRY_CONFIG.INITIAL_DELAY_MS,
        lastError: error,
      });
    }

    await this.saveQueueState();
  }

  /**
   * Remove item from queue
   */
  async removeFromQueue(itemId: string): Promise<void> {
    this.queueState.items = this.queueState.items.filter(
      (item) => item.itemId !== itemId,
    );
    await this.saveQueueState();
  }

  /**
   * Process the retry queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    if (!this.onSyncItemCallback) {
      this.isProcessing = false;
      return;
    }

    this.queueState.processing = true;
    const now = Date.now();

    try {
      // Get items ready for retry
      const itemsToRetry = this.queueState.items.filter(
        (item) =>
          item.nextRetryAt <= now && item.attempts < RETRY_CONFIG.MAX_ATTEMPTS,
      );

      if (itemsToRetry.length === 0) {
        return;
      }

      // Process each item
      for (const queueItem of itemsToRetry) {
        try {
          await this.onSyncItemCallback(queueItem.itemId);

          // Success - remove from queue
          await this.removeFromQueue(queueItem.itemId);
          // Successfully synced
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          // console.error(
          //   `[SyncQueue] Retry failed for item ${queueItem.itemId}:`,
          //   errorMsg
          // );

          // Check if max attempts reached
          if (queueItem.attempts + 1 >= RETRY_CONFIG.MAX_ATTEMPTS) {
            // console.error(
            //   `[SyncQueue] Max retry attempts reached for item ${queueItem.itemId}, marking as error`
            // );

            if (this.onMaxRetriesCallback) {
              await this.onMaxRetriesCallback(
                queueItem.itemId,
                `Max retry attempts reached: ${errorMsg}`,
              );
            }

            await this.removeFromQueue(queueItem.itemId);
          } else {
            // Add back to queue with incremented attempts
            await this.addToQueue(queueItem.itemId, errorMsg);
          }
        }
      }
    } finally {
      this.isProcessing = false;
      this.queueState.processing = false;
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    pendingCount: number;
    items: Array<{ itemId: string; attempts: number; nextRetryAt: number }>;
  } {
    const now = Date.now();
    return {
      pendingCount: this.queueState.items.length,

      items: this.queueState.items.map((item) => ({
        itemId: item.itemId,
        attempts: item.attempts,
        nextRetryAt: item.nextRetryAt,
      })),
    };
  }

  /**
   * Clear entire queue
   */
  async clearQueue(): Promise<void> {
    this.queueState.items = [];
    await this.saveQueueState();
    // Queue cleared
  }

  /**
   * Schedule retry with exponential backoff
   */
  private calculateNextRetry(attempts: number): number {
    const delay = Math.min(
      RETRY_CONFIG.INITIAL_DELAY_MS *
        Math.pow(RETRY_CONFIG.MULTIPLIER, attempts - 1),
      RETRY_CONFIG.MAX_DELAY_MS,
    );
    return Date.now() + delay;
  }

  /**
   * Set up chrome alarm for periodic queue processing
   */
  private async setupAlarm(): Promise<void> {
    if (!chrome.alarms) {
      return;
    }

    // Clear existing alarm
    await chrome.alarms.clear(ALARM_NAME);

    // Create new alarm
    await chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: ALARM_INTERVAL_MINUTES,
    });

    // Listen for alarm
    if (chrome.alarms.onAlarm) {
      // Remove existing listeners to avoid duplicates if init calls multiple times?
      // Actually, chrome.alarms.onAlarm.addListener adds a new listener.
      // Ideally we should check if listener is added, but for now we assume init is called once.
      // Or we can use a named function to remove it first.

      // Since this is a singleton service, init should only be called once.
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM_NAME) {
          this.processQueue().catch(() => {});
        }
      });
    }

    // Alarm set up
  }

  /**
   * Load queue state from storage
   */
  private async loadQueueState(): Promise<void> {
    try {
      const queue = await StorageUtil.getClipboardSyncQueue();
      if (queue) {
        this.queueState = queue;
        // Always reset processing state on load/startup
        this.queueState.processing = false;
        // Loaded items from storage
      }
    } catch (error) {
      // console.error("[SyncQueue] Failed to load queue state:", error);
    }
  }

  /**
   * Save queue state to storage
   */
  private async saveQueueState(): Promise<void> {
    try {
      await StorageUtil.setClipboardSyncQueue(this.queueState);
    } catch (error) {
      // console.error("[SyncQueue] Failed to save queue state:", error);
    }
  }
}
