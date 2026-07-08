<script lang="ts">
  import { onMount } from "svelte";
  import { Toaster } from "svelte-sonner";
  import SidebarHeader from "@/components/SidebarHeader.svelte";
  import HomePage from "@/components/HomePage.svelte";
  import SettingsPage from "@/components/SettingsPage.svelte";
  import ProfilePage from "@/components/ProfilePage.svelte";
  import UpgradeModal from "@/components/UpgradeModal.svelte";
  import LockScreen from "@/components/LockScreen.svelte";
  import SubscriptionRequired from "@/components/SubscriptionRequired.svelte";
  import AuthModal from "@/components/AuthModal.svelte";
  import SnippetsPage from "@/components/SnippetsPage.svelte";

  import OfflineBanner from "@/components/OfflineBanner.svelte";
  import PushWarningBanner from "@/components/PushWarningBanner.svelte";
  import AuthErrorBanner from "@/components/AuthErrorBanner.svelte";
  import SyncProgress from "@/components/SyncProgress.svelte"; // Global Modal
  import LockProgress from "@/components/LockProgress.svelte"; // Global Modal
  import RatingModal from "@/components/RatingModal.svelte"; // Global Modal

  import { syncModalStore } from "@/stores/sync.modal.svelte";
  import { lockProgressStore } from "@/stores/lock-progress.svelte";
  import { authModalStore } from "@/stores/auth-modal.svelte";
  import { mpcStore } from "@/stores/mpc.svelte";
  import { mpcService, MPCPhase } from "@shared/services/mpc.service";
  import { SyncStage } from "@shared/enums";
  import MPCScreen from "@/components/MPCScreen.svelte";

  import { authStore } from "@/stores/auth.svelte";
  import { themeStore } from "@/stores/theme.svelte";
  import { navigationStore } from "@/stores/navigation.svelte";
  import { lockStore } from "@/stores/lock.svelte";
  import { ratingModalStore } from "@/stores/rating-modal.svelte";
  import {
    storageService,
    lockService,
    clipboardDBService,
    ratingService,
  } from "@shared/services";
  import { MasterPassUtils } from "@shared/utils/master-pass.utils";
  import { UI_CONFIG } from "@config/index";
  import { PageType } from "@/types";
  import { MessageType } from "@shared/types/message.types";
  import {
    sendUpdateBadge,
    sendUnlocked,
    sendCheckAuthValidity,
    sendClipboardActivity,
    sendGetSyncStatus,
  } from "@shared/utils/message.utils";
  // fallback to relative path if alias fails in sidebar scope
  import { PlanAbility } from "@shared/enums/plan-ability.enum";
  import "@/styles/components/app.scss";

  import { toast } from "svelte-sonner";
  import { ClipboardItemType } from "@shared/enums";
  import {
    getFileTypeFromExtension,
    readFileContent,
  } from "@shared/utils/file-type.util";

  let isLoggingIn = $state(false);

  // Drag and Drop State
  let isDragging = $state(false);
  let dragCounter = 0; // To handle nested elements triggering enter/leave events

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      isDragging = false;
    }
  }

  function disableContextMenu(e: Event) {
    e.preventDefault();
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
    dragCounter = 0;

    const items = e.dataTransfer?.items;
    if (!items) return;

    const files = e.dataTransfer?.files;

    // 1. Handle Files (Images + Text files)
    if (files && files.length > 0) {
      let processedFileCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.type.startsWith("image/")) {
          processedFileCount++;
          try {
            const reader = new FileReader();
            reader.onload = async (event) => {
              const base64 = event.target?.result as string;
              if (base64) {
                const newItem = await clipboardDBService.addItem(
                  ClipboardItemType.IMAGE,
                  base64,
                  {
                    sourceUrl: "Drag & Drop",
                    hostname: "Drag & Drop",
                    size: file.size,
                  },
                  base64,
                );

                window.dispatchEvent(
                  new CustomEvent("clipboard-item-added", {
                    detail: { itemId: newItem.id },
                  }),
                );

                sendUpdateBadge();
                toast.success("Image added to clipboard");
              }
            };
            reader.readAsDataURL(file);
          } catch (error) {
            console.error("Failed to process dropped image:", error);
            toast.error("Failed to add image");
          }
        } else {
          // Handle non-image text files (.txt, .json, .js, .csv, etc.)
          try {
            processedFileCount++;
            const content = await readFileContent(file);
            let type = getFileTypeFromExtension(file.name);
            let processedContent = content;

            // For JSON files, validate and format
            if (type === ClipboardItemType.JSON) {
              try {
                processedContent = JSON.stringify(JSON.parse(content), null, 2);
              } catch {
                type = ClipboardItemType.TEXT;
              }
            }

            const newItem = await clipboardDBService.addItem(
              type,
              processedContent,
              {
                sourceUrl: "Drag & Drop",
                hostname: "Drag & Drop",
                size: file.size,
              },
            );

            window.dispatchEvent(
              new CustomEvent("clipboard-item-added", {
                detail: { itemId: newItem.id },
              }),
            );

            sendUpdateBadge();
            toast.success(`Added ${file.name} as ${type.toUpperCase()}`);
          } catch (error: any) {
            processedFileCount++;
            console.error("Failed to process dropped file:", error);
            toast.error(error?.message || `Failed to process ${file.name}`);
          }
        }
      }

      if (processedFileCount > 0) return;
    }

    // 2. Handle Text
    const text = e.dataTransfer?.getData("text/plain");
    if (text) {
      try {
        // Check for duplicates first
        const existingItem = await clipboardDBService.findItemByContent(text);

        if (existingItem) {
          // If it exists, we might want to "bump" it or just notify
          // For now, let's just notify and not add duplicate
          toast("Item already exists in history", { duration: 2000 });
          return;
        }

        // Detect type (URL vs Text) - simple check
        let type = ClipboardItemType.TEXT;
        if (text.startsWith("http://") || text.startsWith("https://")) {
          type = ClipboardItemType.URL;
        }

        const newItem = await clipboardDBService.addItem(type, text, {
          sourceUrl: "Drag & Drop",
          hostname: "Drag & Drop",
        });

        // Notify sidebar about the new item to refresh the list (intra-sidebar event)
        window.dispatchEvent(
          new CustomEvent("clipboard-item-added", {
            detail: { itemId: newItem.id },
          }),
        );

        // Update badge count in background
        sendUpdateBadge();

        toast.success("Text added to clipboard");
      } catch (error) {
        console.error("Failed to process dropped text:", error);
        toast.error("Failed to add text");
      }
    }
  }

  async function handlePaste(e: ClipboardEvent) {
    // Only handle paste if the active element is NOT an input/textarea
    // to avoid interfering with normal typing
    const activeElement = document.activeElement as HTMLElement;
    if (
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable)
    ) {
      return;
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    // 1. Handle Images (Priority)
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault(); // Prevent default paste behavior
        const blob = item.getAsFile();
        if (blob) {
          try {
            const reader = new FileReader();
            reader.onload = async (event) => {
              const base64 = event.target?.result as string;
              if (base64) {
                const newItem = await clipboardDBService.addItem(
                  ClipboardItemType.IMAGE,
                  base64,
                  {
                    sourceUrl: "Paste",
                    hostname: "Sidebar Paste",
                    size: blob.size,
                  },
                  base64,
                );

                // Notify sidebar
                window.dispatchEvent(
                  new CustomEvent("clipboard-item-added", {
                    detail: { itemId: newItem.id },
                  }),
                );

                // Update badge
                sendUpdateBadge();

                toast.success("Image pasted to clipboard");
              }
            };
            reader.readAsDataURL(blob);
          } catch (error) {
            console.error("Failed to process pasted image:", error);
            toast.error("Failed to paste image");
          }
        }
        return; // Stop after processing image
      }
    }

    // 2. Handle Text
    const text = e.clipboardData?.getData("text/plain");
    if (text) {
      // Check monitoring setting
      const settings = await storageService.getSettings();
      const isMonitoringEnabled = settings?.monitoringEnabled ?? true;

      // If monitoring is ON, background/content script should handle it (unless we are in sidebar where content script might not run?)
      // Actually, sidebar is an extension page, content scripts don't run here.
      // BUT the user said "extension should only add it when the background monitoring is turned off".
      // This implies they expect the BACKGROUND monitoring to pick it up usually.
      // However, typical "background monitoring" listens to `navigator.clipboard` changes or content script events.
      // If the user pastes INSIDE the sidebar, the background might NOT see it automatically unless we explicitly send it.
      // BUT, checking the requirement: "if it's a text type item, then the extension should only add it when the background monitoring is turned off"
      // This means if monitoring is ON, we assume something else handles it OR we purely ignore it as per user request (maybe they don't want sidebar pastes to duplicate auto-captured ones?).
      // Let's strictly follow the rule: If monitoring ON -> Do nothing.

      if (isMonitoringEnabled) {
        return;
      }

      e.preventDefault(); // Prevent default

      try {
        // Check duplication
        const existingId = await clipboardDBService.findItemByContent(text);
        if (existingId) {
          toast.info("Item already exists in clipboard");
          return;
        }

        // Detect type
        let type = ClipboardItemType.TEXT;
        if (text.startsWith("http://") || text.startsWith("https://")) {
          type = ClipboardItemType.URL;
        }

        const newItem = await clipboardDBService.addItem(type, text, {
          sourceUrl: "Paste",
          hostname: "Sidebar Paste",
        });

        // Notify sidebar
        window.dispatchEvent(
          new CustomEvent("clipboard-item-added", {
            detail: { itemId: newItem.id },
          }),
        );

        // Update badge
        sendUpdateBadge();

        toast.success("Text pasted to clipboard");
      } catch (error) {
        console.error("Failed to process pasted text:", error);
        toast.error("Failed to paste text");
      }
    }
  }

  onMount(() => {
    // Check lock status with fallback verification
    lockService
      .getLockSettings()
      .then(async (settings) => {
        let isLocked = settings.isLocked;

        // Fallback: If lock flag is false/missing, verify by checking encrypted store
        if (!isLocked) {
          try {
            const encryptedCount = await lockService.getEncryptedItemCount();
            const mainItems = await clipboardDBService.getAllItems();

            // If encrypted store has items but main store is empty, we're locked
            if (encryptedCount > 0 && mainItems.length === 0) {
              console.warn(
                "[App] Lock state flag missing but encrypted items found. Restoring locked state.",
              );
              isLocked = true;
              // Restore the lock flag
              await storageService.set({ clipboardLocked: true });
            }
          } catch (error) {
            console.error("[App] Failed to verify lock state:", error);
          }
        }

        lockStore.setLocked(isLocked);
      })
      .catch((error) => {
        console.error("Failed to check lock status:", error);
      });

    // Check for interrupted master password change
    mpcStore.loadFromStorage();

    // Load persisted auth error
    storageService.get(["authError"]).then((data) => {
      if (data.authError) {
        authError = data.authError;
      }
    });

    // Ensure master password is loaded from storage (fixes password persistence issue)
    MasterPassUtils.ensurePasswordLoaded().catch((_) => {});

    // Check for Push Service Failure (Brave/GCM issue)
    storageService.get(["pushServiceFailure"]).then((data) => {
      if (data.pushServiceFailure) {
        pushServiceFailure = true;
      }
    });

    // Initialize auth from storage
    storageService
      .getAuthData()
      .then(async ({ authToken, user, subscription, planName }) => {
        if (authToken && user) {
          await authStore.setAuth(authToken, user);

          if (subscription) {
            await authStore.setSubscription(subscription, planName);
          }
          authStore.markAuthReady();

          // Asynchronously refresh subscription data independently
          setTimeout(() => {
            authStore.refreshSubscription();
          }, 500);
        } else {
          // [CLEANUP] If user is not logged in / auth data missing, ensure no items are stuck as "synced"
          clipboardDBService.demoteAllSyncedToLocal().catch((err) => {
            console.error("[App] Failed to demote orphaned synced items:", err);
          });
        }
      })
      .catch((error) => {
        console.error("Failed to load auth data:", error);
      });

    // Validating Auto-Sync Capability in UI context
    storageService.get(["clipboardAutoSync"]).then(async (settings) => {
      if (settings.clipboardAutoSync) {
        try {
          const { authToken, user, subscription } =
            await storageService.getAuthData();

          // If not logged in, auto-sync MUST be disabled
          if (!authToken || !user) {
            await storageService.set({ clipboardAutoSync: false });
            return;
          }

          // If logged in, check plan capability
          if (authToken && user) {
            const abilities = subscription?.planDetails?.abilities || [];

            if (!abilities.includes(PlanAbility.AUTO_SYNC)) {
              await storageService.set({ clipboardAutoSync: false });
            }
          }
        } catch (e) {
          // Ignore
        }
      }
    });

    // Initialize theme
    themeStore.initTheme();

    // Check if sync is already in progress in background
    sendGetSyncStatus().then((response) => {
      if (response?.isSyncing) {
        const total = response.totalCount || 0;
        if (total > 0) {
          const pct = Math.min(
            Math.round(((response.processedCount || 0) / total) * 100),
            100,
          );
          syncModalStore.show("auto");
          syncModalStore.updateProgress({
            stage: SyncStage.SYNCING,
            current: pct,
            total: 100,
            message: `Syncing ${pct}%`,
          });
        } else {
          syncModalStore.show("auto");
          syncModalStore.updateProgress({
            stage: SyncStage.SYNCING,
            current: 0,
            total: 1,
            message: "Syncing...",
          });
        }
      }
    });

    // Listen for lock/unlock and auth messages
    const messageListener = (message: any) => {
      // Use IIFE for any async logic inside
      (async () => {
        if (message.type === MessageType.CLIPBOARD_LOCKED) {
          lockStore.setLocked(true);
        } else if (message.type === MessageType.CLIPBOARD_UNLOCKED) {
          lockStore.setLocked(false);
        } else if (message.type === MessageType.AUTH_SUCCESS) {
          // If already authenticated, ignore the re-login attempt to prevent UI flicker
          if (authStore.isAuthenticated) {
            return;
          }

          // User logged in from web - show loading state
          isLoggingIn = true;
          authError = ""; // Clear any previous errors
          authModalStore.close(); // Close "Unlock Full Potential" modal if open

          // Refresh auth state
          try {
            const { authToken, user, subscription, planName } =
              await storageService.getAuthData();
            if (authToken && user) {
              await authStore.setAuth(authToken, user);
              if (subscription) {
                await authStore.setSubscription(subscription, planName);
              }
              authStore.markAuthReady();
            }
          } catch (error) {
            console.error("Failed to refresh auth after login:", error);
          } finally {
            // Small delay to ensure smooth transition
            setTimeout(() => {
              isLoggingIn = false;
            }, 500);

            // Clear persisted error
            storageService.set({ authError: null });
          }
        } else if (message.type === MessageType.AUTH_ERROR) {
          // Handle authentication error
          isLoggingIn = false;
          // The error will be passed to WelcomeScreen via prop if we store it
          // We need a local state for this
          if (message.payload) {
            authError = message.payload.isLimitError
              ? "You have reached the maximum number of browsers for your plan."
              : `Login failed: ${message.payload.error}`;

            storageService.set({ authError });
          }
        } else if (message.type === MessageType.LOGOUT) {
          // User logged out - clear state immediately
          // Call logout without await to ensure UI updates immediately
          authStore.logout(false); // Don't broadcast since we received it
          authError = "";
        } else if (message.type === MessageType.BS_SUBSCRIPTION_UPDATED) {
          // Subscription updated from background (via web hook)
          await authStore.refreshSubscription();
        } else if (
          message.type === MessageType.MPC_PROGRESS &&
          message.payload
        ) {
          const prevBg = mpcStore.backgroundMode;
          mpcStore.update(message.payload);
          // If transitioning to terminal state while in background mode, show overlay
          // Only un-minimize if user wasn't already minimized at terminal state
          if (
            prevBg &&
            (message.payload.phase === MPCPhase.COMPLETE ||
              message.payload.phase === MPCPhase.ERROR)
          ) {
            if (!mpcStore.wasMinimizedAtTerminal) {
              mpcStore.setBackgroundMode(false);
              mpcService.setBackgroundMode(false);
            }
          }
        } else if (
          message.type === MessageType.SYNC_PROGRESS &&
          message.syncProgress
        ) {
          if (mpcStore.inProgress) {
            mpcStore.updateSyncProgress(
              message.syncProgress.stage,
              message.syncProgress.current,
              message.syncProgress.total,
              message.syncProgress.message,
            );
          } else {
            syncModalStore.updateProgress(message.syncProgress);
          }
        } else if (
          message.type === MessageType.LOCK_PROGRESS &&
          message.payload
        ) {
          lockProgressStore.updateProgress(message.payload);
        } else if (message.type === MessageType.PUSH_SERVICE_FAILURE) {
          pushServiceFailure = true;
        } else if (message.type === MessageType.SHOW_TOAST && message.payload) {
          const { message: toastMessage, type = "info" } = message.payload;
          if (type === "success") {
            toast.success(toastMessage);
          } else if (type === "error") {
            toast.error(toastMessage);
          } else if (type === "warning") {
            toast.warning(toastMessage);
          } else {
            toast.info(toastMessage);
          }
        }
      })();

      return false; // Explicitly return false to let other listeners handle it
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Silent Auth Check (Async)
    // Runs every time sidebar opens to verify token validity
    if (navigator.onLine) {
      storageService
        .getAuthData()
        .then((data) => {
          if (data.authToken && data.user) {
            sendCheckAuthValidity();
          }
        })
        .catch(() => {});
    }

    // Check if we should show the rating modal (with 5s delay)
    setTimeout(() => {
      ratingService.shouldShowRatingModal().then((show) => {
        if (show) {
          ratingModalStore.open();
        }
      });
    }, 10000);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  });

  async function handleUnlock() {
    lockStore.setLocked(false);
    // Notify background
    sendUnlocked();
  }

  // State for auth error
  let authError = $state("");
  let isOnline = $state(navigator.onLine);
  let isBannerDismissed = $state(false);
  let pushServiceFailure = $state(false);

  function handleDismissBanner() {
    isBannerDismissed = true;
  }

  $effect(() => {
    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      isOnline = online;
      if (online) {
        // Reset dismissal when connection is restored
        isBannerDismissed = false;
      }
    };
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  });

  $effect(() => {
    if (themeStore.isDark) {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  });

  // Track Inactivity
  let lastActivityTime = 0;
  const ACTIVITY_THROTTLE = 10000; // 10 seconds

  const reportActivity = () => {
    const now = Date.now();
    if (now - lastActivityTime > ACTIVITY_THROTTLE) {
      lastActivityTime = now;
      sendClipboardActivity();
    }
  };

  $effect(() => {
    // Initial activity on mount
    reportActivity();

    // Listeners for user activity
    window.addEventListener("mousemove", reportActivity);
    window.addEventListener("keydown", reportActivity);
    window.addEventListener("click", reportActivity);

    return () => {
      window.removeEventListener("mousemove", reportActivity);
      window.removeEventListener("keydown", reportActivity);
      window.removeEventListener("click", reportActivity);
    };
  });
</script>

{#if authStore.logoutInProgress}
  <!-- Full Screen Preloader during logout -->
  <div class="fullscreen-preloader" class:dark={themeStore.isDark}>
    <div class="preloader-content">
      <svg
        class="spinner-icon"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <p>Logging out...</p>
    </div>
  </div>
{:else if isLoggingIn}
  <!-- Full Screen Preloader during login -->
  <div class="fullscreen-preloader" class:dark={themeStore.isDark}>
    <div class="preloader-content">
      <svg
        class="spinner-icon"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <p>Signing you in...</p>
    </div>
  </div>
{:else if !authStore.isAuthenticated && !authStore.isGuest}
  <!-- This state should technically not be reached with guest mode default, but keeping safe fallback -->
  <div class="loading-state">Initializing...</div>
{:else if !authStore.isGuest && authStore.isAuthenticated && isOnline && !authStore.hasActiveSubscription}
  <!-- Inactive Subscription Guard - Only show if logged in, online, and inactive -->
  <SubscriptionRequired />
{:else}
  {#if !mpcStore.isInitialized}
    <div class="loading-container">Loading...</div>
  {:else if mpcStore.inProgress && !mpcStore.backgroundMode}
    <MPCScreen />
  {:else}
    <!-- Normal App UI -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="app-container"
      class:dark={themeStore.isDark}
      oncontextmenu={disableContextMenu}
      role="application"
    >
      <!-- Header -->
      <SidebarHeader />

      {#if !isOnline && !isBannerDismissed}
        <OfflineBanner ondismiss={handleDismissBanner} />
      {/if}

      {#if authError}
        <AuthErrorBanner
          message={authError}
          ondismiss={() => {
            authError = "";
            storageService.set({ authError: null });
          }}
        />
      {/if}

      <!-- Main Content -->
      <main class="app-main">
        {#if navigationStore.currentPage === PageType.SNIPPETS}
          <SnippetsPage />
        {:else if navigationStore.currentPage === PageType.PROFILE}
          <ProfilePage />
        {:else if lockStore.isLocked}
          <div class:dark={themeStore.isDark}>
            <LockScreen onunlock={handleUnlock} />
          </div>
        {:else if navigationStore.currentPage === PageType.HOME}
          <HomePage />
        {:else if navigationStore.currentPage === PageType.SETTINGS}
          <SettingsPage />
        {/if}
      </main>

      <!-- Modals -->
      <UpgradeModal />

      <!-- Toast Notifications -->
      <Toaster
        richColors
        position={UI_CONFIG.TOAST.POSITION}
        theme={themeStore.isDark ? "dark" : "light"}
      />
    </div>

    <!-- Auth Modal (Global) -->
    <AuthModal />

    <!-- Sync Progress Modal (Global) -->
    <SyncProgress />

    <!-- Lock Progress Modal (Global) -->
    <LockProgress />

    <!-- Rating Modal (Global) -->
    <RatingModal />

    <!-- Drag & Drop Overlay -->
    {#if isDragging}
      <div
        class="drag-overlay"
        role="presentation"
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
      >
        <div class="drag-content">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
            ></path>
            <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
            <path d="M12 18v-6"></path>
            <path d="m9 15 3 3 3-3"></path>
          </svg>
          <h3>Drop to add to clipboard</h3>
        </div>
      </div>
    {/if}
  {/if}
{/if}

<svelte:window
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  onpaste={handlePaste}
/>
