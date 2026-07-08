<script lang="ts">
  import { themeStore } from "@/stores/theme.svelte";
  import { authStore } from "@/stores/auth.svelte";
  import { API_CONFIG } from "@config/index";
  import {
    RefreshCw,
    LayoutDashboard,
    LogOut,
    ShieldAlert,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import "@/styles/components/subscription-required.scss";

  let isRefreshing = $state(false);

  async function handleUpgrade() {
    try {
      await chrome.tabs?.create({
        url: `${new URL(API_CONFIG.DASHBOARD_URL).origin}/dashboard/user/subscription`,
      });
    } catch (error) {
      console.error("Failed to open dashboard:", error);
    }
  }

  async function handleRefresh() {
    if (isRefreshing) return;
    isRefreshing = true;
    try {
      await authStore.refreshSubscription();
      toast.success("Subscription status refreshed");
    } catch (e) {
      toast.error("Failed to refresh status");
    } finally {
      setTimeout(() => {
        isRefreshing = false;
      }, 500);
    }
  }

  async function handleLogout() {
    await authStore.logout();
  }
</script>

<div
  class="subscription-required-screen subscription-required-wrapper"
  class:dark={themeStore.isDark}
>
  <div class="content-wrapper">
    <!-- Icon -->
    <div class="icon-container">
      <ShieldAlert class="w-16 h-16 text-danger" />
    </div>

    <!-- Title & Description -->
    <h1 class="title">Active Subscription Required</h1>
    <p class="description">
      Your subscription has expired or is inactive. To continue securing your
      clipboard history with end-to-end encryption, please upgrade your plan.
    </p>

    <!-- Current Plan Status (if known) -->
    {#if authStore.subscription}
      <div class="status-badge">
        Status: <span class="capitalize"
          >{authStore.subscription.status || "Inactive"}</span
        >
      </div>
    {/if}

    <!-- Actions -->
    <div class="actions">
      <button class="btn btn-primary" onclick={handleUpgrade}>
        <LayoutDashboard class="w-4 h-4" />
        <span>Manage Subscription</span>
      </button>

      <div class="secondary-actions">
        <button
          class="btn btn-secondary"
          onclick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw class="w-4 h-4 {isRefreshing ? 'animate-spin' : ''}" />
          <span>Refresh Status</span>
        </button>

        <button class="btn btn-danger" onclick={handleLogout}>
          <LogOut class="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  </div>
</div>
