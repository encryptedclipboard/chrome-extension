import { MessageType } from "../types/message.types";

export enum MPCPhase {
  IDLE = "idle",
  LOCKING_THE_SERVER = "locking_the_server",
  DOWNLOADING = "downloading",
  DELETING_CLOUD = "deleting_cloud",
  UNSYNCING = "unsyncing",
  CHANGING_PASSWORD = "changing_password",
  UPLOADING = "uploading",
  COMPLETE = "complete",
  ERROR = "error",
}

export interface PhaseSnapshotData {
  message: string;
  progress: number;
  subMessage: string;
  error?: string;
  completedAt?: number;
  durationMs?: number;
}

export interface MPCProgress {
  inProgress: boolean;
  phase: MPCPhase;
  message: string;
  subMessage?: string;
  progressPercentage: number;
  error: string;
  startedAt: number;
  browserId: string;
  totalItems?: number;
  failedPhase?: MPCPhase;
  backgroundMode?: boolean;
  phaseTimestamps?: Record<string, PhaseSnapshotData>;
}

export const STORAGE_KEY_MPC = "mpcInProgress";
export const STORAGE_KEY_BG_MODE = "mpcBackgroundMode";
export const STORAGE_KEY_MPC_COMPLETED = "mpcCompleted";
export const STORAGE_KEY_MPC_WAS_MINIMIZED_AT_TERMINAL =
  "mpcWasMinimizedAtTerminal";

export class MPCService {
  private inMemoryFlag = false;
  private retryPassword = "";

  isInProgress(): boolean {
    return this.inMemoryFlag;
  }

  setInProgress(val: boolean): void {
    this.inMemoryFlag = val;
  }

  setRetryPassword(password: string): void {
    this.retryPassword = password;
  }

  getRetryPassword(): string {
    return this.retryPassword;
  }

  clearRetryPassword(): void {
    this.retryPassword = "";
  }

  async setProgress(
    phase: MPCPhase,
    message: string,
    progressPercentage: number,
    subMessage?: string,
    error?: string,
    totalItems?: number,
    browserId?: string,
    failedPhase?: MPCPhase,
  ): Promise<void> {
    const existing = await this.getProgress();
    const progress: MPCProgress = {
      inProgress: phase !== MPCPhase.IDLE && phase !== MPCPhase.COMPLETE,
      phase,
      message,
      subMessage,
      progressPercentage,
      error: error || (phase === MPCPhase.ERROR ? message : ""),
      startedAt: Date.now(),
      browserId: browserId || "",
      totalItems,
      failedPhase,
      backgroundMode: existing?.backgroundMode || false,
      phaseTimestamps:
        existing?.phase &&
        existing.phase !== MPCPhase.IDLE &&
        existing.phase !== MPCPhase.COMPLETE
          ? existing.phaseTimestamps || undefined
          : undefined,
    };

    this.inMemoryFlag = progress.inProgress;
    await chrome.storage.local.set({ [STORAGE_KEY_MPC]: progress });
  }

  async broadcastProgress(): Promise<void> {
    const state = await this.getProgress();
    if (state) {
      chrome.runtime
        .sendMessage({ type: MessageType.MPC_PROGRESS, payload: state })
        .catch(() => {});
    }
  }

  async getProgress(): Promise<MPCProgress | null> {
    const result = await chrome.storage.local.get([STORAGE_KEY_MPC]);
    return (result[STORAGE_KEY_MPC] as MPCProgress) || null;
  }

  async clearProgress(): Promise<void> {
    this.inMemoryFlag = false;
    await chrome.storage.local.remove([STORAGE_KEY_MPC]);
    await chrome.storage.local.remove([STORAGE_KEY_BG_MODE]);
  }

  async setBackgroundMode(enabled: boolean): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_BG_MODE]: enabled });
    const existing = await this.getProgress();
    if (existing) {
      existing.backgroundMode = enabled;
      await chrome.storage.local.set({ [STORAGE_KEY_MPC]: existing });
    }
  }

  async getBackgroundMode(): Promise<boolean> {
    const result = await chrome.storage.local.get([STORAGE_KEY_BG_MODE]);
    const stored = result[STORAGE_KEY_BG_MODE];
    if (typeof stored === "boolean") return stored;
    const progress = await this.getProgress();
    return progress?.backgroundMode || false;
  }

  async setMpcCompleted(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_MPC_COMPLETED]: true });
  }

  async getMpcCompleted(): Promise<boolean> {
    const result = await chrome.storage.local.get([STORAGE_KEY_MPC_COMPLETED]);
    return result[STORAGE_KEY_MPC_COMPLETED] === true;
  }

  async clearMpcCompleted(): Promise<void> {
    await chrome.storage.local.remove([STORAGE_KEY_MPC_COMPLETED]);
  }

  async setWasMinimizedAtTerminal(val: boolean): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEY_MPC_WAS_MINIMIZED_AT_TERMINAL]: val,
    });
  }

  async getWasMinimizedAtTerminal(): Promise<boolean> {
    const result = await chrome.storage.local.get([
      STORAGE_KEY_MPC_WAS_MINIMIZED_AT_TERMINAL,
    ]);
    return result[STORAGE_KEY_MPC_WAS_MINIMIZED_AT_TERMINAL] === true;
  }

  async clearWasMinimizedAtTerminal(): Promise<void> {
    await chrome.storage.local.remove([
      STORAGE_KEY_MPC_WAS_MINIMIZED_AT_TERMINAL,
    ]);
  }

  async updatePhaseTimestamps(
    timestamps: Record<string, PhaseSnapshotData>,
  ): Promise<void> {
    const stored = await this.getProgress();
    if (stored) {
      stored.phaseTimestamps = timestamps;
      await chrome.storage.local.set({ [STORAGE_KEY_MPC]: stored });
    }
  }
}

export const mpcService = new MPCService();
