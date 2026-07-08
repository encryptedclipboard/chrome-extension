<script lang="ts">
  import { X, Crown } from "lucide-svelte";
  import { API_CONFIG } from "@config/index";
  import { upgradeModalStore } from "@/stores/upgrade-modal.svelte";
  import { onMount, onDestroy } from "svelte";
  import "@/styles/components/upgrade-modal.scss";

  // Template refs for accessibility and focus management
  let overlayRef = $state<HTMLElement>();
  let modalRef = $state<HTMLElement>();
  let closeBtnRef = $state<HTMLButtonElement>();
  let cancelBtnRef = $state<HTMLButtonElement>();
  let upgradeBtnRef = $state<HTMLButtonElement>();

  // Focus trap and keyboard handling
  function handleTabKey(event: KeyboardEvent) {
    if (!upgradeModalStore.isOpen) return;

    const focusableElements = [closeBtnRef, cancelBtnRef, upgradeBtnRef].filter(
      Boolean,
    );
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.key === "Tab") {
      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      upgradeModalStore.close();
    }
  }

  const focusFirst = async () => {
    await Promise.resolve();
    closeBtnRef?.focus();
  };

  $effect(() => {
    if (upgradeModalStore.isOpen) {
      focusFirst();
    }
  });

  onMount(() => {
    document.addEventListener("keydown", handleTabKey);
  });
  onDestroy(() => {
    document.removeEventListener("keydown", handleTabKey);
  });

  const handleUpgrade = () => {
    const dashboardUrl = API_CONFIG.DASHBOARD_URL;
    const subscriptionUrl = dashboardUrl.endsWith("/dashboard")
      ? dashboardUrl.replace("/dashboard", "/subscription")
      : dashboardUrl + "/subscription";
    window.open(subscriptionUrl, "_blank");
    upgradeModalStore.close();
  };

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      upgradeModalStore.close();
    }
  };
</script>

{#if upgradeModalStore.isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-overlay dark"
    bind:this={overlayRef}
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="modal-content" role="document" bind:this={modalRef}>
      <button
        type="button"
        class="close-btn"
        onclick={(e) => {
          e.stopPropagation();
          upgradeModalStore.close();
        }}
        aria-label="Close"
        bind:this={closeBtnRef}
      >
        <X class="icon" />
      </button>

      <div class="modal-header">
        <div class="icon-wrapper">
          <Crown class="crown-icon" />
        </div>
        <h2>{upgradeModalStore.title}</h2>
      </div>

      <div class="modal-body">
        <p class="description">
          <!-- <Zap class="inline-icon" /> -->
          {#if upgradeModalStore.description}
            {upgradeModalStore.description}
          {:else}
            <strong>{upgradeModalStore.featureName}</strong> is a premium feature
            available to paid users.
          {/if}
        </p>
        <p class="sub-description">
          {upgradeModalStore.subDescription}
        </p>
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="cancel-btn"
          onclick={(e) => {
            e.stopPropagation();
            upgradeModalStore.close();
          }}
          bind:this={cancelBtnRef}
        >
          Maybe Later
        </button>
        <button
          type="button"
          class="upgrade-btn"
          onclick={(e) => {
            e.stopPropagation();
            handleUpgrade();
          }}
          bind:this={upgradeBtnRef}
        >
          <Crown class="icon" />
          See Available Plans
        </button>
      </div>
    </div>
  </div>
{/if}
