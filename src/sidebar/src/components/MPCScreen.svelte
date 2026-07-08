<script lang="ts">
  import { onMount } from "svelte";
  import { Check, AlertCircle, RefreshCw, X, Lock } from "lucide-svelte";
  import { mpcStore } from "@/stores/mpc.svelte";
  import { StepStatus } from "@shared/enums";
  import { mpcService, MPCPhase } from "@shared/services/mpc.service";
  import { MessageType } from "@shared/types";
  import { sendMpcStart } from "@shared/utils/message.utils";
  import Spinner from "./Spinner.svelte";
  import ChangePasswordModal from "./ChangePasswordModal.svelte";
  import type { MPCStepState } from "@shared/types/mpc-step-state.type";
  import { toast } from "svelte-sonner";

  let dismissVisible = $state(false);
  let showPasswordModal = $state(false);
  let retryLoading = $state(false);
  const logoUrl = chrome.runtime.getURL("assets/images/logo-dark.png");

  onMount(() => {
    const handler = (message: any) => {
      if (message.type === MessageType.MPC_PROGRESS && message.payload) {
        if (message.payload.phase === MPCPhase.COMPLETE) {
          dismissVisible = true;
        }
        if (message.payload.phase === MPCPhase.ERROR || message.payload.error) {
          dismissVisible = true;
        }
      }
    };
    chrome.runtime.onMessage.addListener(handler);

    if (mpcStore.currentPhase === MPCPhase.COMPLETE) {
      dismissVisible = true;
    }
    if (mpcStore.currentPhase === MPCPhase.ERROR || mpcStore.error) {
      dismissVisible = true;
    }

    return () => chrome.runtime.onMessage.removeListener(handler);
  });

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const time = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (isToday) return time;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
  }

  function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return totalSec + "s";
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min < 60) return min + "m " + sec + "s";
    const hours = Math.floor(min / 60);
    const remMin = min % 60;
    return hours + "h " + remMin + "m " + sec + "s";
  }

  async function handleDismiss() {
    await mpcService.clearProgress();
    mpcService.clearRetryPassword();
    mpcStore.reset();
  }

  const failedStepError = $derived(
    mpcStore.steps.find((s) => s.status === "error")?.error,
  );

  async function handleRetry() {
    mpcStore.clearError();
    sendMpcStart({ newPassword: "" }).catch(() => {});
  }

  async function handleRetryWithPassword(password: string) {
    retryLoading = true;
    mpcStore.clearError();
    mpcService.setRetryPassword(password);
    await sendMpcStart({ newPassword: password });
    retryLoading = false;
  }

  const needsNewPassword = $derived(
    mpcStore.steps.some(
      (s: MPCStepState) =>
        s.status === "error" &&
        s.retryable &&
        s.phase === MPCPhase.CHANGING_PASSWORD,
    ),
  );

  const cloudCleared = $derived(
    mpcStore.steps.some(
      (s) => s.phase === MPCPhase.DELETING_CLOUD && s.status === "done",
    ),
  );

  const hasRetryableError = $derived(
    mpcStore.steps.some(
      (s: MPCStepState) => s.status === "error" && s.retryable,
    ),
  );

  const isComplete = $derived(mpcStore.currentPhase === MPCPhase.COMPLETE);
  const isActive = $derived(
    mpcStore.currentPhase !== MPCPhase.IDLE &&
      mpcStore.currentPhase !== MPCPhase.COMPLETE &&
      mpcStore.currentPhase !== MPCPhase.ERROR,
  );

  async function handleRunInBackground() {
    await mpcService.setBackgroundMode(true);
    mpcStore.setBackgroundMode(true);
  }
</script>

<div class="mpc-overlay">
  <div class="mpc-container">
    <img src={logoUrl} alt="Clipboard" class="mpc-logo" />
    <h1 class="mpc-title">Change Master Password</h1>

    {#if failedStepError}
      <div class="mpc-error-box">{failedStepError}</div>
    {/if}

    <div class="mpc-timeline">
      {#each mpcStore.steps as step, i (step.phase)}
        <div
          class="mpc-step"
          class:pending={step.status === "pending"}
          class:active={step.status === "active"}
          class:done={step.status === "done"}
          class:error={step.status === "error"}
        >
          <div class="mpc-step-icon-col">
            <div
              class="mpc-step-icon"
              class:error-icon={step.status === "error"}
              class:active-icon={step.status === "active"}
              class:done-icon={step.status === "done"}
            >
              {#if step.status === "active"}
                <span class="icon-center"><Spinner size={24} /></span>
              {:else if step.status === "done"}
                <Check size={24} />
              {:else if step.status === "error"}
                <AlertCircle size={24} />
              {:else}
                <div class="pending-dot"></div>
              {/if}
            </div>
          </div>

          <div class="mpc-step-content">
            <div class="mpc-step-header">
              <span class="mpc-step-label">{step.label}</span>
              {#if (step.status === "done" || step.status === "error") && step.completedAt}
                <span class="mpc-step-badge"
                  >{formatTime(step.completedAt)}</span
                >
              {/if}
            </div>
            {#if step.status === "active" && [MPCPhase.DOWNLOADING, MPCPhase.UPLOADING].includes(step.phase)}
              <span class="mpc-step-message">{step.message}</span>
              <div class="mpc-progress-bar-bg">
                <div
                  class="mpc-progress-bar-fill"
                  style="width: {step.progress}%"
                ></div>
              </div>
            {:else if step.status === "active" || (step.status === "done" && step.message)}
              <span class="mpc-step-message">{step.message}</span>
              {#if step.status === "done" && [MPCPhase.UPLOADING, MPCPhase.DOWNLOADING].includes(step.phase) && step.durationMs !== undefined}
                <span class="mpc-step-duration"
                  >{formatDuration(step.durationMs)}</span
                >
              {/if}
            {:else if step.status === "error" && (step.error || step.message)}
              <span class="mpc-step-message">{step.error || step.message}</span>
            {:else if step.status === "pending"}
              <span class="mpc-step-message"
                >{step.message || "Waiting..."}</span
              >
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if !isComplete}
      <button class="mpc-bg-btn" onclick={handleRunInBackground}>
        {isActive ? "Run in background" : "Minimize"}
      </button>
    {/if}

    {#if isComplete && dismissVisible}
      <button class="mpc-btn mpc-btn-primary" onclick={handleDismiss}>
        <Check size={16} />
        Done
      </button>
    {/if}

    {#if dismissVisible && mpcStore.steps.some((s: MPCStepState) => s.status === "error")}
      <div class="mpc-actions">
        {#if !cloudCleared}
          <button class="mpc-btn mpc-btn-secondary" onclick={handleDismiss}>
            <X size={16} />
            Dismiss
          </button>
        {/if}
        {#if hasRetryableError}
          {#if needsNewPassword}
            <button
              class="mpc-btn mpc-btn-primary"
              onclick={() => (showPasswordModal = true)}
            >
              <Lock size={16} />
              Set New Password
            </button>
          {:else}
            <button class="mpc-btn mpc-btn-primary" onclick={handleRetry}>
              <RefreshCw size={16} />
              Retry
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

<ChangePasswordModal
  show={showPasswordModal}
  loading={retryLoading}
  hideModes={true}
  onCancel={() => (showPasswordModal = false)}
  onSubmit={(data) => {
    if (!data.newPassword) {
      toast.error("New password is required!");
      return;
    }

    showPasswordModal = false;

    handleRetryWithPassword(data.newPassword);
  }}
/>

<style lang="scss">
  @use "../styles/components/mpc-screen.scss" as *;
</style>
