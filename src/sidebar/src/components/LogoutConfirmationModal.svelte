<script lang="ts">
  import { X, LogOut, Trash2, Save } from "lucide-svelte";
  import { onMount, onDestroy } from "svelte";
  import "@/styles/components/plan-details-modal.scss"; // Reusing modal styles

  let {
    show = $bindable(),
    onConfirm,
    onCancel,
  } = $props<{
    show: boolean;
    onConfirm: (keepData: boolean) => void;
    onCancel?: () => void;
  }>();

  let overlayRef = $state<HTMLElement>();
  let modalRef = $state<HTMLElement>();

  function handleClose() {
    show = false;
    if (onCancel) onCancel();
  }

  function handleKeep() {
    onConfirm(true);
    show = false;
  }

  function handleClear() {
    onConfirm(false);
    show = false;
  }

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };

  onMount(() => {
    if (show) {
      document.addEventListener("keydown", handleKeydown);
    }
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeydown);
  });
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-overlay dark"
    bind:this={overlayRef}
    onclick={handleOverlayClick}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="modal-content logout-modal"
      role="document"
      bind:this={modalRef}
    >
      <button
        type="button"
        class="close-btn"
        onclick={handleClose}
        aria-label="Close"
      >
        <X class="w-5 h-5" />
      </button>

      <div class="modal-header">
        <div class="plan-info">
          <LogOut class="crown-icon text-red-500" />
          <h2>Confirm Logout</h2>
        </div>
      </div>

      <div class="modal-body">
        <p class="description">
          How should we handle your local clipboard history?
        </p>

        <div class="options-grid">
          <button class="option-card keep" onclick={handleKeep}>
            <div class="icon-wrapper">
              <Save class="w-5 h-5" />
            </div>
            <div class="text-content">
              <h3>Keep Data</h3>
              <p>
                Recommended for personal devices. History stays for next login.
              </p>
            </div>
          </button>

          <button class="option-card clear" onclick={handleClear}>
            <div class="icon-wrapper">
              <Trash2 class="w-5 h-5" />
            </div>
            <div class="text-content">
              <h3>Clear Data</h3>
              <p>Recommended for public devices. Wipes all history now.</p>
            </div>
          </button>
        </div>
      </div>

      <div class="modal-footer justify-end">
        <button class="btn btn-danger mr-2" onclick={handleClose}>
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use "../styles/components/logout-confirmation-modal" as *;
</style>
