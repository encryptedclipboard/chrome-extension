import { ClipboardItemType } from "@shared/enums";
import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import { fetchWithAuth } from "@shared/utils/http.utils";
import type { ServerClipboardItem } from "@shared/types/clipboard.types";
import type { SyncUploadItem } from "@shared/types/db.types";

const MAX_IMAGE_MB_PER_BATCH = 5;

export class SyncUploadProcessorService extends ClipboardDBService {
  private running = false;
  private uploadedCount = 0;
  private onProgress: ((processed: number) => void) | null = null;
  private onComplete: (() => void) | null = null;
  private onFailedEncryption: ((ids: string[]) => void) | null = null;
  private onBatch: ((ids: string[]) => void) | null = null;

  setCallbacks(
    onProgress: (processed: number) => void,
    onComplete: () => void,
    onFailedEncryption: (ids: string[]) => void,
    onBatch?: (ids: string[]) => void,
  ): void {
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onFailedEncryption = onFailedEncryption;
    this.onBatch = onBatch || null;
  }

  isRunning(): boolean {
    return this.running;
  }

  getUploadedCount(): number {
    return this.uploadedCount;
  }

  async processAll(
    isEncryptionComplete: () => boolean,
    batchSizes: number[],
    mpc?: { totalItems: number },
  ): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      this.uploadedCount = 0;
      let batchIndex = 0;

      while (this.running) {
        const size = batchSizes[Math.min(batchIndex, batchSizes.length - 1)];
        const candidates = await this.getPendingSyncUploadItems(size * 2);

        if (candidates.length === 0) {
          if (isEncryptionComplete()) break;
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        const batch = this.buildBatch(candidates, size);
        const payloads = batch.map((i: SyncUploadItem) => i.payload);
        const serverItems = await this.uploadBatch(payloads, mpc);

        await this.batchUpdateSyncStatus(serverItems);
        await this.markSyncUploadItemsDone(
          batch.map((i: SyncUploadItem) => i.id),
        );

        this.uploadedCount += batch.length;
        batchIndex++;
        this.onProgress?.(this.uploadedCount);

        const savedIds: string[] = serverItems
          .filter(
            (
              si: ServerClipboardItem,
            ): si is ServerClipboardItem & { localId: string } => !!si.localId,
          )
          .map((si) => si.localId);
        if (savedIds.length > 0) {
          this.onBatch?.(savedIds);
        }
      }

      this.onComplete?.();
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    this.running = false;
  }

  private buildBatch(
    candidates: SyncUploadItem[],
    maxCount: number,
  ): SyncUploadItem[] {
    const batch: SyncUploadItem[] = [];
    let imageMB = 0;

    for (const item of candidates) {
      if (batch.length >= maxCount) break;

      if (
        item.payload.type === ClipboardItemType.IMAGE &&
        item.payload.content
      ) {
        const mb = item.payload.content.length / (1024 * 1024);
        if (imageMB + mb > MAX_IMAGE_MB_PER_BATCH) break;
        imageMB += mb;
      }

      batch.push(item);
    }

    return batch.length > 0 ? batch : [candidates[0]];
  }

  private async uploadBatch(
    payloads: any[],
    mpc?: { totalItems: number },
  ): Promise<ServerClipboardItem[]> {
    const body: any = { items: payloads };
    if (mpc) {
      body.mpc = mpc;
    }
    const queryString = mpc ? `?mpc_totalItems=${mpc.totalItems}` : "";
    const response = await fetchWithAuth<{
      data: { items: ServerClipboardItem[] };
    }>(`/clipboard/batch${queryString}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const serverItems = response.data?.items;
    if (!serverItems) throw new Error("No items returned from batch create");
    return serverItems;
  }
}
