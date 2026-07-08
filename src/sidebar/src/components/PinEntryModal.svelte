<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Lock, X, AlertCircle } from "lucide-svelte";
  import "@/styles/components/pin-setup-modal.scss";

  interface Props {
    onSubmit: (pin: string) => void;
    onCancel: () => void;
    onInputChange?: () => void;
    title?: string;
    description?: string;
    submitButtonText?: string;
    isLoading?: boolean;
    error?: string | null;
  }

  const {
    onSubmit,
    onCancel,
    onInputChange,
    title = "Enter PIN",
    description = "Enter your 6-digit PIN",
    submitButtonText = "Confirm",
    isLoading = false,
    error = null,
  }: Props = $props();

  const digits = $state(["", "", "", "", "", ""]);
  const inputs = $state<HTMLInputElement[]>([]);

  onMount(() => {
    tick().then(() => {
      inputs[0]?.focus();
    });
  });

  function handleInput(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    if (!/^\d*$/.test(value)) {
      input.value = digits[index];
      return;
    }

    digits[index] = value.slice(-1);

    if (value && index < 5) {
      inputs[index + 1]?.focus();
    }

    if (error) onInputChange?.();
  }

  function handleKeyDown(index: number, event: KeyboardEvent) {
    if (event.key === "Backspace") {
      if (!digits[index] && index > 0) {
        inputs[index - 1]?.focus();
      } else {
        digits[index] = "";
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      inputs[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      inputs[index + 1]?.focus();
    } else if (event.key === "Enter") {
      handleSubmit();
    }
  }

  function handleSubmit() {
    const pin = digits.join("");
    if (pin.length !== 6) return;
    onSubmit(pin);
  }
</script>

<div class="pin-setup-modal">
  <div class="setup-container">
    <div class="logo">
      <div class="logo-icon">
        <Lock class="w-10 h-10" />
      </div>
      <h2>{title}</h2>
    </div>

    <div class="instructions">
      <p>{description}</p>
    </div>

    <div class="pin-inputs">
      {#each digits as digit, index}
        <input
          bind:this={inputs[index]}
          type="password"
          inputmode="numeric"
          maxlength="1"
          value={digit}
          oninput={(e) => handleInput(index, e)}
          onkeydown={(e) => handleKeyDown(index, e)}
          class="pin-input"
          class:filled={digit !== ""}
          class:error={error !== null}
          disabled={isLoading}
        />
      {/each}
    </div>

    {#if error}
      <div class="error-message">
        <AlertCircle size={14} />
        <span>{error}</span>
      </div>
    {/if}

    <div class="actions">
      <button
        class="btn btn-primary"
        onclick={handleSubmit}
        disabled={isLoading || digits.some((d) => d === "")}
      >
        {#if isLoading}
          Verifying...
        {:else}
          <Lock size={14} />
          {submitButtonText}
        {/if}
      </button>
      <button class="btn btn-danger" onclick={onCancel} disabled={isLoading}>
        <X size={14} />
        Cancel
      </button>
    </div>
  </div>
</div>
