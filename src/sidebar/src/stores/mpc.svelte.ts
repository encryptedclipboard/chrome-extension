import {
  mpcService,
  type MPCProgress,
  type PhaseSnapshotData,
  MPCPhase,
} from "@shared/services/mpc.service";
import { StepStatus } from "@shared/enums";
import type { MPCStepState } from "@shared/types";

const PHASE_ORDER: MPCPhase[] = [
  MPCPhase.LOCKING_THE_SERVER,
  MPCPhase.DOWNLOADING,
  MPCPhase.DELETING_CLOUD,
  MPCPhase.UNSYNCING,
  MPCPhase.CHANGING_PASSWORD,
  MPCPhase.UPLOADING,
];

const PHASE_META: Record<string, { label: string }> = {
  locking_the_server: { label: "Locking the server" },
  downloading: { label: "Sync from Cloud" },
  deleting_cloud: { label: "Clear Cloud Data" },
  unsyncing: { label: "Unsync Items" },
  changing_password: { label: "Change Password" },
  uploading: { label: "Sync to Cloud" },
};

interface PhaseSnapshot {
  message: string;
  progress: number;
  subMessage: string;
  error?: string;
  completedAt?: number;
  durationMs?: number;
}

function createMpcStore() {
  let isInitialized = $state(false);
  let inProgress = $state(false);
  let backgroundMode = $state(false);
  let wasMinimizedAtTerminal = $state(false);
  let currentPhase = $state<MPCPhase>(MPCPhase.IDLE);
  let message = $state("");
  let subMessage = $state("");
  let progress = $state(0);
  let error = $state("");
  let failedPhase = $state<MPCPhase | null>(null);
  let phaseTimestamps = $state<Record<string, PhaseSnapshot>>({});
  let phaseStartedAt = $state<Record<string, number>>({});
  let uploadStartedAt = $state(0);
  let uploadStartProgress = $state(0);
  const uploadEta = $derived(computeUploadEta());

  function computeUploadEta(): string {
    if (
      currentPhase !== MPCPhase.UPLOADING &&
      currentPhase !== MPCPhase.DOWNLOADING
    )
      return "";
    if (!uploadStartedAt) return "";
    const elapsed = Date.now() - uploadStartedAt;
    const progressDelta = progress - uploadStartProgress;
    if (progressDelta < 5 || elapsed < 5000) return "";
    const rate = progressDelta / elapsed;
    const remainingMs = (100 - progress) / rate;
    const remainingSec = remainingMs / 1000;
    if (remainingSec < 60) return Math.round(remainingSec) + "s remaining";
    if (remainingSec < 3600) {
      const min = Math.floor(remainingSec / 60);
      const sec = Math.round(remainingSec % 60);
      return min + "m " + sec + "s remaining";
    }
    const hours = Math.floor(remainingSec / 3600);
    const min = Math.round((remainingSec % 3600) / 60);
    return hours + "h " + min + "m remaining";
  }

  const steps = $derived(computeSteps());

  function computeSteps(): MPCStepState[] {
    const isUploadError = currentPhase === MPCPhase.UPLOADING && !!error;
    const isErrorState = currentPhase === MPCPhase.ERROR;
    const errorPhaseIndex = failedPhase ? PHASE_ORDER.indexOf(failedPhase) : -1;
    const currentPhaseIdx =
      errorPhaseIndex >= 0
        ? errorPhaseIndex
        : PHASE_ORDER.indexOf(currentPhase);

    return PHASE_ORDER.map((phase, idx) => {
      const ts = phaseTimestamps[phase];
      const isThisFailedPhase = failedPhase === phase;
      let status: StepStatus;

      if (isThisFailedPhase) {
        status = StepStatus.ERROR;
      } else if (errorPhaseIndex >= 0 && idx < errorPhaseIndex) {
        status = StepStatus.DONE;
      } else if (isErrorState && ts) {
        status = StepStatus.DONE;
      } else if (isErrorState) {
        status = StepStatus.PENDING;
      } else if (isUploadError && phase === MPCPhase.UPLOADING) {
        status = StepStatus.ERROR;
      } else if (phase === currentPhase) {
        status = StepStatus.ACTIVE;
      } else if (idx < currentPhaseIdx) {
        status = StepStatus.DONE;
      } else if (currentPhase === MPCPhase.COMPLETE) {
        status = StepStatus.DONE;
      } else {
        status = StepStatus.PENDING;
      }

      const isCurrent = phase === currentPhase;

      return {
        phase,
        label: PHASE_META[phase]?.label || phase,
        status,
        message: isCurrent ? message : ts?.message || "",
        progress: isCurrent ? progress : ts?.progress || 0,
        subMessage: isCurrent ? subMessage : ts?.subMessage || "",
        error:
          status === StepStatus.ERROR
            ? phase === MPCPhase.UPLOADING && error
              ? error
              : ts?.error || error
            : undefined,
        retryable:
          status === StepStatus.ERROR &&
          (phase === MPCPhase.UPLOADING || phase === failedPhase),
        completedAt: ts?.completedAt,
        durationMs:
          ts?.durationMs ??
          (phaseStartedAt[phase]
            ? Date.now() - phaseStartedAt[phase]
            : undefined),
      };
    });
  }

  return {
    get isInitialized() {
      return isInitialized;
    },
    get inProgress() {
      return inProgress;
    },
    get backgroundMode() {
      return backgroundMode;
    },
    get wasMinimizedAtTerminal() {
      return wasMinimizedAtTerminal;
    },
    get steps() {
      return steps;
    },
    get currentPhase() {
      return currentPhase;
    },
    get message() {
      return message;
    },
    get subMessage() {
      return subMessage;
    },
    get progress() {
      return progress;
    },
    get error() {
      return error;
    },
    get failedPhase() {
      return failedPhase;
    },
    get uploadEta() {
      return uploadEta;
    },

    async loadFromStorage() {
      const p = await mpcService.getProgress();
      if (p && p.phase !== MPCPhase.IDLE) {
        // If upload reached 100% but COMPLETE was never emitted, clear now
        if (p.phase === MPCPhase.UPLOADING && p.progressPercentage >= 100) {
          await mpcService.clearProgress();
          return;
        }
        inProgress = p.inProgress;
        currentPhase = p.phase;
        message = p.message;
        subMessage = p.subMessage || "";
        progress = p.progressPercentage;
        error = p.error;
        failedPhase = p.failedPhase || null;
        phaseTimestamps =
          (p.phaseTimestamps as Record<string, PhaseSnapshot>) || {};
        wasMinimizedAtTerminal = false;
        // If phase is terminal, never show background mode unless user minimized at terminal
        if (p.phase === MPCPhase.COMPLETE || p.phase === MPCPhase.ERROR) {
          wasMinimizedAtTerminal = await mpcService.getWasMinimizedAtTerminal();
          if (!wasMinimizedAtTerminal) {
            backgroundMode = false;
          } else {
            backgroundMode = await mpcService.getBackgroundMode();
          }
        } else {
          backgroundMode = await mpcService.getBackgroundMode();
        }
      }
      isInitialized = true;
    },

    async update(p: MPCProgress) {
      const prevPhase = currentPhase;

      if (p.phase !== prevPhase && prevPhase !== MPCPhase.IDLE) {
        const prevDuration = phaseStartedAt[prevPhase]
          ? Date.now() - phaseStartedAt[prevPhase]
          : undefined;

        if (p.phase === MPCPhase.ERROR) {
          phaseTimestamps = {
            ...phaseTimestamps,
            [prevPhase]: {
              message,
              progress,
              subMessage,
              error: p.error,
              completedAt: Date.now(),
              durationMs: prevDuration,
            },
          };
          failedPhase = prevPhase;
        } else {
          phaseTimestamps = {
            ...phaseTimestamps,
            [prevPhase]: {
              message,
              progress,
              subMessage,
              completedAt: Date.now(),
              durationMs: prevDuration,
            },
          };
          if (prevPhase === failedPhase) {
            failedPhase = null;
          }
        }
      }

      // Merge persisted phaseTimestamps from handler snapshots
      if (p.phaseTimestamps) {
        phaseTimestamps = { ...phaseTimestamps, ...p.phaseTimestamps };
      }

      // Upload failure: phase stays uploading but error is set
      if (
        p.phase === MPCPhase.UPLOADING &&
        p.error &&
        prevPhase === MPCPhase.UPLOADING
      ) {
        failedPhase = MPCPhase.UPLOADING;
      }

      // Track upload progress for ETA estimation
      if (
        (p.phase === MPCPhase.UPLOADING || p.phase === MPCPhase.DOWNLOADING) &&
        p.phase !== prevPhase
      ) {
        uploadStartedAt = Date.now();
        uploadStartProgress = progress;
      }

      // Track phase start time for duration display
      if (p.phase !== prevPhase) {
        phaseStartedAt = { ...phaseStartedAt, [p.phase]: Date.now() };
      }

      // Failed phase from stored progress (load or retry setup)
      if (p.failedPhase) {
        failedPhase = p.failedPhase;
      }

      inProgress = p.phase !== MPCPhase.IDLE;

      // Track if we were minimized when reaching terminal state
      if (p.phase === MPCPhase.COMPLETE || p.phase === MPCPhase.ERROR) {
        wasMinimizedAtTerminal = backgroundMode;
        await mpcService.setWasMinimizedAtTerminal(wasMinimizedAtTerminal);
      }
      currentPhase = p.phase;
      message = p.message;
      subMessage = p.subMessage || "";
      progress = p.progressPercentage;
      error = p.error;

      // If handler provides backgroundMode, use it; otherwise preserve current
      if (p.backgroundMode !== undefined) {
        backgroundMode = p.backgroundMode;
      }

      // Persist phaseTimestamps so they survive sidebar close/reopen
      mpcService.updatePhaseTimestamps(phaseTimestamps);
    },

    setBackgroundMode(val: boolean) {
      backgroundMode = val;
    },

    updateSubMessage(msg: string) {
      subMessage = msg;
      // Also keep phaseTimestamp live for the current phase
      if (
        currentPhase &&
        currentPhase !== MPCPhase.IDLE &&
        currentPhase !== MPCPhase.ERROR &&
        currentPhase !== MPCPhase.COMPLETE
      ) {
        phaseTimestamps = {
          ...phaseTimestamps,
          [currentPhase]: {
            message,
            progress,
            subMessage: msg,
            completedAt: Date.now(),
          },
        };
      }
    },

    updateSyncProgress(
      stage: string,
      current?: number,
      total?: number,
      msg?: string,
    ) {
      if (
        msg &&
        (currentPhase === MPCPhase.UPLOADING ||
          currentPhase === MPCPhase.DOWNLOADING)
      ) {
        message = msg;
      }
      if (current !== undefined && total !== undefined && total > 0) {
        progress = Math.min(Math.round((current / total) * 100), 100);
      }
    },

    updateProgressFromBatch(syncedCount: number, totalItems: number) {
      progress = Math.round((syncedCount / totalItems) * 100);
      subMessage = `Synced ${syncedCount} / ${totalItems} items`;
    },

    async complete() {
      inProgress = false;
      backgroundMode = false;
      wasMinimizedAtTerminal = false;
      await mpcService.clearWasMinimizedAtTerminal();
      currentPhase = MPCPhase.IDLE;
      message = "";
      subMessage = "";
      progress = 0;
      error = "";
      failedPhase = null;
      phaseTimestamps = {};
    },

    clearError() {
      error = "";
      const failed = failedPhase;
      if (failed && phaseTimestamps[failed]) {
        phaseTimestamps = {
          ...phaseTimestamps,
          [failed]: { ...phaseTimestamps[failed], error: undefined },
        };
      }
    },

    fail(errMsg: string) {
      inProgress = true;
      backgroundMode = false;
      currentPhase = MPCPhase.ERROR;
      message = errMsg;
      error = errMsg;
    },

    async reset() {
      inProgress = false;
      backgroundMode = false;
      wasMinimizedAtTerminal = false;
      await mpcService.clearWasMinimizedAtTerminal();
      currentPhase = MPCPhase.IDLE;
      message = "";
      subMessage = "";
      progress = 0;
      error = "";
      failedPhase = null;
      phaseTimestamps = {};
    },
  };
}

export const mpcStore = createMpcStore();
