<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Lock, AlertCircle, Check } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { lockService } from "@shared/services";
  import "@/styles/components/pin-setup-modal.scss";

  interface Props {
    onsetup: () => void;
    oncancel?: () => void;
  }

  const { onsetup, oncancel }: Props = $props();

  // PIN input state
  const pinDigits = $state(["", "", "", "", "", ""]);
  let confirmDigits = $state(["", "", "", "", "", ""]);
  let step = $state<"enter" | "confirm">("enter");
  const pinInputs: HTMLInputElement[] = [];
  const confirmInputs: HTMLInputElement[] = [];
  let isSettingUp = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    if (step === "enter") {
      tick().then(() => {
        pinInputs[0]?.focus();
      });
    }
  });

  function handlePinInput(index: number, event: Event, isConfirm: boolean) {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const digits = isConfirm ? confirmDigits : pinDigits;
    const inputs = isConfirm ? confirmInputs : pinInputs;

    // Only allow digits
    if (!/^\d*$/.test(value)) {
      input.value = digits[index];
      return;
    }

    // Update digit
    if (isConfirm) {
      confirmDigits[index] = value.slice(-1);
    } else {
      pinDigits[index] = value.slice(-1);
    }

    // Auto-focus next input
    if (value && index < 5) {
      inputs[index + 1]?.focus();
    }

    // Clear error when user starts typing
    if (error) {
      error = null;
    }
  }

  function handleKeyDown(
    index: number,
    event: KeyboardEvent,
    isConfirm: boolean,
  ) {
    const digits = isConfirm ? confirmDigits : pinDigits;
    const inputs = isConfirm ? confirmInputs : pinInputs;

    // Handle backspace
    if (event.key === "Backspace") {
      if (!digits[index] && index > 0) {
        inputs[index - 1]?.focus();
      } else {
        if (isConfirm) {
          confirmDigits[index] = "";
        } else {
          pinDigits[index] = "";
        }
      }
    }
    // Handle arrow keys
    else if (event.key === "ArrowLeft" && index > 0) {
      inputs[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      inputs[index + 1]?.focus();
    }

    // Handle Enter to submit
    if (event.key === "Enter") {
      if (isConfirm && confirmDigits.every((d) => d !== "")) {
        handleSetup();
      } else if (!isConfirm && pinDigits.every((d) => d !== "")) {
        handleContinue();
      }
    }
  }

  async function handleSetup() {
    const pin = pinDigits.join("");
    const confirm = confirmDigits.join("");

    if (pin.length !== 6 || confirm.length !== 6) {
      error = "Please enter all 6 digits";
      return;
    }

    if (pin !== confirm) {
      error = "PINs do not match";
      // Clear confirm and go back
      confirmDigits = ["", "", "", "", "", ""];
      step = "enter";
      setTimeout(() => pinInputs[0]?.focus(), 100);
      return;
    }

    isSettingUp = true;
    error = null;

    try {
      await lockService.setPin(pin);
      toast.success("PIN set successfully");
      onsetup();
    } catch (err: any) {
      console.error("[PinSetup] Failed:", err);
      error = err.message || "Failed to set PIN";
    } finally {
      isSettingUp = false;
    }
  }

  function handleContinue() {
    step = "confirm";
    setTimeout(() => confirmInputs[0]?.focus(), 100);
  }

  function handleBack() {
    step = "enter";
    confirmDigits = ["", "", "", "", "", ""];
    setTimeout(() => pinInputs[0]?.focus(), 100);
  }
</script>

<div class="pin-setup-modal">
  <div class="setup-container">
    <!-- Logo -->
    <div class="logo">
      <div class="logo-icon">
        <Lock class="w-10 h-10" />
      </div>
      <h2>Set PIN Lock</h2>
    </div>

    <!-- Step Indicator -->
    <div class="steps">
      <div
        class="step"
        class:active={step === "enter"}
        class:completed={step === "confirm"}
      >
        <div class="step-number">
          {#if step === "confirm"}
            <Check size={14} />
          {:else}
            1
          {/if}
        </div>
        <span>Enter PIN</span>
      </div>
      <div class="step-line" class:active={step === "confirm"}></div>
      <div class="step" class:active={step === "confirm"}>
        <div class="step-number">2</div>
        <span>Confirm PIN</span>
      </div>
    </div>

    <!-- Instructions -->
    <div class="instructions">
      {#if step === "enter"}
        <p>Create a 6-digit PIN to lock your clipboard</p>
      {:else}
        <p>Re-enter your PIN to confirm</p>
      {/if}
    </div>

    <!-- PIN Input -->
    {#if step === "enter"}
      <div class="pin-inputs">
        {#each pinDigits as digit, index}
          <input
            bind:this={pinInputs[index]}
            type="password"
            inputmode="numeric"
            maxlength="1"
            value={digit}
            oninput={(e) => handlePinInput(index, e, false)}
            onkeydown={(e) => handleKeyDown(index, e, false)}
            class="pin-input"
            class:filled={digit !== ""}
            class:error={error !== null}
            disabled={isSettingUp}
          />
        {/each}
      </div>
    {:else}
      <div class="pin-inputs">
        {#each confirmDigits as digit, index}
          <input
            bind:this={confirmInputs[index]}
            type="password"
            inputmode="numeric"
            maxlength="1"
            value={digit}
            oninput={(e) => handlePinInput(index, e, true)}
            onkeydown={(e) => handleKeyDown(index, e, true)}
            class="pin-input"
            class:filled={digit !== ""}
            class:error={error !== null}
            disabled={isSettingUp}
          />
        {/each}
      </div>
    {/if}

    <!-- Error Message -->
    {#if error}
      <div class="error-message">
        <AlertCircle size={14} />
        <span>{error}</span>
      </div>
    {/if}

    <!-- Actions -->
    <div class="actions">
      {#if step === "confirm"}
        <button
          class="btn btn-danger"
          onclick={handleBack}
          disabled={isSettingUp}
        >
          Back
        </button>
      {/if}
      <button
        class="btn btn-primary"
        onclick={step === "enter" ? handleContinue : handleSetup}
        disabled={isSettingUp ||
          (step === "enter"
            ? pinDigits.some((d) => d === "")
            : confirmDigits.some((d) => d === ""))}
      >
        {#if isSettingUp}
          Setting up...
        {:else if step === "enter"}
          Continue
        {:else}
          Set PIN
        {/if}
      </button>
      {#if oncancel}
        <button
          class="btn btn-secondary"
          onclick={oncancel}
          disabled={isSettingUp}
        >
          Cancel
        </button>
      {/if}
    </div>
  </div>
</div>
