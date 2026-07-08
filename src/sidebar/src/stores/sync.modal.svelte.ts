import { authStore } from "@/stores/auth.svelte";
import { SyncStage } from "@shared/enums";
import {
  MessageType,
  type SyncProgressPayload,
} from "@shared/types/message.types";

interface SyncModalState {
  visible: boolean;
  progress: SyncProgressPayload | null;
  source: "auto" | "manual" | "unknown";
  minimized: boolean;
}

function createSyncModalStore() {
  const state = $state<SyncModalState>({
    visible: false,
    progress: null,
    source: "unknown",
    minimized: false,
  });

  return {
    get visible() {
      return state.visible;
    },
    get progress() {
      return state.progress;
    },
    get source() {
      return state.source;
    },
    get minimized() {
      return state.minimized;
    },

    toggleMinimize() {
      state.minimized = !state.minimized;
    },

    show(source: "auto" | "manual" = "manual") {
      state.visible = true;
      state.source = source;
    },

    updateProgress(payload: SyncProgressPayload) {
      if (authStore.logoutInProgress) {
        this.hide();
        return;
      }

      if (payload.stage === SyncStage.COMPLETE) {
        this.hide();
        return;
      }

      state.progress = payload;
      state.visible = true;

      if (payload.stage === SyncStage.ERROR) {
        setTimeout(() => {
          this.hide();
        }, 3000);
      }
    },

    hide() {
      state.visible = false;
      state.progress = null;
      state.minimized = false;
    },
  };
}

export const syncModalStore = createSyncModalStore();
