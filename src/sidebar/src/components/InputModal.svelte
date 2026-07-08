<script lang="ts">
  import { tick } from "svelte";
  import { X } from "lucide-svelte";
  import "@/styles/components/input-modal.scss";

  interface Props {
    show: boolean;
    title?: string;
    message?: string;
    placeholder?: string;
    defaultValue?: string;
    confirmText?: string;
    cancelText?: string;
    onconfirm?: (value: string) => void;
    oncancel?: () => void;
  }

  const {
    show,
    title = "Enter Value",
    message,
    placeholder = "",
    defaultValue = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    onconfirm,
    oncancel,
  }: Props = $props();

  const id = Math.random().toString(36).substring(7);
  let modalRef = $state<HTMLElement>();
  let inputRef = $state<HTMLInputElement>();
  let confirmBtnRef = $state<HTMLButtonElement>();
  let cancelBtnRef = $state<HTMLButtonElement>();
  let value = $state(defaultValue);

  $effect(() => {
    if (show) {
      value = defaultValue;
      tick().then(() => {
        inputRef?.focus();
        inputRef?.select();
      });
    }
  });

  function handleConfirm() {
    if (!value.trim()) return;
    onconfirm?.(value);
  }

  function handleCancel() {
    oncancel?.();
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      handleCancel();
    }
    if (event.key === "Enter" && document.activeElement === inputRef) {
      handleConfirm();
    }
  }
</script>

{#if show}
  <div
    class="modal-overlay input-modal-wrapper confirm-modal-wrapper"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="input-title-{id}"
    tabindex="-1"
  >
    <div class="modal" bind:this={modalRef} tabindex="-1">
      <div class="modal-header">
        <h3 id="input-title-{id}">{title}</h3>
        <button
          onclick={handleCancel}
          class="close-btn"
          aria-label="Close modal"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="modal-body">
        {#if message}
          <p class="mb-3 text-sm text-muted-foreground">{message}</p>
        {/if}
        <input
          bind:this={inputRef}
          bind:value
          type="text"
          class="input-field"
          {placeholder}
        />
      </div>

      <div class="modal-footer">
        <button
          bind:this={cancelBtnRef}
          class="btn btn-danger"
          onclick={handleCancel}
          type="button"
        >
          {cancelText}
        </button>
        <button
          bind:this={confirmBtnRef}
          class="btn btn-primary"
          onclick={handleConfirm}
          disabled={!value.trim()}
          type="button"
        >
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
