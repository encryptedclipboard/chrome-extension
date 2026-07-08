<script lang="ts">
  import { authModalStore } from "@/stores/auth-modal.svelte";
  import { API_CONFIG } from "@config/index";
  import { X, LogIn, UserPlus } from "lucide-svelte";
  import "@/styles/components/auth-modal.scss";

  // Prevent scrolling when modal is open
  $effect(() => {
    if (authModalStore.isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  });

  async function handleSignIn() {
    try {
      authModalStore.close();
      await chrome.tabs?.create({
        url: API_CONFIG.LOGIN_URL,
      });
    } catch (error) {
      console.error("Failed to open login page:", error);
    }
  }

  async function handleCreateAccount() {
    try {
      authModalStore.close();
      await chrome.tabs?.create({
        url: `${API_CONFIG.BASE_URL.replace("/api", "")}/user/register`,
      });
    } catch (error) {
      console.error("Failed to open register page:", error);
    }
  }
</script>

{#if authModalStore.isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="auth-modal modal-overlay dark"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) authModalStore.close();
    }}
  >
    <div class="modal-content" role="document">
      <button
        class="close-btn"
        aria-label="Close"
        onclick={() => authModalStore.close()}
      >
        <X size={18} />
      </button>

      <div class="modal-header">
        <div class="logo-wrapper">
          <img
            alt="Logo"
            class="modal-logo"
            src="/assets/images/logo-dark.png"
          />
        </div>
        <h2>Unlock Full Potential</h2>
      </div>

      <div class="modal-body">
        <p class="description">
          Create an account to protect and sync your data.
        </p>

        <div class="features-list">
          <div class="feature-item">
            <div class="icon-wrapper">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                />
              </svg>
            </div>
            <div class="feature-text">
              <h3>Cloud Sync</h3>
              <p>Access your clipboard on any device</p>
            </div>
          </div>
          <div class="feature-item">
            <div class="icon-wrapper">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <div class="feature-text">
              <h3>Floating Window</h3>
              <p>Keep your clipboard always on top</p>
            </div>
          </div>
          <div class="feature-item">
            <div class="icon-wrapper">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div class="feature-text">
              <h3>Security Lock</h3>
              <p>Protect your data with PIN & encryption</p>
            </div>
          </div>
          <div class="feature-item">
            <div class="icon-wrapper">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <div class="feature-text">
              <h3>Image Clipboard</h3>
              <p>Copy and sync images across devices</p>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <div class="footer-actions">
          <button class="btn btn-secondary" onclick={handleSignIn}>
            <LogIn size={14} />
            Login
          </button>
          <button class="btn btn-primary" onclick={handleCreateAccount}>
            <UserPlus size={14} />
            Create Free Account
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
