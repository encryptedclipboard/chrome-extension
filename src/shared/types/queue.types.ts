export interface QueueItem {
  itemId: string;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
}

export interface QueueState {
  items: QueueItem[];
  processing: boolean;
}
