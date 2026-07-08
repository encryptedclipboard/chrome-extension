<script lang="ts">
  import { onMount } from "svelte";
  import { X, RefreshCw, ChevronDown, ChevronUp } from "lucide-svelte";
  import { authStore } from "../stores/auth.svelte";
  import { clipboardDBService, storageService } from "@shared/services";
  import "@/styles/components/edit-clipboard-modal.scss"; // Use global edit clipboard modal styles

  type SyncType = "download" | "upload" | "bidirectional";

  interface Props {
    onConfirm: (type: SyncType) => void;
    onCancel: () => void;
  }

  const { onConfirm, onCancel }: Props = $props();

  let isLoading = $state(true);
  let uploadDisabled = $state(false);
  let uploadDisabledReason = $state("");
  let bidirectionalDisabled = $state(false);
  let bidirectionalDisabledReason = $state("");

  const maxClipboardItemsLimit = $derived(
    authStore.subscription?.planDetails?.maxClipboardItemsLimit ?? 100,
  );

  onMount(async () => {
    try {
      // Logic for upload possibility
      const unsyncedItems = await clipboardDBService.getUnsyncedItems();
      const localAdditions = unsyncedItems.filter(
        (i) => i.syncStatus !== "pending_delete",
      );

      const storage = await storageService.get([
        "clipboardDisableUploadToCloud",
        "totalCloudItems",
      ]);

      const currentSynced = storage.totalCloudItems || 0;
      const maxLimit = maxClipboardItemsLimit;

      if (storage.clipboardDisableUploadToCloud) {
        uploadDisabled = true;
        uploadDisabledReason = "Don't upload items to cloud settings is ON";
      } else if (
        maxLimit > 0 &&
        currentSynced >= maxLimit &&
        localAdditions.length > 0
      ) {
        uploadDisabled = true;
        uploadDisabledReason =
          "Synced items limit is full. Upgrade to upload more.";
      } else if (unsyncedItems.length === 0) {
        uploadDisabled = true;
        uploadDisabledReason = "No local items to upload";
      }

      // Bi-directional also depends on upload ability in this context
      bidirectionalDisabled = uploadDisabled;
      bidirectionalDisabledReason = uploadDisabledReason;
    } finally {
      isLoading = false;
    }
  });

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onCancel();
    }
  }
</script>

<div class="dark dark-contents">
  <div
    class="modal-overlay edit-clipboard-modal-wrapper"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="sync-options-title"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-content"
      onclick={(e) => e.stopPropagation()}
      tabindex="-1"
      role="document"
    >
      <div class="modal-header">
        <h2 id="sync-options-title">Sync Options</h2>
        <div class="header-right">
          <button
            onclick={(e) => {
              e.preventDefault();
              onCancel();
            }}
            class="close-btn"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div class="modal-body">
        <div class="options-grid">
          <button class="option-card" onclick={() => onConfirm("download")}>
            <div class="icon-wrapper download">
              <ChevronDown size="24" />
            </div>
            <div class="content">
              <h4>Download Only</h4>
              <p>Fetch changes from cloud without uploading local items</p>
            </div>
          </button>

          <button
            class="option-card"
            class:disabled={uploadDisabled}
            onclick={() => !uploadDisabled && onConfirm("upload")}
            disabled={uploadDisabled}
            title={uploadDisabled ? uploadDisabledReason : ""}
          >
            <div class="icon-wrapper upload">
              <ChevronUp size="24" />
            </div>
            <div class="content">
              <h4>Upload Only</h4>
              <p>
                {uploadDisabled
                  ? uploadDisabledReason
                  : "Push local changes to cloud without downloading upgrades"}
              </p>
            </div>
          </button>

          <button
            class="option-card"
            class:disabled={bidirectionalDisabled}
            onclick={() => !bidirectionalDisabled && onConfirm("bidirectional")}
            disabled={bidirectionalDisabled}
            title={bidirectionalDisabled ? bidirectionalDisabledReason : ""}
          >
            <div class="icon-wrapper sync">
              <RefreshCw size="24" />
            </div>
            <div class="content">
              <h4>Bi-directional Sync</h4>
              <p>
                {bidirectionalDisabled
                  ? bidirectionalDisabledReason
                  : "Download from cloud and upload your pending items"}
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  @use "../styles/components/sync-direction-modal" as *;
</style>
