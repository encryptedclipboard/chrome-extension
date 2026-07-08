<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { CircleAlert, Trash2, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import "@/styles/components/lock-screen.scss";
  import { MessageType } from "@shared/types/message.types";
  import { getErrorMessage } from "../utils/error-handler.util";
  import { sendUnlock, sendResetPin } from "@shared/utils/message.utils";

  interface Props {
    onunlock: () => void;
  }

  const { onunlock }: Props = $props();

  // PIN input state
  let pinDigits = $state(["", "", "", "", "", ""]);
  const pinInputs = $state<HTMLInputElement[]>([]);
  let isUnlocking = $state(false);
  let error = $state<string | null>(null);
  let showResetModal = $state(false);
  let isResetting = $state(false);
  let unlockProgress = $state({ current: 0, total: 0 });

  const unlockEmojis = [
    { emoji: "🔓", text: "Cracking open the vault..." },
    { emoji: "🚪", text: "Opening the gates..." },
    { emoji: "☀️", text: "Letting the light in..." },
    { emoji: "🎉", text: "Preparing your clipboard..." },
    { emoji: "📦", text: "Unpacking your items..." },
    { emoji: "🌟", text: "Polishing your data..." },
    { emoji: "🎯", text: "Almost there..." },
    { emoji: "🔄", text: "Finalizing the unlock..." },
    { emoji: "🏁", text: "You're about to cross the finish line..." },
  ];

  let emojiIndex = $state(0);
  let emojiInterval: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    if (isUnlocking) {
      emojiIndex = 0;
      emojiInterval = setInterval(() => {
        emojiIndex = (emojiIndex + 1) % unlockEmojis.length;
      }, 5000);
    } else {
      if (emojiInterval) {
        clearInterval(emojiInterval);
        emojiInterval = undefined;
      }
    }
  });

  onDestroy(() => {
    if (emojiInterval) clearInterval(emojiInterval);
  });

  onMount(() => {
    // Focus first input
    pinInputs[0]?.focus();

    const listener = (message: any) => {
      if (message.type === MessageType.UNLOCK_PROGRESS) {
        unlockProgress = message.payload;
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => chrome.runtime.onMessage.removeListener(listener);
  });

  function handlePinInput(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    // Only allow digits
    if (!/^\d*$/.test(value)) {
      input.value = pinDigits[index];
      return;
    }

    // Update digit
    pinDigits[index] = value.slice(-1); // Take last digit only

    // Auto-focus next input
    if (value && index < 5) {
      pinInputs[index + 1]?.focus();
    }

    // Clear error when user starts typing
    if (error) {
      error = null;
    }

    // Auto-submit when all digits entered
    if (pinDigits.every((d) => d !== "")) {
      handleUnlock();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent) {
    // Handle backspace
    if (event.key === "Backspace") {
      if (!pinDigits[index] && index > 0) {
        // Move to previous input if current is empty
        pinInputs[index - 1]?.focus();
      } else {
        // Clear current digit
        pinDigits[index] = "";
      }
    }
    // Handle arrow keys
    else if (event.key === "ArrowLeft" && index > 0) {
      pinInputs[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      pinInputs[index + 1]?.focus();
    }
    // Handle Enter to submit
    else if (event.key === "Enter") {
      handleUnlock();
    }
  }

  function handlePaste(event: ClipboardEvent) {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData("text") || "";
    const digits = pastedData.replace(/\D/g, "").slice(0, 6);

    for (let i = 0; i < digits.length; i++) {
      pinDigits[i] = digits[i];
    }

    // Focus the next empty input or last input
    const nextEmptyIndex = pinDigits.findIndex((d) => d === "");
    if (nextEmptyIndex !== -1) {
      pinInputs[nextEmptyIndex]?.focus();
    } else {
      pinInputs[5]?.focus();
    }

    // Auto-submit if complete
    if (digits.length === 6) {
      handleUnlock();
    }
  }

  async function handleUnlock() {
    const pin = pinDigits.join("");
    if (pin.length !== 6) {
      error = "Please enter all 6 digits";
      return;
    }

    isUnlocking = true;
    error = null;
    unlockProgress = { current: 0, total: 0 };

    try {
      const response = await sendUnlock({ pin });

      if (!response?.success) {
        throw new Error(response?.error || "Invalid PIN");
      }

      toast.success("Clipboard unlocked successfully");
      onunlock();
    } catch (err: any) {
      console.error("[LockScreen] Unlock failed:", err);
      error = getErrorMessage(err);
      // Clear PIN
      pinDigits = ["", "", "", "", "", ""];
      pinInputs[0]?.focus();
    } finally {
      isUnlocking = false;
    }
  }

  async function handleResetPin() {
    isResetting = true;
    try {
      const response = await sendResetPin();

      if (!response?.success) {
        throw new Error(response?.error || "Failed to reset PIN");
      }

      toast.success(
        "PIN reset successfully. All encrypted data has been deleted.",
      );
      showResetModal = false;
      // Reload to show setup screen
      window.location.reload();
    } catch (err: any) {
      console.error("[LockScreen] Reset failed:", err);
      toast.error("Failed to reset PIN");
    } finally {
      isResetting = false;
    }
  }
</script>

<div class="lock-screen">
  <div class="lock-container">
    <!-- Logo -->
    <!-- Title -->
    <div class="lock-title">
      <h2>Enter PIN to Unlock</h2>
      <p>Enter your 6-digit PIN to access your clipboard</p>
    </div>

    <!-- PIN Input -->
    <div class="pin-inputs">
      {#each pinDigits as digit, index}
        <input
          bind:this={pinInputs[index]}
          type="password"
          inputmode="numeric"
          maxlength="1"
          value={digit}
          oninput={(e) => handlePinInput(index, e)}
          onkeydown={(e) => handleKeyDown(index, e)}
          onpaste={index === 0 ? handlePaste : undefined}
          class="pin-input"
          class:filled={digit !== ""}
          class:error={error !== null}
          disabled={isUnlocking}
        />
      {/each}
    </div>

    <!-- Unlock Progress Bar -->
    {#if isUnlocking && unlockProgress.total > 0}
      <div class="unlock-progress-container">
        <div class="unlock-emoji pulse">
          {unlockEmojis[emojiIndex].emoji}
        </div>
        <p class="unlock-emoji-text">
          {unlockEmojis[emojiIndex].text}
        </p>
        <div class="progress-bar-bg">
          <div
            class="progress-bar-fill"
            style:width="{(unlockProgress.current / unlockProgress.total) *
              100}%"
          ></div>
        </div>
        <div class="progress-text">
          {unlockProgress.current} / {unlockProgress.total} items
        </div>
      </div>
    {/if}

    <!-- Error Message -->
    {#if error}
      <div class="error-message">
        <CircleAlert class="w-4 h-4" />
        <span>{error}</span>
      </div>
    {/if}

    <!-- Unlock Button -->
    <button
      class="unlock-btn"
      onclick={handleUnlock}
      disabled={isUnlocking || pinDigits.some((d) => d === "")}
    >
      {#if isUnlocking}
        Unlocking...
      {:else}
        Unlock
      {/if}
    </button>

    <!-- Reset PIN Button -->
    <button
      class="reset-btn"
      onclick={() => (showResetModal = true)}
      disabled={isUnlocking}
    >
      Reset PIN
    </button>

    <!-- Reset Confirmation Modal (Nested inside lock-screen to inherit styles) -->
    {#if showResetModal}
      <div
        class="modal-overlay"
        role="button"
        tabindex="0"
        onclick={() => (showResetModal = false)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") showResetModal = false;
        }}
      >
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="modal-content"
          role="document"
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => e.stopPropagation()}
        >
          <div class="modal-header">
            <Trash2 class="w-6 h-6" style="color: var(--danger-color);" />
            <h3>Reset PIN & Delete Data</h3>
            <button
              class="close-btn"
              onclick={() => (showResetModal = false)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div class="modal-body">
            <p class="warning-text">
              <strong>⚠️ Warning:</strong> This action cannot be undone!
            </p>
            <p>
              Resetting your PIN will <strong>permanently delete</strong> all encrypted
              clipboard data stored with your old PIN. This data cannot be recovered
              without the old PIN.
            </p>
            <p>After reset, you'll be able to set a new PIN and start fresh.</p>
          </div>

          <div class="modal-actions">
            <button
              class="btn btn-danger"
              onclick={() => (showResetModal = false)}
              disabled={isResetting || isUnlocking}
            >
              Cancel
            </button>
            <button
              class="btn btn-danger"
              onclick={handleResetPin}
              disabled={isResetting || isUnlocking}
            >
              {#if isResetting}
                Resetting...
              {:else}
                Reset PIN & Delete Data
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
