<script lang="ts">
  import { SyncStage } from "@shared/enums";
  import { fade, fly } from "svelte/transition";

  import { syncModalStore } from "@/stores/sync.modal.svelte";

  function getTitle(stage: string) {
    switch (stage) {
      case SyncStage.DOWNLOADING:
        return "Sync from cloud";
      case SyncStage.DECRYPTING:
        return "Processing...";
      case SyncStage.PROCESSING:
        return "Processing...";
      case SyncStage.UPLOADING:
        return "Sync to cloud";
      case SyncStage.SAVING:
        return "Saving...";
      case SyncStage.WAITING_FOR_CONNECTIVITY:
        return "Waiting for network...";
      case SyncStage.PAUSED:
        return "Sync Paused";
      case SyncStage.COMPLETE:
        return "Synced";
      case SyncStage.ERROR:
        return "Error";
      default:
        return "Syncing...";
    }
  }
</script>

{#if syncModalStore.visible && syncModalStore.progress && !syncModalStore.minimized}
  <div
    class="sync-progress-container"
    in:fly={{ y: 20, duration: 300 }}
    out:fade
  >
    <div class="progress-card">
      <div class="header">
        <div class="content">
          <div class="title">{getTitle(syncModalStore.progress.stage)}</div>
          <div class="message">
            {syncModalStore.progress.message || "Working..."}
          </div>
        </div>
      </div>

      {#if syncModalStore.progress.total && syncModalStore.progress.total > 0 && syncModalStore.progress.current !== undefined}
        <div class="progress-bar-bg">
          <div
            class="progress-bar-fill"
            style:width="{((syncModalStore.progress.current ?? 0) /
              (syncModalStore.progress.total || 1)) *
              100}%"
            class:error={syncModalStore.progress.stage === SyncStage.ERROR}
            class:success={syncModalStore.progress.stage === SyncStage.COMPLETE}
            class:paused={syncModalStore.progress.stage === SyncStage.PAUSED}
          ></div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  @use "../styles/components/sync-progress.scss" as *;
</style>
