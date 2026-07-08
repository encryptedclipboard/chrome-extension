<script lang="ts">
  import { tick, onMount, onDestroy } from "svelte";
  import { X } from "lucide-svelte";
  import Radio from "./Radio.svelte";
  import "@/styles/components/confirm-modal.scss";

  interface Props {
    show: boolean;
    title?: string;
    message: string;
    itemCount: number;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: (deleteFromCloud: boolean) => void;
    onCancel?: () => void;
    isLoggedIn?: boolean;
  }

  const {
    show,
    title = "Confirm Deletion",
    message,
    itemCount,
    confirmText = "Delete",
    cancelText = "Cancel",
    onConfirm,
    onCancel,
    isLoggedIn = true,
  }: Props = $props();

  const id = Math.random().toString(36).substring(7);
  let modalRef = $state<HTMLElement>();
  let confirmBtnRef = $state<HTMLButtonElement>();
  let cancelBtnRef = $state<HTMLButtonElement>();
  let deleteScope = $state<"local" | "cloud">("local"); // Default to local for safety

  function handleConfirm() {
    // Only allow cloud deletion if user is logged in
    onConfirm?.(isLoggedIn && deleteScope === "cloud");
  }

  function handleCancel() {
    onCancel?.();
  }

  // Handle Tab key for cycling between focusable elements
  function handleTabKey(event: KeyboardEvent) {
    if (!show) return;

    const focusableElements = [cancelBtnRef, confirmBtnRef].filter(Boolean);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.key === "Tab") {
      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    }
  }

  // Focus management
  $effect(() => {
    if (show) {
      // Reset to local when modal opens
      deleteScope = "local";
      tick().then(() => {
        cancelBtnRef?.focus();
      });
    }
  });

  onMount(() => {
    document.addEventListener("keydown", handleTabKey);
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleTabKey);
  });

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      handleCancel();
    }
  }

  function handleRadioChange(value: string) {
    deleteScope = value as "local" | "cloud";
  }
</script>

{#if show}
  <div class="dark dark-contents">
    <div
      class="modal-overlay confirm-modal-wrapper"
      onclick={handleOverlayClick}
      onkeydown={handleKeydown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title-{id}"
      aria-describedby="confirm-message-{id}"
      tabindex="-1"
    >
      <div class="modal" bind:this={modalRef} tabindex="-1">
        <div class="modal-header">
          <h3 id="confirm-title-{id}">{title}</h3>
          <button
            onclick={handleCancel}
            class="close-btn"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <div class="modal-body">
          <p id="confirm-message-{id}">{message}</p>

          {#if isLoggedIn}
            <div class="delete-scope-options">
              <div
                class="radio-option-wrapper"
                onclick={() => (deleteScope = "local")}
              >
                <Radio
                  name="delete-scope-{id}"
                  value="local"
                  checked={deleteScope === "local"}
                  onchange={handleRadioChange}
                >
                  <div class="radio-content-text">
                    <span class="radio-title">This browser only</span>
                    <span class="radio-description">
                      Remove {itemCount}
                      {itemCount === 1 ? "item" : "items"} from this browser. Items
                      will remain in the cloud and other devices.
                    </span>
                  </div>
                </Radio>
              </div>

              <div
                class="radio-option-wrapper"
                onclick={() => (deleteScope = "cloud")}
              >
                <Radio
                  name="delete-scope-{id}"
                  value="cloud"
                  checked={deleteScope === "cloud"}
                  onchange={handleRadioChange}
                >
                  <div class="radio-content-text">
                    <span class="radio-title">All devices (cloud)</span>
                    <span class="radio-description">
                      Permanently delete {itemCount}
                      {itemCount === 1 ? "item" : "items"} from the cloud. This will
                      remove them from all your devices.
                    </span>
                  </div>
                </Radio>
              </div>
            </div>
          {/if}
        </div>

        <div class="modal-footer">
          <button
            bind:this={cancelBtnRef}
            class="btn btn-danger"
            onclick={handleCancel}
            tabindex="0"
            type="button"
          >
            {cancelText}
          </button>
          <button
            bind:this={confirmBtnRef}
            class="btn btn-danger"
            onclick={handleConfirm}
            tabindex="0"
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use "../styles/components/confirm-modal" as *;
</style>
