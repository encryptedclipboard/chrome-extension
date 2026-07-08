<script lang="ts">
  import type { KeyboardShortcut } from "@shared/types/shortcut.types";

  interface Props {
    shortcut: KeyboardShortcut;
    onChange?: (shortcut: KeyboardShortcut) => void;
  }

  let { shortcut = $bindable(), onChange }: Props = $props();

  let isRecording = $state(false);
  let recordedKeys = $state<string[]>([]);

  function startRecording() {
    isRecording = true;
    recordedKeys = [];
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    // Ignore modifier-only keys
    if (
      ["Control", "Alt", "Shift", "Meta"].includes(e.key) ||
      e.key === "CapsLock"
    ) {
      return;
    }

    // Validate: Must have at least one modifier
    if (!e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      return;
    }

    // Create shortcut config
    const newShortcut: KeyboardShortcut = {
      key: e.code,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    };

    shortcut = newShortcut;
    isRecording = false;
    onChange?.(newShortcut);
  }

  function formatShortcut(sc: KeyboardShortcut): string {
    const parts: string[] = [];
    if (sc.ctrlKey) parts.push("Ctrl");
    if (sc.altKey) parts.push("Alt");
    if (sc.shiftKey) parts.push("Shift");
    if (sc.metaKey) parts.push("Meta");

    // Convert KeyCode to readable key
    const keyName = sc.key.replace("Key", "").replace("Digit", "");
    parts.push(keyName);

    return parts.join(" + ");
  }

  function handleBlur() {
    isRecording = false;
  }
</script>

<div class="shortcut-recorder">
  <button
    class="shortcut-display"
    class:recording={isRecording}
    onclick={startRecording}
    onkeydown={handleKeyDown}
    onblur={handleBlur}
    type="button"
  >
    {#if isRecording}
      <span class="recording-text">Press your shortcut...</span>
    {:else}
      <span class="shortcut-text">{formatShortcut(shortcut)}</span>
    {/if}
  </button>
  <p class="hint">
    Click and press a key combination (must include a modifier)
  </p>
</div>

<style lang="scss">
  @use "../styles/components/keyboard-shortcut-recorder" as *;
</style>
