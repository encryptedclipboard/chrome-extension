interface LockProgressPayload {
  stage:
    | "encrypting"
    | "saving"
    | "complete"
    | "error"
    | "processing"
    | "password"
    | "items";
  current?: number;
  total?: number;
  message?: string;
}

interface LockModalState {
  visible: boolean;
  progress: LockProgressPayload | null;
}

function createLockProgressStore() {
  const state = $state<LockModalState>({
    visible: false,
    progress: null,
  });

  return {
    get visible() {
      return state.visible;
    },
    get progress() {
      return state.progress;
    },

    show() {
      state.visible = true;
    },

    updateProgress(payload: LockProgressPayload) {
      state.progress = payload;
      state.visible = true;

      // Auto-hide on complete could be handled here or by the caller/component
      if (payload.stage === "complete" || payload.stage === "error") {
        setTimeout(() => {
          this.hide();
        }, 1500);
      }
    },

    hide() {
      state.visible = false;
      state.progress = null;
    },
  };
}

export const lockProgressStore = createLockProgressStore();
export type { LockProgressPayload };
