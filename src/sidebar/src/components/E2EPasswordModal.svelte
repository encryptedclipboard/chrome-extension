<script lang="ts">
  import { tick, onMount, onDestroy } from "svelte";
  import { X, Eye, EyeOff } from "lucide-svelte";
  import Spinner from "./Spinner.svelte";
  import { storageService } from "@shared/services";
  import type { PasswordStrength } from "@shared/utils/encryption.utils";
  import { EncryptionUtils } from "@shared/utils/encryption.utils";
  import Checkbox from "./Checkbox.svelte";
  import "@/styles/components/e2e-password-modal.scss";

  interface Props {
    show: boolean;
    isFirstTime: boolean;
    onSubmit?: (password: string, rememberPassword?: boolean) => void;
    onCancel?: () => void;
    error?: string | null;
    title?: string; // Custom title (e.g., "Enter Profile Encryption Password")
    description?: string; // Custom description
    label?: string; // Custom label for password input
    showRememberCheckbox?: boolean; // Show "Remember password" checkbox

    // Customization Props
    passwordLabel?: string;
    confirmPasswordLabel?: string;
    passwordPlaceholder?: string;
    confirmPasswordPlaceholder?: string;

    showHints?: boolean;
    hint1Text?: string;
    hint2Text?: string;

    cancelButtonText?: string;
    submitButtonText?: string;
    closeOnOutsideClick?: boolean;
    enforceStrongPassword?: boolean;
    isLoading?: boolean;
  }

  const {
    show,
    isFirstTime,
    onSubmit,
    onCancel,
    error: externalError,
    title,
    description,
    showRememberCheckbox = false,

    passwordLabel = "Master Password",
    confirmPasswordLabel = "Confirm Password",
    passwordPlaceholder, // Default will be handled in template
    confirmPasswordPlaceholder = "Confirm master password",

    showHints = true,
    hint1Text = "This password is used to encrypt your data and is never sent to our servers. Please store it in a safe place.",
    hint2Text = "Important: If you forget this password, your encrypted data CANNOT be recovered. Write it down in a safe place!",

    cancelButtonText = "Cancel",
    submitButtonText, // Default will be handled depending on isFirstTime
    closeOnOutsideClick = true,
    enforceStrongPassword = true,
    isLoading = false,
  }: Props = $props();

  // Template refs
  let modalRef = $state<HTMLElement>();
  let passwordInputRef = $state<HTMLInputElement>();
  let confirmPasswordInputRef = $state<HTMLInputElement>();
  let cancelBtnRef = $state<HTMLButtonElement>();
  let submitBtnRef = $state<HTMLButtonElement>();

  let password = $state("");
  let confirmPassword = $state("");
  let showPassword = $state(false);
  let error = $state("");
  let rememberPassword = $state(false);
  let isAutoSync = $state(false);

  // Update error when external error changes
  $effect(() => {
    if (externalError) {
      error = externalError;
      // Clear password fields on error so user can retry
      password = "";
      if (isFirstTime) {
        confirmPassword = "";
      }
    } else if (
      !externalError &&
      error &&
      error !== "Passwords do not match" &&
      !error.includes("strong enough")
    ) {
      // Clear external errors when they're cleared externally
      error = "";
    }
  });

  const passwordStrength = $derived.by<PasswordStrength>(() => {
    if (!password) {
      return { score: 0, feedback: [], isStrong: false };
    }
    return EncryptionUtils.validatePasswordStrength(password);
  });

  const strengthColorClass = $derived.by(() => {
    const score = passwordStrength.score;
    if (score <= 1) return "strength-red";
    if (score === 2) return "strength-orange";
    if (score === 3) return "strength-yellow";
    return "strength-green";
  });

  const strengthBarColorClass = $derived.by(() => {
    const score = passwordStrength.score;
    if (score <= 1) return "strength-red";
    if (score === 2) return "strength-orange";
    if (score === 3) return "strength-yellow";
    return "strength-green";
  });

  const strengthText = $derived.by(() => {
    const score = passwordStrength.score;
    if (score <= 1) return "Weak";
    if (score === 2) return "Fair";
    if (score === 3) return "Good";
    return "Strong";
  });

  const canSubmit = $derived.by(() => {
    if (!password) return false;
    // Only validate password strength when setting password for the first time
    // When asking for existing password (isFirstTime=false), accept any password
    if (isFirstTime) {
      if (!enforceStrongPassword) {
        return password === confirmPassword && password.length > 0;
      }
      return password === confirmPassword && passwordStrength.isStrong;
    }
    // For existing passwords, just check that password is not empty
    return password.length > 0;
  });

  function handleSubmit() {
    // Clear error if it was set externally, but keep it if it's a validation error
    if (!externalError) {
      error = "";
    }
    if (!canSubmit) {
      // Only show validation errors when setting password for the first time
      if (isFirstTime) {
        if (password !== confirmPassword) {
          error = "Passwords do not match";
        } else if (enforceStrongPassword && !passwordStrength.isStrong) {
          error =
            "Password is not strong enough. Please follow the suggestions.";
        }
      }
      return;
    }
    // When asking for existing password, accept whatever is entered (no validation)
    onSubmit?.(password, showRememberCheckbox ? rememberPassword : undefined);
  }

  function handleCancel() {
    onCancel?.();
  }

  // Focus management
  function handleTabKey(event: KeyboardEvent) {
    if (!show) return;

    const focusableElements = [
      passwordInputRef,
      confirmPasswordInputRef,
      cancelBtnRef,
      submitBtnRef,
    ].filter(Boolean);

    if (focusableElements.length === 0) return;

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

  // Auto-focus on first input when modal opens
  async function focusFirstInput() {
    await tick();
    passwordInputRef?.focus();
  }

  // Reset form when modal is hidden or shown
  $effect(() => {
    if (!show) {
      password = "";
      confirmPassword = "";
      error = "";
      showPassword = false;
    } else {
      // Reset form when modal opens (but keep external error if present)
      if (!externalError) {
        password = "";
        confirmPassword = "";
        error = "";
        rememberPassword = false;
      }
      // Auto-focus when modal opens
      focusFirstInput();
    }
  });

  onMount(async () => {
    document.addEventListener("keydown", handleTabKey);
    // Check auto-sync status
    try {
      const result = await storageService.get(["clipboardAutoSync"]);
      isAutoSync = result.clipboardAutoSync === true;
    } catch (err) {
      console.error("Failed to get auto-sync status", err);
    }
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleTabKey);
  });

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget && closeOnOutsideClick) {
      handleCancel();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      handleCancel();
    }
  }

  function toggleShowPassword() {
    showPassword = !showPassword;
  }
</script>

{#if show}
  <div
    class="modal-overlay dark e2e-password-modal-wrapper"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
    role="presentation"
  >
    <div
      class="modal"
      role="dialog"
      aria-labelledby="modal-title"
      aria-modal="true"
      bind:this={modalRef}
      tabindex="-1"
    >
      <div class="modal-header">
        <h3 id="modal-title">
          {title ||
            (isFirstTime ? "Set Master Password" : "Enter Master Password")}
        </h3>
        <button
          onclick={handleCancel}
          class="close-btn"
          aria-label="Close modal"
        >
          <X size={16} />
        </button>
      </div>

      <div class="modal-body">
        <p class="modal-description">
          {description ||
            (isFirstTime
              ? "Create a strong password to encrypt your sync data. This password is NEVER sent to our servers."
              : "Enter your master password to decrypt your synced data.")}
        </p>

        <!-- Password Input -->
        <div class="form-group">
          <label for="master-password-input">{passwordLabel}</label>
          <div class="relative">
            <input
              bind:this={passwordInputRef}
              bind:value={password}
              type={showPassword ? "text" : "password"}
              id="master-password-input"
              class="input"
              placeholder={passwordPlaceholder ||
                (passwordLabel
                  ? `Enter ${passwordLabel.toLowerCase()}`
                  : "Enter master password")}
              onkeyup={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button
              onclick={toggleShowPassword}
              class="password-toggle-btn"
              type="button"
            >
              {#if showPassword}
                <EyeOff size={14} />
              {:else}
                <Eye size={14} />
              {/if}
            </button>
          </div>
        </div>

        <!-- Confirm Password (only for first time) -->
        {#if isFirstTime}
          <div class="form-group">
            <label for="confirm-password-input">{confirmPasswordLabel}</label>
            <input
              bind:this={confirmPasswordInputRef}
              bind:value={confirmPassword}
              type={showPassword ? "text" : "password"}
              id="confirm-password-input"
              class="input"
              placeholder={confirmPasswordPlaceholder}
              onkeyup={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
        {/if}

        <!-- Password Strength Indicator (only for first time) -->
        {#if isFirstTime && password}
          <div class="form-group">
            <div class="password-strength-header">
              <span class="password-strength-label">Password Strength</span>
              <span class="password-strength-badge {strengthColorClass}"
                >{strengthText}</span
              >
            </div>
            <div class="password-strength-bar-container">
              <div
                class="password-strength-bar {strengthBarColorClass}"
                style="width: {(passwordStrength.score / 4) * 100}%"
              ></div>
            </div>
            {#if passwordStrength.feedback.length > 0}
              <ul class="password-strength-feedback">
                {#each passwordStrength.feedback as tip, index (index)}
                  <li>{tip}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}

        <!-- Remember Password Checkbox (only when showRememberCheckbox is true) -->
        {#if showRememberCheckbox && !isFirstTime}
          <div class="form-group">
            <div class="checkbox-group">
              <button
                class="checkbox-wrapper"
                onclick={() => (rememberPassword = !rememberPassword)}
                type="button"
              >
                <Checkbox bind:value={rememberPassword} noMargin />
                <label for="remember-password" class="checkbox-label">
                  Remember password for this profile
                </label>
              </button>
            </div>
            <small class="field-hint">
              Your password will be securely stored and used to auto-apply this
              profile on page reload.
            </small>
          </div>
        {/if}

        <!-- Error Message -->
        {#if error}
          <div class="error-message" role="alert">
            {error}
          </div>
        {/if}

        {#if showHints}
          {#if hint1Text}
            <div class="modal-hint">
              <small>{hint1Text}</small>
            </div>
          {/if}

          <!-- Warning Box -->
          {#if isFirstTime && hint2Text}
            <div class="warning-box">
              {#if hint2Text.includes(":")}
                <strong>{hint2Text.split(":")[0]}:</strong>{hint2Text.substring(
                  hint2Text.indexOf(":") + 1,
                )}
              {:else}
                {hint2Text}
              {/if}
            </div>
          {/if}

          <!-- Auto-Sync Hint -->
          {#if isAutoSync}
            <div class="modal-hint mt-2">
              <small style="color: var(--text-tertiary);">
                <strong>Note:</strong> Since auto-sync is on, your password will be
                remembered locally (encrypted) to keep sync active.
              </small>
            </div>
          {/if}
        {/if}
      </div>

      <div class="modal-footer">
        <button
          onclick={handleCancel}
          class="btn btn-danger"
          type="button"
          disabled={isLoading}
          bind:this={cancelBtnRef}>{cancelButtonText}</button
        >
        <button
          onclick={handleSubmit}
          disabled={!canSubmit || isLoading}
          class="btn btn-primary"
          type="button"
          bind:this={submitBtnRef}
        >
          {#if isLoading}
            <Spinner size={14} />
            <span>Verifying...</span>
          {:else}
            {submitButtonText || (isFirstTime ? "Set Password" : "Unlock")}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
