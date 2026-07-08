<script lang="ts">
  import { tick } from "svelte";
  import { X, Eye, EyeOff, Lock, Trash2, ShieldCheck } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { EncryptionUtils } from "@shared/utils/encryption.utils";
  import type { PasswordStrength } from "@shared/utils/encryption.utils";
  import "@/styles/components/change-password-modal.scss";

  import type { ChangePasswordPayload } from "@shared/types/settings.types";

  interface Props {
    show: boolean;
    error?: string;
    loading?: boolean;
    hideModes?: boolean;
    onCancel?: () => void;
    onSubmit?: (data: ChangePasswordPayload) => void;
  }

  const {
    show,
    error: serverError = "",
    loading = false,
    hideModes = false,
    onCancel,
    onSubmit,
  }: Props = $props();

  // State
  let mode = $state<"reencrypt" | "reset">("reencrypt");
  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");
  let showPassword = $state(false);
  let error = $state("");

  // Refs
  const modalRef = $state<HTMLElement>();
  let currentPasswordInputRef = $state<HTMLInputElement>();
  let newPasswordInputRef = $state<HTMLInputElement>();

  const passwordStrength = $derived.by<PasswordStrength>(() => {
    if (!newPassword) {
      return { score: 0, feedback: [], isStrong: false };
    }
    return EncryptionUtils.validatePasswordStrength(newPassword);
  });

  const strengthColorClass = $derived.by(() => {
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
    if (
      !newPassword ||
      newPassword !== confirmPassword ||
      !passwordStrength.isStrong
    ) {
      return false;
    }
    if (!hideModes && mode === "reencrypt" && !currentPassword) {
      return false;
    }
    return true;
  });

  function handleSubmit() {
    if (!canSubmit) return;

    if (hideModes) {
      onSubmit?.({ mode: "reencrypt", currentPassword: "", newPassword });
      return;
    }

    if (mode === "reencrypt") {
      if (currentPassword === newPassword) {
        toast.warning("New password must be different from current password");
        return;
      }
      onSubmit?.({
        mode,
        currentPassword,
        newPassword,
      });
    } else {
      onSubmit?.({
        mode,
        newPassword,
      });
    }
  }

  function handleCancel() {
    onCancel?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      handleSubmit();
    }
  }

  function toggleShowPassword() {
    showPassword = !showPassword;
  }

  // Sync server error to local display
  $effect(() => {
    error = serverError;
  });

  // Reset logic
  $effect(() => {
    if (!show) {
      currentPassword = "";
      newPassword = "";
      confirmPassword = "";
      error = "";
      mode = "reencrypt";
    }
    if (show) {
      tick().then(() => {
        if (hideModes) {
          newPasswordInputRef?.focus();
        } else {
          currentPasswordInputRef?.focus();
        }
      });
    }
  });

  // Strength Bar Helper
  const strengthBarWidth = $derived((passwordStrength.score / 4) * 100);
</script>

{#if show}
  <div
    class="modal-overlay dark change-password-modal-wrapper"
    role="presentation"
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      onkeydown={handleKeydown}
    >
      <div class="modal-header">
        <h3>Change Master Password</h3>
        <button onclick={handleCancel} class="close-btn"
          ><X class="w-5 h-5" /></button
        >
      </div>

      <div class="modal-body">
        {#if !hideModes}
          <!-- Mode Selection -->
          <div class="mode-selection">
            <label class="mode-option" class:selected={mode === "reencrypt"}>
              <input type="radio" value="reencrypt" bind:group={mode} />
              <div class="mode-info">
                <span class="mode-title">
                  <ShieldCheck class="w-4 h-4" />
                  Valid Change (Recommended)
                </span>
                <p class="mode-desc">
                  Decrypts existing data using old password and re-encrypts with
                  new password. No data loss.
                </p>
              </div>
            </label>

            <label class="mode-option" class:selected={mode === "reset"}>
              <input type="radio" value="reset" bind:group={mode} />
              <div class="mode-info">
                <span class="mode-title">
                  <Trash2 class="w-4 h-4" />
                  Reset Password
                </span>
                <p class="mode-desc">
                  Deletes all synced items from server. Use this if you forgot
                  your old password.
                </p>
              </div>
            </label>
          </div>

          <hr class="separator" />
        {/if}

        <!-- Inputs -->
        {#if !hideModes && mode === "reencrypt"}
          <div class="form-group">
            <label for="current-password">Current Password</label>
            <div class="relative">
              <input
                bind:this={currentPasswordInputRef}
                bind:value={currentPassword}
                type={showPassword ? "text" : "password"}
                id="current-password"
                class="input"
                placeholder="Enter current master password"
                disabled={loading}
              />
            </div>
          </div>
        {/if}

        <div class="form-group">
          <label for="new-password">New Password</label>
          <div class="relative">
            <input
              bind:this={newPasswordInputRef}
              bind:value={newPassword}
              type={showPassword ? "text" : "password"}
              id="new-password"
              class="input"
              placeholder="Enter new master password"
              disabled={loading}
            />
            <button
              onclick={toggleShowPassword}
              class="password-toggle-btn"
              type="button"
            >
              {#if showPassword}<EyeOff class="w-4 h-4" />{:else}<Eye
                  class="w-4 h-4"
                />{/if}
            </button>
          </div>

          <!-- Strength Meter -->
          {#if newPassword}
            <div class="password-strength-container">
              <div class="strength-bar-bg">
                <div
                  class="strength-bar {strengthColorClass}"
                  style="width: {strengthBarWidth}%"
                ></div>
              </div>
              <span class="strength-text {strengthColorClass}"
                >{strengthText}</span
              >
            </div>
            {#if passwordStrength.feedback.length > 0}
              <ul class="feedback-list">
                {#each passwordStrength.feedback as tip}<li>{tip}</li>{/each}
              </ul>
            {/if}
          {/if}
        </div>

        <div class="form-group">
          <label for="confirm-password">Confirm New Password</label>
          <input
            bind:value={confirmPassword}
            type={showPassword ? "text" : "password"}
            id="confirm-password"
            class="input"
            placeholder="Confirm new master password"
            disabled={loading}
          />
        </div>

        {#if !hideModes && mode === "reset"}
          <div class="warning-box">
            <strong>Warning:</strong> Resetting will permanently delete all your currently
            synced items on the server because they cannot be decrypted without the
            old password.
          </div>
        {/if}

        {#if error}
          <div class="error-message">{error}</div>
        {/if}
      </div>

      <div class="modal-footer">
        <button onclick={handleCancel} class="btn btn-secondary" type="button"
          >Cancel</button
        >
        <button
          onclick={handleSubmit}
          disabled={!canSubmit || loading}
          class="btn btn-primary"
          type="button"
        >
          {loading
            ? "Processing..."
            : hideModes
              ? "Set Password"
              : mode === "reencrypt"
                ? "Change & Re-encrypt"
                : "Reset & Delete Data"}
        </button>
      </div>
    </div>
  </div>
{/if}
