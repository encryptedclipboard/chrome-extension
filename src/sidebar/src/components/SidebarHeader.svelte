<script lang="ts">
  import {
    Crown,
    Settings,
    User,
    ChevronLeft,
    ExternalLink,
    AlertTriangle,
    Keyboard,
  } from "lucide-svelte";
  import { onMount } from "svelte";
  import { authStore } from "../stores/auth.svelte";
  import { navigationStore } from "../stores/navigation.svelte";
  import { isFloatingStore } from "../stores/ui.svelte";
  import { lockStore } from "../stores/lock.svelte";
  import { PageType } from "@/types";
  import { API_CONFIG } from "@config/index";

  import { PlanAbility } from "@shared/enums";
  import { upgradeModalStore } from "../stores/upgrade-modal.svelte";
  import { authModalStore } from "../stores/auth-modal.svelte";
  import { clipboardItemLockService } from "@shared/services";
  import { StorageUtil } from "@shared/utils/extension-storage.util";
  import { sendOpenWindow } from "@shared/utils/message.utils";
  import "@/styles/components/sidebar-header.scss";

  function openFloatingWindow() {
    if (authStore.isGuest) {
      authModalStore.open();
      return;
    }

    if (!authStore.hasAbility(PlanAbility.FLOATING_WINDOW)) {
      upgradeModalStore.open({
        featureName: "Floating Window",
        title: "Premium Feature",
        description:
          "Keep your clipboard always on top with the floating window. Upgrade to any paid plan to unlock this feature.",
      });
      return;
    }

    sendOpenWindow();
  }

  // Logo URL
  const logoUrl = $derived(
    chrome.runtime.getURL("assets/images/logo-dark.png"),
  );

  import PlanDetailsModal from "./PlanDetailsModal.svelte";

  // Check if we need back button (not on home page)
  const showBackButton = $derived(
    navigationStore.currentPage !== PageType.HOME,
  );

  // Check if buttons should be disabled based on current page
  const isSettingsPage = $derived(
    navigationStore.currentPage === PageType.SETTINGS,
  );

  const isProfilePage = $derived(
    navigationStore.currentPage === PageType.PROFILE,
  );

  const isSnippetsPage = $derived(
    navigationStore.currentPage === PageType.SNIPPETS,
  );

  let showPlanDetails = $state(false);
  let isFloating = $state(false);
  let isFloatingWindowOpen = $state(false);

  // Check if floating window is actually open by validating against chrome.windows
  async function checkFloatingWindowState(): Promise<boolean> {
    const floatingWindowId = await StorageUtil.getFloatingWindowId();

    if (!floatingWindowId) {
      await clipboardItemLockService.setFloatingWindowOpen(false);
      return false;
    }

    // Validate that the window still exists
    try {
      const window = await chrome.windows.get(floatingWindowId);
      if (window && window.id) {
        return true;
      }
    } catch (_) {}

    // Clear stale state
    await clipboardItemLockService.setFloatingWindowOpen(false);
    await StorageUtil.removeFloatingWindowId();
    return false;
  }

  const refreshFloatingState = async () => {
    isFloatingWindowOpen = await checkFloatingWindowState();
  };

  onMount(() => {
    // Check if we're in a floating window
    if (typeof chrome !== "undefined" && chrome.windows) {
      chrome.windows.getCurrent((win) => {
        if (win.type === "popup") {
          isFloating = true;
          isFloatingStore.set(true);
        } else {
          isFloatingStore.set(false);
        }
      });
    }

    // Initial check
    checkFloatingWindowState().then((state) => {
      isFloatingWindowOpen = state;
    });

    // Listen for storage changes (real-time update for floating window state)
    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      // Session storage for floating window state
      if (areaName === "session" && changes.floatingWindowOpen) {
        isFloatingWindowOpen = !!changes.floatingWindowOpen.newValue;
      }

      // Local storage for floatingWindowId - handles both open and close
      if (areaName === "local" && "floatingWindowId" in changes) {
        const newValue = changes.floatingWindowId.newValue;
        isFloatingWindowOpen = !!newValue;
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    window.addEventListener("focus", refreshFloatingState);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshFloatingState();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
      window.removeEventListener("focus", refreshFloatingState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  });
</script>

{#if !isFloating}
  <div class="sidebar-header">
    <div class="header-top">
      {#if showBackButton}
        <button
          onclick={() => navigationStore.goHome()}
          class="back-btn"
          title="Go back"
        >
          <ChevronLeft class="w-4 h-4" />
        </button>
      {/if}

      <div class="logo-container">
        {#if isSettingsPage}
          <h2 class="page-title">Settings</h2>
        {:else if isProfilePage}
          <h2 class="page-title">Profile</h2>
        {:else}
          <img
            src={logoUrl}
            alt="Encrypted Clipboard Manager"
            class="header-logo"
          />
          <img
            src={chrome.runtime.getURL("assets/icons/icon.png")}
            alt="ECM"
            class="header-icon"
          />
        {/if}
      </div>

      {#if authStore.isPaidUser}
        <button
          type="button"
          class="premium-badge"
          onclick={() => {
            if (!isFloating) showPlanDetails = true;
          }}
          title="PRO"
        >
          <Crown size={14} />
        </button>
      {/if}

      <div class="header-actions">
        {#if !isFloating}
          <button
            onclick={openFloatingWindow}
            class="icon-btn open-in-window-btn"
            class:open={isFloatingWindowOpen}
            title="Open in floating window"
          >
            <ExternalLink class="w-4 h-4" />
          </button>
        {/if}
        {#if !isFloating}
          <button
            onclick={() => navigationStore.goToSnippets()}
            class="icon-btn"
            title="Snippets"
            disabled={isSnippetsPage}
          >
            <Keyboard class="w-4 h-4" />
          </button>
        {/if}
        {#if !lockStore.isLocked && (!isFloating || authStore.hasAbility(PlanAbility.IMAGE_SUPPORT))}
          <button
            onclick={() => navigationStore.goToSettings()}
            class="icon-btn"
            title="Settings"
            disabled={isSettingsPage}
          >
            <Settings class="w-4 h-4" />
          </button>
        {/if}
        {#if !isFloating || authStore.hasAbility(PlanAbility.IMAGE_SUPPORT)}
          <button
            onclick={() => {
              if (authStore.isGuest) {
                authModalStore.open();
              } else {
                navigationStore.goToProfile();
              }
            }}
            class="icon-btn profile-btn"
            title={authStore.isGuest ? "Sign In" : "Profile"}
            disabled={isProfilePage}
          >
            {#if authStore.isAuthenticated}
              <span class="user-avatar">
                {authStore.user?.name?.charAt(0) ||
                  authStore.user?.email?.charAt(0) ||
                  "?"}
              </span>
            {:else}
              <User class="w-4 h-4" />
            {/if}
          </button>
        {/if}
      </div>
    </div>

    {#if authStore.isAuthenticated && !authStore.user?.emailVerifiedAt}
      <!-- Verification Warning -->
      <div
        class="verification-banner"
        onclick={() =>
          window.open(API_CONFIG.BASE_URL + "/verify-email", "_blank")}
        role="button"
        tabindex="0"
        onkeydown={(e) => {
          if (e.key === "Enter")
            window.open(API_CONFIG.BASE_URL + "/verify-email", "_blank");
        }}
      >
        <AlertTriangle class="w-3 h-3" />
        <span>Verify your email to unlock all features</span>
      </div>
    {/if}
  </div>
{/if}

<PlanDetailsModal bind:show={showPlanDetails} />
