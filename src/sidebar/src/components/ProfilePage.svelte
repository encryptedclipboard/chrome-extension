<script lang="ts">
  import {
    BarChart3,
    LogOut,
    Crown,
    ExternalLink,
    Calendar,
    Zap,
    History,
    HardDrive,
    Monitor,
    Activity,
  } from "lucide-svelte";
  import { navigationStore } from "../stores/navigation.svelte";
  import { authStore } from "../stores/auth.svelte";
  import { API_CONFIG, VERSION } from "@config/index";
  import "@/styles/components/profile-page.scss";
  import LogoutConfirmationModal from "./LogoutConfirmationModal.svelte";
  import {
    getFeaturesFromAbilities,
    formatFeature,
  } from "@shared/utils/plan.util";
  import {
    formatDate,
    formatRetention,
    formatStorage,
  } from "@shared/utils/format.util";

  function openDashboard() {
    chrome.tabs?.create({ url: API_CONFIG.DASHBOARD_URL });
  }

  let showLogoutModal = $state(false);

  async function handleLogoutConfirm(keepData: boolean) {
    await authStore.logout(true, keepData);
    navigationStore.goHome();
  }

  function handleLogoutClick() {
    showLogoutModal = true;
  }

  const subscriptionStatus = $derived(
    authStore.subscription?.status || "inactive",
  );
  const planDetails = $derived(authStore.subscription?.planDetails);
  const allFeatures = $derived(
    planDetails
      ? [
          ...getFeaturesFromAbilities(planDetails.abilities || []),
          ...(planDetails.features || []),
        ]
      : [],
  );

  const statusText = $derived(
    subscriptionStatus.charAt(0).toUpperCase() + subscriptionStatus.slice(1),
  );
</script>

<div class="page profile-page">
  <!-- Header moved to SidebarHeader -->

  <div class="page-content">
    {#if authStore.isAuthenticated}
      <!-- User Profile Section -->
      <div class="profile-card">
        <div class="profile-header">
          <div class="profile-avatar">
            {authStore.user?.name?.charAt(0) ||
              authStore.user?.email?.charAt(0) ||
              "?"}
          </div>
          <div class="profile-info">
            <h3 class="profile-name">
              {authStore.user?.name || "User"}
            </h3>
            <p class="profile-email">{authStore.user?.email || ""}</p>
          </div>
        </div>

        <div
          class="subscription-badge"
          class:active={authStore.hasActiveSubscription}
        >
          {#if authStore.isPaidUser}
            <Crown size={16} />
          {/if}
          <span class="status-dot"></span>
          {authStore.hasActiveSubscription ? authStore.planName : "Free Plan"}
        </div>
      </div>

      <!-- Actions - Persistent -->
      <div class="actions">
        <button onclick={openDashboard} class="btn btn-secondary">
          <BarChart3 size={16} />
          Dashboard
          <ExternalLink size={12} />
        </button>

        <button onclick={handleLogoutClick} class="btn btn-danger">
          <LogOut size={16} />
          Logout
        </button>
      </div>

      <!-- Subscription Details -->
      <div class="details-section">
        <h4 class="section-title">Subscription Details</h4>
        <div class="details-grid">
          <div class="detail-item">
            <div class="detail-label">
              <div class="icon-box"><Activity size={16} /></div>
              Status
            </div>
            <div class="detail-value status-{subscriptionStatus}">
              {statusText}
            </div>
          </div>
          {#if planDetails}
            <div class="detail-item">
              <div class="detail-label">
                <div class="icon-box"><Calendar size={16} /></div>
                Billing
              </div>
              <div class="detail-value">
                {formatDate(authStore.subscription?.endDate)}
              </div>
            </div>
            <div class="detail-item">
              <div class="detail-label">
                <div class="icon-box"><Zap size={16} /></div>
                Items
              </div>
              <div class="detail-value">
                {planDetails.maxClipboardItemsLimit === 0
                  ? "Unlimited"
                  : planDetails.maxClipboardItemsLimit.toLocaleString()}
              </div>
            </div>
            <div class="detail-item">
              <div class="detail-label">
                <div class="icon-box"><HardDrive size={16} /></div>
                Storage
              </div>
              <div class="detail-value">
                {formatStorage(planDetails.maxStorageBytes)}
              </div>
            </div>
            <div class="detail-item">
              <div class="detail-label">
                <div class="icon-box"><History size={16} /></div>
                Retention
              </div>
              <div class="detail-value">
                {formatRetention(planDetails.retentionMinutes)}
              </div>
            </div>
            <div class="detail-item">
              <div class="detail-label">
                <div class="icon-box"><Monitor size={16} /></div>
                Browsers
              </div>
              <div class="detail-value">
                {planDetails.maxBrowsers === 0
                  ? "Unlimited"
                  : planDetails.maxBrowsers}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Features Section -->
      {#if allFeatures.length > 0}
        <div class="features-section">
          <h4 class="section-title">Features Included</h4>
          <ul class="features-list">
            {#each allFeatures.slice(0, 10) as feature}
              <li class="feature-item">
                <span class="check">✓</span>
                <span class="feature-name">{formatFeature(feature)}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Version Info -->
      <div class="version-info">
        <small>Extension Version {VERSION}</small>
      </div>
    {:else}
      <!-- Not logged in -->
      <div class="not-logged-in">
        <div class="empty-state">
          <h3>Not Signed In</h3>
          <p>
            Sign in to sync your clipboard across devices and unlock premium
            features.
          </p>
          <button onclick={openDashboard} class="btn btn-primary">
            Sign In
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<LogoutConfirmationModal
  bind:show={showLogoutModal}
  onConfirm={handleLogoutConfirm}
/>
