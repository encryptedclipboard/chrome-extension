import {
  clipboardDBService,
  syncOrchestratorService,
  authService,
  storageService,
  lockService,
} from "../services";
import { SyncStatus } from "@shared/enums/sync-status.enum";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import { sendUpdated } from "@shared/utils/message.utils";
import { updateBadge } from "../utils/badge.util";
import { mpcService, MPCPhase } from "@shared/services/mpc.service";
import { getBrowserId } from "@shared/utils/browser-id.util";
import { fetchWithAuth } from "@shared/utils/http.utils";
import type { CheckUpdatesResponse } from "@shared/types/clipboard.types";

const PHASE_ORDER: MPCPhase[] = [
  MPCPhase.LOCKING_THE_SERVER,
  MPCPhase.DOWNLOADING,
  MPCPhase.DELETING_CLOUD,
  MPCPhase.UNSYNCING,
  MPCPhase.CHANGING_PASSWORD,
  MPCPhase.UPLOADING,
];

function sanitizeError(err: any): string {
  const msg = err?.message || err?.toString() || "";
  if (
    msg.includes("Not Found") ||
    msg.includes("404") ||
    msg.includes("Request failed")
  ) {
    return "Something went wrong, please retry";
  }
  if (
    msg.includes("NetworkError") ||
    msg.includes("Failed to fetch") ||
    msg.includes("Network request failed") ||
    msg.includes("net::ERR_")
  ) {
    return "Network error, check internet connection";
  }
  return msg;
}

async function emitProgress(
  phase: string,
  message: string,
  progressPercentage: number,
  subMessage?: string,
  error?: string,
  totalItems?: number,
  failedPhase?: MPCPhase,
): Promise<void> {
  const browserId = await getBrowserId();
  await mpcService.setProgress(
    phase as any,
    message,
    progressPercentage,
    subMessage,
    error,
    totalItems,
    browserId,
    failedPhase,
  );
  await mpcService.broadcastProgress();
}

async function doLockTheServer(): Promise<void> {
  await emitProgress(MPCPhase.LOCKING_THE_SERVER, "Locking the server...", 2);
  await authService.notifyMpcStarted();
  await emitProgress(MPCPhase.LOCKING_THE_SERVER, "Server locked", 5);
}

async function doDownload(): Promise<void> {
  const settings = await storageService.get(["lastSyncTimestamp"]);
  const after = settings.lastSyncTimestamp || 0;
  const updateInfo = await fetchWithAuth<CheckUpdatesResponse>(
    `/clipboard/sync/check?after=${after}`,
    {
      method: "GET",
    },
  );

  if (updateInfo && updateInfo.count > 0) {
    const downloadCount = updateInfo.count;
    await emitProgress(
      MPCPhase.DOWNLOADING,
      `Downloading ${downloadCount} items...`,
      5,
    );
    await syncOrchestratorService.performFullSync({
      skipPush: true,
      isManual: true,
      silent: true,
      mpc: { totalItems: 0 },
      ignoreLock: true,
    });
    await emitProgress(
      MPCPhase.DOWNLOADING,
      `Downloaded ${downloadCount} items`,
      25,
      undefined,
      undefined,
      downloadCount,
    );
  } else {
    await emitProgress(MPCPhase.DOWNLOADING, "All items synced", 25);
  }
}

async function doDeleteCloud(): Promise<void> {
  await emitProgress(MPCPhase.DELETING_CLOUD, "Clearing cloud data...", 28);
  await fetchWithAuth("/clipboard/clear-all", {
    method: "DELETE",
    body: JSON.stringify({
      hardDelete: true,
      skipPush: true,
      skipStorageCleanup: true,
    }),
  });
  await emitProgress(MPCPhase.DELETING_CLOUD, "Cloud data cleared", 33);
}

async function doUnsync(): Promise<void> {
  await emitProgress(MPCPhase.UNSYNCING, "Unsyncing local items...", 35);
  await clipboardDBService.demoteAllSyncedToLocal();
  await emitProgress(MPCPhase.UNSYNCING, "Items ready", 38);
}

async function doChangePassword(newPassword: string): Promise<void> {
  await emitProgress(
    MPCPhase.CHANGING_PASSWORD,
    "Updating master password...",
    40,
  );
  await MasterPassUtils.setMasterPassword(newPassword);
}

async function doUpload(storedTotalItems?: number): Promise<void> {
  const allItems = await clipboardDBService.getAllItems();
  const localItems = allItems.filter(
    (i: any) => i.syncStatus === SyncStatus.LOCAL,
  );
  const totalItems = storedTotalItems || localItems.length;

  if (totalItems === 0) {
    await emitProgress(
      MPCPhase.COMPLETE,
      "Master password changed successfully",
      100,
    );
    await updateBadge(clipboardDBService, lockService);
    sendUpdated();
    return;
  }

  await emitProgress(
    MPCPhase.UPLOADING,
    "Syncing items to cloud...",
    0,
    undefined,
    undefined,
    totalItems,
  );

  await syncOrchestratorService.performFullSync({
    skipFetch: true,
    isManual: true,
    silent: false,
    mpc: { totalItems },
    ignoreLock: true,
  });

  const afterAll = await clipboardDBService.getAllItems();
  const syncedCount = afterAll.filter(
    (i: any) => i.syncStatus === SyncStatus.SYNCED,
  ).length;
  const countMsg = `Sync complete for ${syncedCount} of ${totalItems} items`;

  // Emit final upload progress so phaseTimestamps captures the count
  await emitProgress(
    MPCPhase.UPLOADING,
    `Synced ${syncedCount} of ${totalItems} items`,
    100,
    undefined,
    undefined,
    totalItems,
  );

  await emitProgress(
    MPCPhase.COMPLETE,
    countMsg,
    100,
    undefined,
    undefined,
    syncedCount,
  );

  await updateBadge(clipboardDBService, lockService);
  sendUpdated();
}

async function executePhase(
  phase: MPCPhase,
  newPassword: string,
): Promise<void> {
  switch (phase) {
    case MPCPhase.LOCKING_THE_SERVER:
      await doLockTheServer();
      break;
    case MPCPhase.DOWNLOADING:
      await doDownload();
      break;
    case MPCPhase.DELETING_CLOUD:
      await doDeleteCloud();
      break;
    case MPCPhase.UNSYNCING:
      await doUnsync();
      break;
    case MPCPhase.CHANGING_PASSWORD:
      await doChangePassword(newPassword);
      break;
    case MPCPhase.UPLOADING:
      await doUpload();
      break;
  }
}

export async function handleMpcChange(
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await mpcService.getProgress();

    if (
      existing &&
      existing.inProgress &&
      existing.phase === MPCPhase.UPLOADING
    ) {
      // Resume upload from interruption or failed retry
      mpcService.setInProgress(true);
      const msg = existing.failedPhase
        ? "Retrying upload..."
        : "Resuming upload...";
      await emitProgress(
        MPCPhase.UPLOADING,
        msg,
        existing.progressPercentage,
        undefined,
        undefined,
        existing.totalItems,
      );
      await doUpload(existing.totalItems);
      return { success: true };
    }

    // Store retry password in memory for potential resume
    if (newPassword) {
      mpcService.setRetryPassword(newPassword);
    }

    // Determine starting phase
    const startFailedPhase = existing?.failedPhase;
    const startIndex = startFailedPhase
      ? PHASE_ORDER.indexOf(startFailedPhase)
      : 0;

    // If resuming from a failed phase, ensure inProgress is set
    if (startFailedPhase) {
      mpcService.setInProgress(true);
      await emitProgress(
        startFailedPhase,
        `Retrying ${PHASE_ORDER.indexOf(startFailedPhase) + 1} of ${PHASE_ORDER.length}...`,
        0,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    }

    // Execute phases from startIndex onwards
    const retryPassword = mpcService.getRetryPassword() || newPassword;

    for (let i = startIndex; i < PHASE_ORDER.length; i++) {
      const phase = PHASE_ORDER[i];

      // For changing_password on retry, use stored password
      const pwd = phase === MPCPhase.CHANGING_PASSWORD ? retryPassword : "";

      const phaseStart = Date.now();
      await executePhase(phase, pwd);
      const phaseDuration = Date.now() - phaseStart;

      // Snapshot this phase's completion into storage
      const snap = await mpcService.getProgress();
      if (snap) {
        const timestamps = snap.phaseTimestamps || {};
        timestamps[phase as any] = {
          message: snap.message,
          progress: snap.progressPercentage,
          subMessage: snap.subMessage || "",
          completedAt: Date.now(),
          durationMs: phaseDuration,
        };
        await mpcService.updatePhaseTimestamps(timestamps);
      }

      // Clear failedPhase milestone as this phase completed
      if (existing?.failedPhase === phase) {
        const progress = await mpcService.getProgress();
        if (progress) {
          await mpcService.setProgress(
            phase as any,
            progress.message,
            progress.progressPercentage,
            progress.subMessage,
            undefined,
            progress.totalItems,
            progress.browserId,
            undefined,
          );
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error("[MPC] Change failed:", error);

    const current = await mpcService.getProgress();
    const failedPhase = current?.phase || MPCPhase.DOWNLOADING;

    if (failedPhase === MPCPhase.UPLOADING) {
      const afterAll = await clipboardDBService.getAllItems();
      const syncedCount = afterAll.filter(
        (i: any) => i.syncStatus === SyncStatus.SYNCED,
      ).length;
      const errMsg = `Upload paused after ${syncedCount} of ${current!.totalItems} items. You can retry.`;
      await emitProgress(
        MPCPhase.UPLOADING,
        "Upload failed.",
        current!.progressPercentage,
        undefined,
        errMsg,
        current!.totalItems,
        MPCPhase.UPLOADING,
      );
      mpcService.setInProgress(true);
      return { success: false, error: errMsg };
    }

    const displayMsg = sanitizeError(error) || "An unexpected error occurred";
    await emitProgress(
      MPCPhase.ERROR,
      displayMsg,
      0,
      undefined,
      displayMsg,
      undefined,
      failedPhase,
    );
    return { success: false, error: displayMsg };
  }
}
