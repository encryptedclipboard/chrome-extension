<script lang="ts">
  import { tick, onMount, onDestroy } from "svelte";
  import { X } from "lucide-svelte";
  import "@/styles/components/confirm-modal.scss";

  interface Props {
    show: boolean;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "danger" | "warning";
    onConfirm?: () => void;
    onCancel?: () => void;
  }

  const {
    show,
    title = "Confirm",
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "default",
    onConfirm,
    onCancel,
  }: Props = $props();

  const id = Math.random().toString(36).substring(7);
  let modalRef = $state<HTMLElement>();
  let confirmBtnRef = $state<HTMLButtonElement>();
  let cancelBtnRef = $state<HTMLButtonElement>();

  function handleConfirm() {
    onConfirm?.();
  }

  function handleCancel() {
    onCancel?.();
  }

  // Handle Tab key for cycling between buttons
  function handleTabKey(event: KeyboardEvent) {
    if (!show) return;

    const focusableElements = [cancelBtnRef, confirmBtnRef].filter(Boolean);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.key === "Tab") {
      if (event.shiftKey) {
        // Shift+Tab - move backwards
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab - move forwards
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
      tick().then(() => {
        // Focus the cancel button by default (safer choice)
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
            <X size={16} />
          </button>
        </div>

        <div class="modal-body">
          <p id="confirm-message-{id}">{message}</p>
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
            class="btn"
            class:btn-danger={variant === "danger"}
            class:btn-warning={variant === "warning"}
            class:btn-primary={variant === "default"}
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
