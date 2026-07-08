<script lang="ts">
  import { X, Crown, Check, ExternalLink } from "lucide-svelte";
  import { authStore } from "../stores/auth.svelte";
  import {
    getFeaturesFromAbilities,
    formatFeature,
  } from "@shared/utils/plan.util";
  import { API_CONFIG } from "@config/index";
  import { onMount, onDestroy } from "svelte";
  import "@/styles/components/plan-details-modal.scss";

  let { show = $bindable(), close } = $props<{
    show: boolean;
    close?: () => void;
  }>();

  function handleClose() {
    show = false;
    if (close) close();
  }

  let overlayRef = $state<HTMLElement>();
  let modalRef = $state<HTMLElement>();

  const currentPlan = $derived(authStore.subscription?.planDetails);

  const features = $derived.by(() => {
    if (!currentPlan) return [];

    const generated = getFeaturesFromAbilities(currentPlan.abilities || []).map(
      formatFeature,
    );
    const manual = (currentPlan.features || []).map(formatFeature);
    const unique = new Set([...generated, ...manual]);

    // Semantic Deduplication
    if (unique.has("Cloud Sync (Encrypted)")) unique.delete("Cloud Sync");
    if (unique.has("Manual & Auto Sync")) unique.delete("Auto Sync");

    // Additional cleaning if needed

    return Array.from(unique);
  });

  const formattedStatus = $derived(
    authStore.subscription?.status
      ? authStore.subscription.status.charAt(0).toUpperCase() +
          authStore.subscription.status.slice(1)
      : "Active",
  );

  const planPrice = $derived(
    currentPlan?.price === 0
      ? "Free"
      : `${currentPlan?.currency} ${currentPlan?.price}/${currentPlan?.duration}`,
  );

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };

  const handleManage = () => {
    const dashboardUrl = API_CONFIG.DASHBOARD_URL;
    // Construct subscription URL safely
    const url = dashboardUrl.endsWith("/")
      ? `${dashboardUrl}subscription`
      : `${dashboardUrl}/subscription`;

    window.open(url, "_blank");
    handleClose();
  };

  onMount(() => {
    if (show) {
      document.addEventListener("keydown", handleKeydown);
    }
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeydown);
  });
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-overlay dark"
    bind:this={overlayRef}
    onclick={handleOverlayClick}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="modal-content" role="document" bind:this={modalRef}>
      <button
        type="button"
        class="close-btn"
        onclick={handleClose}
        aria-label="Close"
      >
        <X class="w-5 h-5" />
      </button>

      <div class="modal-header">
        <div class="plan-info">
          <Crown class="crown-icon" />
          <h2>{authStore.planName || "Current Plan"}</h2>
        </div>
        <div class="plan-meta">
          <span class="status-badge" class:active={formattedStatus === "Active"}
            >{formattedStatus}</span
          >
          <span class="separator">•</span>
          <span class="price">{planPrice}</span>
        </div>
      </div>

      <div class="modal-body">
        <div class="features-list">
          {#each features as feature}
            <div class="feature-item">
              <Check class="check-icon" />
              <span>{feature}</span>
            </div>
          {/each}

          {#if features.length === 0}
            <p class="text-muted text-center text-sm py-4">
              No specific features listed for this plan.
            </p>
          {/if}
        </div>
      </div>

      <div class="modal-footer">
        <button class="manage-btn" onclick={handleManage}>
          <ExternalLink class="icon" />
          Manage Subscription
        </button>
      </div>
    </div>
  </div>
{/if}
