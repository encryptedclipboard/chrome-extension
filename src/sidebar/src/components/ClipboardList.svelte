<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import {
    Search,
    Trash2,
    Inbox,
    X,
    Filter,
    SquareCheck,
    CloudOff,
    RefreshCw,
    Plus,
    Lock,
  } from "lucide-svelte";

  import ClipboardItem from "./ClipboardItem.svelte";
  import Spinner from "./Spinner.svelte";
  import EditClipboardModal from "./EditClipboardModal.svelte";
  import ViewClipboardModal from "./ViewClipboardModal.svelte";
  import AddClipboardModal from "./AddClipboardModal.svelte";
  import ShareItemModal from "./ShareItemModal.svelte";
  import ConfirmModal from "./ConfirmModal.svelte";
  import DeleteConfirmModal from "./DeleteConfirmModal.svelte";
  import E2EPasswordModal from "./E2EPasswordModal.svelte";
  import FilterModal from "./FilterModal.svelte";
  import PinEntryModal from "./PinEntryModal.svelte";
  import PinSetupModal from "./PinSetupModal.svelte";
  import type { ClipboardItem as ClipboardItemType } from "@shared/services/clipboard-db.service";
  import { ClipboardItemType as ItemType } from "@shared/services/clipboard-db.service";
  import {
    clipboardDBService,
    syncService,
    localSettingsService,
    storageService,
    clipboardItemLockService,
    clipboardSyncQueueService,
    lockService,
  } from "@shared/services";
  import { MasterPassUtils } from "@shared/utils/master-pass.utils";
  import { slide, scale } from "svelte/transition";
  import { authStore, GUEST_PLAN } from "../stores/auth.svelte";
  import { upgradeModalStore } from "../stores/upgrade-modal.svelte";
  import { authModalStore } from "../stores/auth-modal.svelte";
  import { isFloatingStore } from "../stores/ui.svelte";
  import { lockStore } from "../stores/lock.svelte";
  import { PlanAbility } from "@shared/enums";
  import { syncModalStore } from "../stores/sync.modal.svelte";
  import "@/styles/components/clipboard-list.scss";
  import SyncDirectionModal from "./SyncDirectionModal.svelte";
  import Banner from "./Banner.svelte";
  import PushWarningBanner from "./PushWarningBanner.svelte";
  import { SyncStatus } from "@shared/enums/sync-status.enum";
  import { MessageType, SyncStage } from "@shared/types";
  import { LockOwner } from "@shared/types/session-storage.types";
  import {
    sendCheckUpdates,
    sendVerifyMasterPassword,
    sendVerifyCloudPassword,
    sendSetMasterPassword,
    sendUnsyncItem,
    sendUnsyncItems,
    sendSyncItem,
    sendManualSync,
    sendUpdateBadge,
    sendUpdated,
    sendSyncDeletion,
    sendLock,
    sendVerifyPin,
    sendLocked,
  } from "@shared/utils/message.utils";
  import { mpcService, MPCPhase } from "@shared/services/mpc.service";
  import { mpcStore } from "@/stores/mpc.svelte";
  import { getErrorMessage } from "../utils/error-handler.util";
  import type { KeyboardShortcut } from "@shared/types/shortcut.types";
  import {
    DEFAULT_FILTER_SHORTCUT,
    STORAGE_KEY_FILTER_SHORTCUT,
  } from "@shared/types/shortcut.types";

  let items = $state<ClipboardItemType[]>([]);
  let searchQuery = $state(
    localStorage.getItem("clipboard_search_query") || "",
  );
  const showFilters = $state(false);

  const activeFilterCount = $derived(() => {
    let count = 0;
    if (dateFrom || dateTo) count += 1;
    if (selectedTypes.size > 0) count += selectedTypes.size;
    if (showFavoritesOnly) count += 1;
    if (showSyncedOnly) count += 1;
    return count;
  });

  let isLoading = $state(false);
  let loadingType: "init" | "refresh" | "append" | null = $state(null);
  let totalFilteredCount = $state(0);

  const hasNoClipboardItems = $derived(
    totalFilteredCount === 0 &&
      !searchQuery &&
      activeFilterCount() === 0 &&
      loadingType !== "init",
  );

  let offset = $state(0);
  let hasMore = $state(true);
  let itemsPerPage = $state(50);

  let showSyncDirectionModal = $state(false);
  let showFilterModal = $state(false);
  let filterShortcut = $state<KeyboardShortcut>(DEFAULT_FILTER_SHORTCUT);
  let selectedTypes = $state<Set<ItemType>>(
    new Set(
      JSON.parse(localStorage.getItem("clipboard_selected_types") || "[]"),
    ),
  );
  let showFavoritesOnly = $state(
    localStorage.getItem("clipboard_show_favorites") === "true",
  );
  let showSyncedOnly = $state(
    localStorage.getItem("clipboard_show_synced") === "true",
  );
  let dateFrom = $state<number | null>(null);
  let dateTo = $state<number | null>(null);

  const maxClipboardItemsLimit = $derived(
    authStore.subscription?.planDetails?.maxClipboardItemsLimit ?? 100,
  );

  let hasNewCloudItems = $state(false);
  let autoSync = $state(false);
  let isSyncing = $state(false);
  let syncState = $state<string | null>(null);
  let syncError = $state<string | null>(null);

  // Lock state
  let isPinSet = $state(false);
  let isLocking = $state(false);
  let showLockPinModal = $state(false);

  // MPC running tooltip
  const mpcTooltip = $derived(
    mpcStore.inProgress
      ? (mpcStore.steps.find((s) => s.status === "active")?.label || "MPC") +
          " - " +
          (mpcStore.message || "In progress...")
      : "",
  );
  let showPinSetupModal = $state(false);
  let pinEntryError = $state<string | null>(null);
  let isFileAccessAllowed = $state(true);
  let showFilePermissionBanner = $state(false);
  let pushServiceFailure = $state(false);
  let showMpcCompletedBanner = $state(false);
  let showPasswordError = $state(false);
  let smartBlurEnabled = $state(true);
  let smartBlurImagesEnabled = $state(false);

  // Filter options
  let selectedItems = $state(new Set<string>());
  let selectedItemsData = $state(new Map<string, ClipboardItemType>());
  let selectionModeActive = $state(false);
  let masterPasswordSet = $state(false);
  const isSelectionMode = $derived(selectionModeActive);
  const hasSelectedSyncedItems = $derived(
    Array.from(selectedItems).some((id) => {
      const item = items.find((i) => i.id === id) || selectedItemsData.get(id);
      return (
        item && (item.syncStatus === "synced" || item.isSynced || !!item._id)
      );
    }),
  );
  let searchInput: HTMLInputElement;

  $effect(() => {
    localStorage.setItem("clipboard_search_query", searchQuery);
    localStorage.setItem(
      "clipboard_selected_types",
      JSON.stringify(Array.from(selectedTypes)),
    );
    localStorage.setItem("clipboard_show_favorites", String(showFavoritesOnly));
    localStorage.setItem("clipboard_show_synced", String(showSyncedOnly));

    const filters = {
      dateFrom,
      dateTo,
      selectedTypes: Array.from(selectedTypes),
      showFavoritesOnly,
      showSyncedOnly,
    };
    localStorage.setItem("clipboard_filters", JSON.stringify(filters));
  });

  // Edit Modal State
  let showEditModal = $state(false);
  let editingItem = $state<ClipboardItemType | null>(null);

  // View Modal State
  let showViewModal = $state(false);
  let viewingItem = $state<ClipboardItemType | null>(null);

  // Add Modal State
  let showAddModal = $state(false);

  // Share Modal State
  let showShareModal = $state(false);
  let sharingItem = $state<ClipboardItemType | null>(null);

  // Confirm Modal State
  let showConfirmModal = $state(false);
  let confirmTitle = $state("");
  let confirmMessage = $state("");
  let confirmVariant = $state<"default" | "danger" | "warning">("default");
  let onConfirmAction = $state<() => void>(() => {});

  // Delete Confirm Modal State
  let showDeleteModal = $state(false);
  let deleteModalTitle = $state("");
  let deleteModalMessage = $state("");
  let deleteItemCount = $state(0);
  let onDeleteConfirm = $state<(deleteFromCloud: boolean) => void>(() => {});

  // E2E Password Modal State
  let showPasswordModal = $state(false);
  let isFirstTimeSetup = $state(true);
  let passwordError = $state<string | null>(null);
  let pendingSyncItemId = $state<string | null>(null);
  let pendingManualSync = $state(false);
  let isVerifyingPassword = $state(false);

  const init = async () => {
    // Load settings using service
    const settings = await localSettingsService.getSettings();
    itemsPerPage = settings.itemsPerPage || 50;
    smartBlurEnabled = settings.smartBlurConfidential ?? true;
    smartBlurImagesEnabled = settings.smartBlurImages ?? false;

    // Listen for settings changes
    localSettingsService.onSettingsChanged((newSettings) => {
      smartBlurEnabled = newSettings.smartBlurConfidential ?? true;
      smartBlurImagesEnabled = newSettings.smartBlurImages ?? false;
      itemsPerPage = newSettings.itemsPerPage || 50;
    });

    // Clean up stuck pending statuses asynchronously
    clipboardDBService
      .getPendingSyncItems()
      .then(async (pendingItems) => {
        for (const item of pendingItems) {
          if (item.syncStatus === "pending") {
            await clipboardDBService.updateSyncStatus(item.id, "local");
          }
        }
      })
      .catch((_) => {});

    // isLoading starts as true to show the initial spinner.
    // Reset it here so loadItems() can proceed (the guard prevents concurrent loads, not first load).
    masterPasswordSet = await storageService.getMasterPasswordStatus();
    isLoading = false;
    await loadItems("init");
  };

  // Load initial items
  // Clear items immediately when locked
  $effect(() => {
    if (lockStore.isLocked) {
      items = [];
      searchQuery = "";
      selectedTypes.clear();
      showFavoritesOnly = false;
      showSyncedOnly = false;
      localStorage.removeItem("clipboard_search_query");
      localStorage.removeItem("clipboard_selected_types");
      localStorage.removeItem("clipboard_show_favorites");
      localStorage.removeItem("clipboard_show_synced");
      localStorage.removeItem("clipboard_filters");
      dateFrom = null;
      dateTo = null;
      selectedTypes.clear();
      showFavoritesOnly = false;
      showSyncedOnly = false;
    }
  });

  onMount(() => {
    loadFilterShortcut();

    init().then(() => {
      // Check for file scheme access
      if (chrome.extension?.isAllowedFileSchemeAccess) {
        chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
          isFileAccessAllowed = isAllowed;

          // Show banner if not allowed AND not dismissed
          if (!isAllowed) {
            const isDismissed =
              localStorage.getItem("file_permission_banner_dismissed") ===
              "true";
            if (!isDismissed) {
              showFilePermissionBanner = true;
            }
          }
        });
      }

      if (searchInput) {
        searchInput.focus();
      }

      // Check for Push Service Failure, but respect local dismissal
      const isDismissed = localStorage.getItem("push_warning_dismissed");
      if (!isDismissed) {
        storageService.get(["pushServiceFailure"]).then((data) => {
          if (data.pushServiceFailure) {
            pushServiceFailure = true;
          }
        });
      }

      // Check for MPC completed banner, but respect local dismissal
      const mpcBannerDismissed = localStorage.getItem(
        "mpc_completed_banner_dismissed",
      );
      if (!mpcBannerDismissed) {
        mpcService.getMpcCompleted().then((completed) => {
          if (completed) {
            showMpcCompletedBanner = true;
          }
        });
      }

      // Check if PIN is set for Lock Now button
      lockService.isPinSet().then((pinSet) => {
        isPinSet = pinSet;
      });
    });

    // Check for pending cloud items on load
    storageService.get(["hasPendingCloudItems"]).then((data) => {
      if (data.hasPendingCloudItems) {
        hasNewCloudItems = true;
      } else {
        // If no pending items known, check if we should perform an initial session check
        // This ensures that if the user opens the sidebar for the first time in a session,
        // we check for updates (without auto-downloading).
        try {
          // Use window.sessionStorage if available to track this session
          // Note: sessionStorage persists as long as the tab/window is open.
          // For a sidebar, this might mean "until browser restart" or "until sidebar closed" depending on implementation.
          const hasChecked = sessionStorage.getItem("initial_cloud_check_done");

          storageService.get(["clipboardAutoSync"]).then((data) => {
            autoSync = !!data.clipboardAutoSync;
          });

          chrome.storage.local.onChanged.addListener((changes) => {
            if (changes.clipboardAutoSync) {
              autoSync = !!changes.clipboardAutoSync.newValue;
            }
          });

          if (!hasChecked) {
            sendCheckUpdates();
            sessionStorage.setItem("initial_cloud_check_done", "true");
          }
        } catch (e) {
          // Ignore storage errors
        }
      }
    });

    let loadItemsTimeout: ReturnType<typeof setTimeout>;

    function debouncedLoadItems(mode: LoadMode = "init") {
      if (loadItemsTimeout) clearTimeout(loadItemsTimeout);
      loadItemsTimeout = setTimeout(() => {
        loadItems(mode);
      }, 300);
    }

    // Listen for new clipboard items from background
    const messageListener = (message: any) => {
      // SKIP updates if sync is in progress to avoid UI freeze
      // We will reload fully when SYNC_PROGRESS -> complete
      // Unified Targeted Updates (Works even during sync)
      // Batch items arriving from sync chunk - update stats, refresh list
      if (
        message.type === MessageType.CLIPBOARD_ITEM_UPDATED &&
        message.payload?.itemIds
      ) {
        const itemIds = message.payload.itemIds;

        if (Array.isArray(itemIds) && itemIds.length > 0) {
          hasMore = true;
          totalFilteredCount += itemIds.length;

          const currentPage = Math.ceil(items.length / itemsPerPage) || 1;

          if (items.length < currentPage * itemsPerPage) {
            debouncedLoadItems("refresh");
          }
        }
        return;
      }

      if (
        (message.type === MessageType.CLIPBOARD_ITEM_UPDATED ||
          message.type === MessageType.CLIPBOARD_UPDATED) &&
        message.payload?.itemId
      ) {
        // We do NOT check isSyncing here. We want instant feedback for new/updated items.
        clipboardDBService
          .getItem(message.payload.itemId)
          .then((updatedItem) => {
            if (updatedItem) {
              // OPTIMIZATION: If item is image, strip content to prevent Fuse.js from indexing 5MB string
              if (
                updatedItem.type === ItemType.IMAGE &&
                updatedItem.thumbnail
              ) {
                updatedItem.content = "";
              }

              const index = items.findIndex((i) => i.id === updatedItem.id);
              if (index !== -1) {
                // Update item in place
                items[index] = updatedItem;
                items = items; // Trigger reactivity

                if (selectedItems.has(updatedItem.id)) {
                  selectedItemsData.set(updatedItem.id, { ...updatedItem });
                }
              } else {
                const existingById = items.findIndex(
                  (i) => i._id && i._id === updatedItem._id,
                );
                if (existingById !== -1) {
                  items[existingById] = updatedItem;
                  items = items;
                } else {
                  items = [updatedItem, ...items];
                  if (matchesCurrentFilters(updatedItem)) {
                    totalFilteredCount++;
                  }
                }
              }
            }
          });
      } else if (
        message.type === MessageType.ITEM_BATCH_UPDATED &&
        message.payload?.items
      ) {
        // Handle batch updates for multiple items (e.g., thumbnail generation complete)
        const batchItems = message.payload.items;

        for (const { id, changes } of batchItems) {
          const index = items.findIndex((i) => i.id === id);
          if (index !== -1) {
            items[index] = { ...items[index], ...changes };

            // Optimization: clear content for images with thumbnails
            if (changes.thumbnail) {
              items[index].content = "";
            }
          }
        }
        items = items; // Trigger reactivity
      } else if (
        message.type === MessageType.CLIPBOARD_UPDATED ||
        message.type === MessageType.CLIPBOARD_SYNCED
      ) {
        // General updates (no ID) -> Reload list
        // Only reset (scroll to top + refetch) if the user is already near the top.
        // If scrolled down, the item-targeted handler already prepended the new item.
        // Triggering loadItems(false) here would cause a mass re-render that breaks reactivity.
        const isAtTop =
          !itemsListContainer || itemsListContainer.scrollTop < 100;
        if (message.type === MessageType.CLIPBOARD_SYNCED) {
          // Check payload to decide if refresh is needed
          const affectedIds: string[] =
            message.itemIds || (message.itemId ? [message.itemId] : []);
          const changeType: string | undefined = message.changeType;

          let needsRefresh = affectedIds.length === 0; // No payload → backward compatible

          if (changeType === "deleted") {
            // Only refresh if any deleted items were visible
            const visibleServerIds = new Set(
              items.filter((i: any) => i._id).map((i: any) => i._id),
            );
            needsRefresh = affectedIds.some((id: string) =>
              visibleServerIds.has(id),
            );
          } else if (changeType === "added") {
            needsRefresh = affectedIds.length > 0;
          } else if (affectedIds.length > 0 && !needsRefresh) {
            // Single-item upload - already updated in-place by handleSync
            // Only refresh if item is NOT yet visible (new item from another page)
            const visibleIds = new Set(items.map((i) => i.id));
            needsRefresh = affectedIds.some(
              (id: string) => !visibleIds.has(id),
            );
          }

          if (needsRefresh) {
            debouncedLoadItems("refresh");
          }

          hasNewCloudItems = false;
        } else if (isAtTop) {
          debouncedLoadItems("refresh");
        }

        // Re-check MPC completed banner
        if (!showMpcCompletedBanner) {
          const dismissed = localStorage.getItem(
            "mpc_completed_banner_dismissed",
          );
          if (!dismissed) {
            mpcService.getMpcCompleted().then((completed) => {
              if (completed) showMpcCompletedBanner = true;
            });
          }
        }
      } else if (message.type === MessageType.NEW_ITEMS_AVAILABLE) {
        if (isSyncing) return;
        hasNewCloudItems = true;
      } else if (message.type === MessageType.SYNC_PROGRESS) {
        const stage = message.syncProgress?.stage;

        if (stage === SyncStage.WAITING_FOR_CONNECTIVITY) {
          unselectAll();
          isSyncing = true;
          syncState = "waiting";
        } else if (stage === SyncStage.PAUSED) {
          isSyncing = false;
          syncState = "paused";
        } else if (stage === SyncStage.COMPLETE || stage === SyncStage.ERROR) {
          isSyncing = false;
          syncState = null;
          syncError =
            stage === SyncStage.ERROR
              ? getErrorMessage(message.syncProgress?.message || "Sync failed")
              : null;
        } else if (
          [
            SyncStage.DOWNLOADING,
            SyncStage.DECRYPTING,
            SyncStage.PROCESSING,
            SyncStage.SYNCING,
            SyncStage.UPLOADING,
            SyncStage.SAVING,
          ].includes(stage)
        ) {
          unselectAll();
          isSyncing = true;
          syncState = null;
        }
      } else if (message.type === MessageType.SETTINGS_UPDATED) {
        // Reload settings using service
        localSettingsService.getSettings().then((settings) => {
          // Update blur settings
          smartBlurEnabled = settings.smartBlurConfidential ?? true;
          smartBlurImagesEnabled = settings.smartBlurImages ?? false;

          const newLimit = settings.itemsPerPage || 50;
          if (newLimit !== itemsPerPage) {
            itemsPerPage = newLimit;

            loadItems("refresh");
          }
        });
      } else if (message.type === MessageType.PUSH_SERVICE_FAILURE) {
        const isDismissed = localStorage.getItem("push_warning_dismissed");
        if (!isDismissed) {
          pushServiceFailure = true;
        }
      } else if (message.type === MessageType.INVALID_MASTER_PASSWORD) {
        showPasswordError = true;
        // Also reset verifying state if modal is open
        isVerifyingPassword = false;

        if (showPasswordModal) {
          passwordError = "Password incorrect for remote data.";
        }
      }
      return false;
    };

    if (chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(messageListener);
    }

    // Listen for drag-and-drop additions within the sidebar (custom event)
    const handleItemAdded = (e: CustomEvent<{ itemId: string }>) => {
      clipboardDBService.getItem(e.detail.itemId).then((newItem) => {
        if (newItem) {
          if (newItem.type === ItemType.IMAGE && newItem.thumbnail) {
            newItem.content = "";
          }
          items = [newItem, ...items];
          if (matchesCurrentFilters(newItem)) {
            totalFilteredCount++;
          }
        }
      });
    };

    window.addEventListener(
      "clipboard-item-added",
      handleItemAdded as EventListener,
    );

    return () => {
      if (chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
      window.removeEventListener(
        "clipboard-item-added",
        handleItemAdded as EventListener,
      );
    };
  });

  type LoadMode = "init" | "append" | "refresh";

  async function loadItems(mode: LoadMode = "init") {
    if (lockStore.isLocked) {
      items = [];
      return;
    }

    if (isLoading) {
      return;
    }

    if (mode === "append" && !hasMore) {
      return;
    }

    isLoading = true;
    loadingType = mode;

    if (mode === "init" || mode === "refresh") {
      offset = 0;
      hasMore = true;
      totalFilteredCount = 0;

      if (mode === "init" && itemsListContainer) {
        clipboardItemLockService.clearScrollPosition("sidepanel");
        itemsListContainer.scrollTo({ top: 0, behavior: "smooth" });
      }
    }

    try {
      let newItems: ClipboardItemType[] = [];

      const { typeFilter, searchKeyword } = parseSmartSearch(searchQuery);

      newItems = await clipboardDBService.getFilteredItemsPaginated(
        itemsPerPage,
        offset,
        {
          searchKeyword,
          searchType: typeFilter,
          selectedTypes,
          showFavoritesOnly,
          showSyncedOnly,
          dateFrom,
          dateTo,
        },
      );

      if (newItems.length < itemsPerPage) {
        hasMore = false;
      }

      offset += newItems.length;

      if (mode === "init" || mode === "refresh") {
        items = newItems;
        totalFilteredCount = await clipboardDBService.getFilteredCount({
          searchKeyword,
          searchType: typeFilter,
          selectedTypes,
          showFavoritesOnly,
          showSyncedOnly,
          dateFrom,
          dateTo,
        });
      } else {
        const existingIds = new Set(items.map((i) => i.id));
        const filteredNewItems = newItems.filter((i) => !existingIds.has(i.id));
        items = [...items, ...filteredNewItems];
      }

      newItems.forEach((item) => {
        if (selectedItems.has(item.id)) {
          selectedItemsData.set(item.id, { ...item });
        }
      });

      if (selectedItems.size > 0) {
        selectedItems = new Set(selectedItems);
      }
    } catch (error) {
      console.error("Failed to load items:", error);
    } finally {
      isLoading = false;
      loadingType = null;

      if (mode === "append") {
        setTimeout(() => {
          clipboardItemLockService.restoreScrollWithSmooth(
            "sidepanel",
            itemsListContainer!,
          );
        }, 10);
      }

      if (mode === "append" && hasMore) {
        setTimeout(() => {
          if (isNearBottom()) {
            loadItems("append");
          }
        }, 0);
      }
    }
  }

  function matchesCurrentFilters(item: ClipboardItemType): boolean {
    const { typeFilter, searchKeyword } = parseSmartSearch(searchQuery);
    const lowerKeyword = searchKeyword?.trim()?.toLowerCase();

    // 1. Type Match
    let matchesType = true;
    if (typeFilter && typeFilter !== "all") {
      matchesType = item.type === typeFilter;
    } else if (selectedTypes.size > 0) {
      matchesType = selectedTypes.has(item.type);
    }
    if (!matchesType) return false;

    // 2. Keyword Match
    if (lowerKeyword) {
      const textTypes = [
        ItemType.TEXT,
        ItemType.JSON,
        ItemType.EMOJI,
        ItemType.OTP,
        ItemType.URL,
        ItemType.PHONE,
        ItemType.IP,
        ItemType.EMAIL,
      ];
      if (textTypes.includes(item.type)) {
        const content = typeof item.content === "string" ? item.content : "";
        if (!content.toLowerCase().includes(lowerKeyword)) return false;
      } else {
        return false;
      }
    }

    // 3. Favorites
    if (showFavoritesOnly && !item.isFavorite) return false;

    // 4. Synced
    if (showSyncedOnly && item.syncStatus !== "synced") return false;

    return true;
  }

  /**
   * Parse search query for smart type filtering
   * Syntax: @type:keyword
   * Example: @email:john -> type filter: email, search: john
   */
  function parseSmartSearch(query: string): {
    typeFilter: ItemType | "all";
    searchKeyword: string;
  } {
    const trimmedQuery = query.trim();

    // Check if query starts with @
    if (!trimmedQuery.startsWith("@")) {
      return { typeFilter: "all", searchKeyword: trimmedQuery };
    }

    // Find the first colon
    const colonIndex = trimmedQuery.indexOf(":");
    if (colonIndex === -1) {
      // No colon found, treat as regular search
      return { typeFilter: "all", searchKeyword: trimmedQuery };
    }

    // Extract type and keyword
    const typeStr = trimmedQuery.substring(1, colonIndex).toLowerCase();
    const keyword = trimmedQuery.substring(colonIndex + 1).trim();

    // Map type string to ItemType enum
    const typeMap: Record<string, ItemType> = {
      text: ItemType.TEXT,
      json: ItemType.JSON,
      phone: ItemType.PHONE,
      ip: ItemType.IP,
      otp: ItemType.OTP,
      url: ItemType.URL,
      emoji: ItemType.EMOJI,
      image: ItemType.IMAGE,
      img: ItemType.IMAGE,
      email: ItemType.EMAIL,
      html: ItemType.HTML,
      md: ItemType.MARKDOWN,
      markdown: ItemType.MARKDOWN,
    };

    const mappedType = typeMap[typeStr.toLowerCase()];

    // For images, we ignore the search keyword as we don't support image content search yet
    const finalKeyword = mappedType === ItemType.IMAGE ? "" : keyword;

    return {
      typeFilter: mappedType || "all",
      searchKeyword: finalKeyword,
    };
  }

  // Smart Search logic extracted above

  async function handleCopy(id: string) {
    console.log("Copied item:", id);
    // Could show a toast notification here
  }

  // Handle password modal submission
  async function handlePasswordSubmit(
    password: string,
    rememberPassword?: boolean,
  ) {
    passwordError = null;
    isVerifyingPassword = true;

    try {
      const hasPassword = await MasterPassUtils.hasMasterPassword();
      const needsCloudRestore = !hasPassword && authStore.hasSyncedItems;

      if (isFirstTimeSetup || needsCloudRestore) {
        if (!needsCloudRestore && password.length < 8) {
          passwordError = "Password must be at least 8 characters";
          return;
        }

        try {
          // Verify against cloud data via Background Service
          // This ensures we don't overwrite the key if cloud has data encrypted with a different key
          const verifyResponse = await sendVerifyCloudPassword({ password });

          if (!verifyResponse?.success) {
            // Verification failed
            if (verifyResponse?.error) {
              throw new Error(verifyResponse.error);
            }
            throw new Error("Password verification failed");
          }
        } catch (err: any) {
          console.error("Password verification failed:", err);
          passwordError =
            err.message || "Incorrect master password for cloud data.";
          return;
        }

        // Set new master password in background
        const setResult = await sendSetMasterPassword({
          password,
          rememberPassword,
        });
        if (!setResult?.success) {
          toast.error(
            setResult?.error || "Failed to set master password in background",
          );
          return;
        }

        // Set password locally in sidebar service (re-creates local hash/storage status)
        await MasterPassUtils.setMasterPassword(password);

        // Update sync settings (this is done in background usually but we reflect here)
        if (rememberPassword) {
          await storageService.set({ clipboardAutoSync: true });
        }

        await storageService.set({
          clipboardMasterPasswordSet: true,
        });

        masterPasswordSet = true;

        toast.success(
          needsCloudRestore
            ? "Master password verified and restored"
            : "Master password verified and set",
        );
      } else {
        // Verify existing password
        const response = await sendVerifyMasterPassword({ password });

        if (!response?.success) {
          passwordError = "Invalid password";
          return;
        }

        // Set password locally in sidebar service
        await MasterPassUtils.setMasterPassword(password);

        // Propagate password to background worker memory to prevent decryption failures during sync
        const setResult = await sendSetMasterPassword({ password });
        if (!setResult?.success) {
          toast.error(
            setResult?.error || "Failed to propagate password to background",
          );
          return;
        }
      }

      // Close modal
      showPasswordModal = false;

      if (pendingSyncItemId) {
        const itemToSync = items.find((i) => i.id === pendingSyncItemId);
        if (itemToSync) {
          handleSync({ item: itemToSync });
        }
        pendingSyncItemId = null;
      } else if (pendingManualSync) {
        pendingManualSync = false;
        handleManualSync();
      }
    } catch (error: any) {
      console.error("Failed to set password:", error);
      passwordError = error.message || "Failed to set password";
    } finally {
      isVerifyingPassword = false;
    }
  }

  async function handleUnsync(item: ClipboardItemType) {
    if (!item._id) return;

    if (mpcStore.inProgress) {
      toast.error(
        "Cannot unsync items while a master password change is in progress.",
      );
      return;
    }

    confirmTitle = "Unsync Item";
    confirmMessage =
      "Are you sure you want to unsync this item from the cloud? It will remain on this device but won't be available on other devices.";
    confirmVariant = "warning";
    onConfirmAction = async () => {
      showConfirmModal = false;
      // UI Feedback
      const previousStatus = item.syncStatus;
      items = items.map((i) =>
        i.id === item.id ? { ...i, syncStatus: "pending_delete" } : i,
      );

      try {
        const response = await sendUnsyncItem({
          id: item.id,
          serverId: item._id,
        });

        if (!response?.success) {
          throw new Error(response?.error || "Unsync failed");
        }

        // Refresh item state (Background should have updated it to 'local')
        const updatedItem = await clipboardDBService.getItem(item.id);
        if (updatedItem) {
          items = items.map((i) => (i.id === item.id ? updatedItem : i));
          toast.success("Item removed from cloud");
        }
      } catch (error: any) {
        console.error("[ClipboardList] Failed to unsync:", error);
        toast.error(`Failed to remove: ${getErrorMessage(error)}`);
        // Revert status
        items = items.map((i) =>
          i.id === item.id ? { ...i, syncStatus: previousStatus } : i,
        );
      }
    };
    showConfirmModal = true;
  }

  async function handleSync(data: { item: ClipboardItemType }) {
    const { item } = data;
    console.log("[sync] handleSync received", {
      id: item.id,
      syncStatus: item.syncStatus,
      type: item.type,
      mpcInProgress: mpcStore.inProgress,
      isGuest: authStore.isGuest,
    });

    if (mpcStore.inProgress) {
      toast.error(
        "Cannot sync items while a master password change is in progress.",
      );
      return;
    }

    // Check if authenticated first
    if (authStore.isGuest) {
      authModalStore.open("sync");
      return;
    }

    // Check if user has sync abilities
    const hasSyncAbility = authStore.hasAbility(PlanAbility.CLIPBOARD_SYNC);

    if (!hasSyncAbility) {
      upgradeModalStore.open({
        featureName: "Cloud Sync",
        title: "Premium Feature",
        description:
          "Sync your clipboard items to the cloud and access them across all your devices. This premium feature requires an active subscription.",
      });
      return;
    }

    // Check availability for Image Sync
    if (item.type === ItemType.IMAGE) {
      if (!authStore.hasAbility(PlanAbility.IMAGE_SUPPORT)) {
        upgradeModalStore.open({
          featureName: "Image Sync",
          title: "Premium Feature",
          description:
            "Syncing images to the cloud is a premium feature. Upgrade to Pro to enable image sync.",
        });
        return;
      }
    }

    if (item.syncStatus === "synced") {
      await handleUnsync(item);
      return;
    }

    // Check internet connection
    if (!navigator.onLine) {
      toast.error("No internet connection. Connect to the internet to sync.");
      return;
    }

    // Check sync limit
    try {
      const syncedCount = await clipboardDBService.getSyncedCount();
      const planLimit =
        authStore.subscription?.planDetails?.maxClipboardItemsLimit ??
        GUEST_PLAN.maxClipboardItemsLimit;

      if (syncedCount >= planLimit) {
        toast.error(
          `Sync limit reached (${planLimit}). Upgrade/Delete items to sync more.`,
        );
        return;
      }
    } catch (error) {
      console.error("Failed to check sync limits:", error);
      // Proceed with caution or return? Proceeding might just fail at server.
      // Let's rely on server for fail-safe, but here just log.
    }

    try {
      // Update UI immediately to show pending
      items = items.map((i) =>
        i.id === item.id ? { ...i, syncStatus: "pending" } : i,
      );

      // Delegate sync to background script (Orchestrator)
      const syncResult = await sendSyncItem({ itemId: item.id });
      if (!syncResult?.success) {
        throw new Error(syncResult?.error || "Sync failed");
      }

      // Refresh the item in the list to get the updated status
      const updatedItem = await clipboardDBService.getItem(item.id);
      if (updatedItem) {
        items = items.map((i) => (i.id === item.id ? updatedItem : i));

        // Only show success if actually synced (not stuck in pending)
        if (updatedItem.syncStatus === "synced") {
          toast.success("Item synced successfully");
        } else if (updatedItem.syncStatus === "error") {
          throw new Error(updatedItem.lastSyncError || "Sync failed");
        }
      }
    } catch (error: any) {
      console.error("Failed to sync item:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to sync item";

      // Check if error is about missing master password
      if (errorMessage.includes("Master password not set")) {
        // Show password modal instead of toast
        pendingSyncItemId = item.id;
        const hasPassword = await MasterPassUtils.hasMasterPassword();
        isFirstTimeSetup = !hasPassword && !authStore.hasSyncedItems;
        showPasswordModal = true;

        // Reset item back to local status
        await clipboardDBService.updateSyncStatus(item.id, "local");
        const localItem = await clipboardDBService.getItem(item.id);
        if (localItem) {
          items = items.map((i) => (i.id === item.id ? localItem : i));
        }
      } else {
        toast.error(getErrorMessage(errorMessage));

        // Refresh to show error status
        const errorItem = await clipboardDBService.getItem(item.id);
        if (errorItem) {
          items = items.map((i) => (i.id === item.id ? errorItem : i));
        }
      }
    }
  }

  async function handleLockNow() {
    if (mpcStore.inProgress) {
      toast.error("Cannot lock while a master password change is in progress.");
      return;
    }
    if (authStore.isGuest) {
      authModalStore.open("lock");
      return;
    }

    if (!authStore.hasAbility(PlanAbility.PIN_LOCK)) {
      upgradeModalStore.open({
        featureName: "PIN Lock",
        title: "Premium Feature",
        description:
          "Secure your clipboard with a 6-digit PIN. This premium feature ensures your sensitive data stays protected.",
      });
      return;
    }

    if (!isPinSet) {
      showPinSetupModal = true;
      return;
    }

    showLockPinModal = true;
  }

  async function handleLockSubmit(pin: string) {
    if (!pin || pin.length !== 6) return;

    isLocking = true;
    pinEntryError = null;

    try {
      const verifyRes = await sendVerifyPin(pin);
      if (!verifyRes?.success) {
        pinEntryError = verifyRes?.error || "Invalid PIN";
        isLocking = false;
        return;
      }
    } catch (err: any) {
      pinEntryError = err.message || "Verification failed";
      isLocking = false;
      return;
    }

    showLockPinModal = false;

    try {
      const response = await sendLock({ pin });
      if (!response || !response.success) {
        throw new Error(response?.error || "Lock failed");
      }
      lockStore.setLocked(true);
      toast.success("Clipboard locked");
      sendLocked();
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    } finally {
      isLocking = false;
    }
  }

  function handlePinSetupComplete() {
    showPinSetupModal = false;
    isPinSet = true;
    showLockPinModal = true;
    toast.success("PIN lock enabled");
  }

  async function handleManualSync() {
    // Check if authenticated
    if (authStore.isGuest) {
      authModalStore.open("sync");
      return;
    }

    // Block sync if clipboard is locked
    if (lockStore.isLocked) {
      toast.error(
        "Cannot sync while clipboard is locked. Please unlock first.",
      );
      return;
    }

    // Block sync if master password change is in progress
    if (
      (mpcStore.inProgress || mpcStore.currentPhase === MPCPhase.ERROR) &&
      mpcStore.currentPhase !== MPCPhase.COMPLETE
    ) {
      toast.error("Cannot sync while a master password change is in progress.");
      return;
    }

    // Prevent concurrent manual syncs if background is already working
    if (isSyncing) {
      toast.info("A sync is already in progress...");
      return;
    }

    // Check if master password is set before attempting sync
    const isPasswordLoaded = await MasterPassUtils.isMasterPasswordSet(); // Checks if loaded in memory
    if (!isPasswordLoaded) {
      pendingManualSync = true;
      const hasPassword = await MasterPassUtils.hasMasterPassword(); // Checks if configured on disk
      isFirstTimeSetup = !hasPassword && !authStore.hasSyncedItems;
      showPasswordModal = true;
      return;
    } else {
      // PROACTIVELY propagate password to background to ensure it can decrypt downloads
      // This handles cases where background worker restarted and lost memory/session state
      const password = MasterPassUtils.getMasterPassword();
      if (password) {
        await sendSetMasterPassword({ password });
      }
    }

    // Check sync settings and show modal if needed
    const storage = await storageService.get([
      "clipboardDisableUploadToCloud",
      "totalCloudItems",
    ]);

    // Calculate upload availability
    const unsyncedItems = await clipboardDBService.getUnsyncedItems();
    const localAdditions = unsyncedItems.filter(
      (i) => i.syncStatus !== SyncStatus.PENDING_DELETE,
    );
    const currentSynced = storage.totalCloudItems || 0;
    const maxLimit = maxClipboardItemsLimit;

    const isUploadDisabled =
      storage.clipboardDisableUploadToCloud ||
      (maxLimit > 0 &&
        currentSynced >= maxLimit &&
        localAdditions.length > 0) ||
      unsyncedItems.length === 0;

    if (isUploadDisabled) {
      await performSync("download");
    } else {
      showSyncDirectionModal = true;
    }
  }

  async function performSync(
    syncType: "download" | "upload" | "bidirectional",
  ) {
    showSyncDirectionModal = false;
    try {
      unselectAll();
      isSyncing = true;

      // Use CLIPBOARD_MANUAL_SYNC to pass parameters
      const syncResult = await sendManualSync(syncType);
      if (!syncResult?.success) {
        throw new Error(syncResult?.error || "Sync failed to start");
      }

      // Don't clear states here - let SYNC_PROGRESS messages handle it
      // The sync happens asynchronously in the background
      // When complete, we'll get a SYNC_PROGRESS with stage="complete"
      // which will trigger CLIPBOARD_SYNCED to reload items
    } catch (error: any) {
      console.error("Manual sync failed", error);
      syncError = getErrorMessage(error.message || "Sync failed");
      isSyncing = false;
    }
  }

  async function handleDelete(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    if (mpcStore.inProgress) {
      toast.error(
        "Cannot delete items while a master password change is in progress.",
      );
      return;
    }

    // Check if item is locked by another UI
    const { allowed, error } = await clipboardItemLockService.canPerformAction(
      id,
      "delete",
      LockOwner.SIDEBAR,
    );
    if (!allowed) {
      toast.error(
        error || "Cannot delete - this item is being edited in another window",
      );
      return;
    }

    deleteModalTitle = "Delete Item";
    deleteModalMessage =
      "Are you sure you want to delete this item? Choose where to delete it from:";
    deleteItemCount = 1;

    // Check if item is synced to decide if we need confirmation
    const isSynced =
      item.syncStatus === "synced" ||
      item.syncStatus === "error" ||
      item.isSynced;

    if (!isSynced) {
      // Local deletion only - skip confirmation
      // Store item data for Undo (snapshot to remove Svelte 5 proxy)
      const itemToDelete = $state.snapshot(item);

      // Optimistic update
      items = items.filter((item) => item.id !== id);

      // Delete from DB
      await clipboardDBService.deleteItem(id);

      sendUpdateBadge();

      // Show Undo Toast
      toast("Item deleted", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              // Restore to DB
              await clipboardDBService.restoreItem(itemToDelete);

              loadItems("refresh"); // Reload current view (fetch from start without scroll jump)
              toast.success("Item restored");
            } catch (e) {
              console.error("Undo failed:", e);
              toast.error("Failed to restore item");
            }
          },
        },
      });
      return;
    }

    onDeleteConfirm = async (deleteFromCloud: boolean) => {
      try {
        const currentItem = items.find((i) => i.id === id) || item;

        await checkAndClearClipboard([currentItem.content]);

        if (deleteFromCloud) {
          // Delete from cloud (will sync to all devices)
          if (
            currentItem.syncStatus === "synced" ||
            currentItem.syncStatus === "error"
          ) {
            // Mark as pending delete and trigger sync
            await clipboardDBService.deleteItem(id);
            sendSyncDeletion();
          } else {
            // Not synced, delete locally
            await clipboardDBService.deleteItem(id);
          }
        } else {
          // Delete locally only
          await clipboardDBService.deleteItem(id);
        }

        items = items.filter((item) => item.id !== id);
        totalFilteredCount = Math.max(0, totalFilteredCount - 1);
        sendUpdateBadge();

        // Auto-fill check
        if (items.length < itemsPerPage && hasMore) {
          await loadItems("append");
        }

        showDeleteModal = false;
        toast.success("Item deleted");
      } catch (error) {
        console.error("Failed to delete item:", error);
        toast.error("Failed to delete item");
      }
    };

    showDeleteModal = true;
  }

  async function handleToggleFavorite(id: string) {
    try {
      const isFavorite = await clipboardDBService.toggleFavorite(id);
      items = items.map((item) =>
        item.id === id ? { ...item, isFavorite } : item,
      );

      // Notify background to check for sync updates (if auto-sync is on)
      sendUpdated();
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  }

  async function handleEdit(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const lockOwner = $isFloatingStore
      ? LockOwner.FLOATING_WINDOW
      : LockOwner.SIDEBAR;
    const canLock = await clipboardItemLockService.checkAndLock(id, lockOwner);
    if (!canLock) {
      toast.error("This item is being edited in another window");
      return;
    }

    editingItem = item;
    showEditModal = true;
  }

  async function handleView(id: string) {
    const item = items.find((i) => i.id === id);
    if (item) {
      viewingItem = item;
      showViewModal = true;
    }
  }

  async function handleShare(id: string) {
    const item = items.find((i) => i.id === id);
    if (item) {
      sharingItem = item;
      showShareModal = true;
    }
  }

  async function handleSaveEdit(
    id: string,
    newContent: string,
    newRichContent?: string,
  ) {
    try {
      const updateData: Partial<ClipboardItemType> = { content: newContent };
      if (newRichContent !== undefined) {
        updateData.richContent = newRichContent;
      }
      await clipboardDBService.updateItem(id, updateData);
      // Update local list
      const index = items.findIndex((i) => i.id === id);
      if (index !== -1) {
        items[index].content = newContent;
        if (newRichContent !== undefined) {
          items[index].richContent = newRichContent;
        }
        items = items; // Trigger reactivity
      }
      await sendUpdateBadge();

      await triggerAutoSync(id);
    } catch (error) {
      console.error("Failed to update item:", error);
    }
  }

  async function triggerAutoSync(itemId: string) {
    const authData = await storageService.getAuthData();
    const abilities = authData?.subscription?.planDetails?.abilities || [];
    const hasAutoSyncAbility = abilities.includes(PlanAbility.AUTO_SYNC);

    const autoSyncSettings = await storageService.get([
      "clipboardAutoSync",
      "clipboardMasterPasswordSet",
    ]);
    masterPasswordSet = autoSyncSettings.clipboardMasterPasswordSet || false;

    if (
      autoSyncSettings.clipboardAutoSync &&
      hasAutoSyncAbility &&
      autoSyncSettings.clipboardMasterPasswordSet
    ) {
      sendSyncItem({ itemId }).catch((err) => {
        console.error("[Sidebar] Failed to trigger auto-sync:", err);
        clipboardSyncQueueService.addToQueue(
          itemId,
          err?.message || "Unknown error",
        );
      });
    }
  }

  async function handleAdd(
    content: string,
    type: ItemType,
    richContent?: string,
  ) {
    try {
      const newItem = await clipboardDBService.addItem(
        type,
        content,
        {
          sourceUrl: "manual",
          hostname: "manual",
        },
        undefined,
        richContent,
      );

      // Add to local list at the top
      items = [newItem, ...items];
      totalFilteredCount++;

      await sendUpdateBadge();

      await triggerAutoSync(newItem.id);

      toast.success("Item added successfully");
    } catch (error) {
      console.error("Failed to add item:", error);
      toast.error("Failed to add item");
    }
  }

  function handleSelect(data: { id: string; selected: boolean }) {
    if (isSyncing) return;
    const { id, selected } = data;
    const newSelectedItems = new Set(selectedItems);
    if (selected) {
      newSelectedItems.add(id);
      // Find item in current list and add to data map
      const item = items.find((i) => i.id === id);
      if (item) {
        selectedItemsData.set(id, { ...item });
      }
    } else {
      newSelectedItems.delete(id);
      selectedItemsData.delete(id);
    }
    selectedItems = newSelectedItems;
  }

  function unselectAll() {
    selectedItems = new Set();
    selectedItemsData.clear();
    selectionModeActive = false;
  }

  function enterSelectionMode() {
    selectionModeActive = true;
  }

  function cancelSelection() {
    selectionModeActive = false;
    unselectAll();
  }

  function handleItemLongPress(id: string) {
    selectionModeActive = true;
    const item = items.find((i) => i.id === id);
    if (item) {
      selectedItems = new Set([id]);
      selectedItemsData = new Map([[id, item]]);
    }
  }

  function selectAll() {
    const newSelectedItems = new Set(selectedItems);
    items.forEach((item) => {
      newSelectedItems.add(item.id);
      selectedItemsData.set(item.id, { ...item });
    });
    selectedItems = newSelectedItems;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isSelectionMode) {
      event.preventDefault();
      unselectAll();
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "a") {
      // Only select all if not typing in an input or inside a modal
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.closest(".edit-clipboard-modal-wrapper") ||
        target.closest(".modal-overlay")
      ) {
        return;
      }

      event.preventDefault();
      selectAll();
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "/") {
      event.preventDefault();
      if (searchInput) {
        searchInput.focus();
      }
    }

    if (
      event.code === filterShortcut.key &&
      event.ctrlKey === filterShortcut.ctrlKey &&
      event.shiftKey === filterShortcut.shiftKey &&
      event.altKey === filterShortcut.altKey &&
      event.metaKey === filterShortcut.metaKey
    ) {
      event.preventDefault();
      showFilterModal = true;
    }
  }

  function matchesShortcut(
    e: KeyboardEvent,
    shortcut: KeyboardShortcut,
  ): boolean {
    return (
      e.code === shortcut.key &&
      e.altKey === shortcut.altKey &&
      e.ctrlKey === shortcut.ctrlKey &&
      e.shiftKey === shortcut.shiftKey &&
      e.metaKey === shortcut.metaKey
    );
  }

  async function loadFilterShortcut() {
    try {
      const data = await chrome.storage.local.get([
        STORAGE_KEY_FILTER_SHORTCUT,
      ]);
      if (data[STORAGE_KEY_FILTER_SHORTCUT]) {
        filterShortcut = data[STORAGE_KEY_FILTER_SHORTCUT] as KeyboardShortcut;
      }
    } catch (error) {
      console.error("[ClipboardList] Failed to load filter shortcut:", error);
    }
  }

  function showConfirm(
    title: string,
    message: string,
    variant: "default" | "danger" | "warning",
    onConfirm: () => void,
  ) {
    confirmTitle = title;
    confirmMessage = message;
    confirmVariant = variant;
    onConfirmAction = () => {
      onConfirm();
      showConfirmModal = false;
    };
    showConfirmModal = true;
  }

  /**
   * Checks if any of the deleted contents match the current system clipboard.
   * If so, clears the system clipboard.
   */
  async function checkAndClearClipboard(deletedContents: string[]) {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (deletedContents.includes(clipboardText)) {
        await navigator.clipboard.writeText("");
      }
    } catch (_) {}
  }

  async function handleBulkUnsync() {
    if (mpcStore.inProgress) {
      toast.error(
        "Cannot unsync items while a master password change is in progress.",
      );
      return;
    }
    if (selectedItems.size === 0) return;

    // Filter only synced items from selectedItemsData
    const syncedItems = Array.from(selectedItemsData.values()).filter(
      (item) => item.syncStatus === "synced" || item.isSynced,
    );

    if (syncedItems.length === 0) return;

    confirmTitle = "Unsync Selected Items";
    confirmMessage = `Are you sure you want to unsync ${syncedItems.length} selected items from the cloud?`;
    confirmVariant = "warning";
    onConfirmAction = async () => {
      showConfirmModal = false;
      try {
        // Optimistic update for UI
        const previousStatuses = new Map();
        items = items.map((i) => {
          if (
            selectedItems.has(i.id) &&
            syncedItems.find((s) => s.id === i.id)
          ) {
            previousStatuses.set(i.id, i.syncStatus);
            return { ...i, syncStatus: "pending_delete" };
          }
          return i;
        });

        // Use batch endpoint
        const payloadItems = syncedItems
          .filter((item) => !!item._id)
          .map((item) => ({ id: item.id, serverId: item._id as string }));

        if (payloadItems.length > 0) {
          const response = await sendUnsyncItems({ items: payloadItems });

          if (!response?.success) {
            throw new Error(response?.error || "Bulk unsync failed");
          }
        }

        toast.success(`${syncedItems.length} items unsynced from cloud`);
        unselectAll();

        setTimeout(() => loadItems("refresh"), 100);
      } catch (_) {
        toast.error("Failed to unsync items");
        loadItems("refresh"); // Revert UI on catastrophic failure
      }
    };
    showConfirmModal = true;
  }

  async function handleBulkDelete() {
    if (mpcStore.inProgress) {
      toast.error(
        "Cannot delete items while a master password change is in progress.",
      );
      return;
    }
    if (selectedItems.size === 0) return;

    // Check for bulk delete ability
    deleteModalTitle = "Delete Selected Items";
    deleteModalMessage = `You are about to delete ${selectedItems.size} selected items. Choose where to delete them from:`;
    deleteItemCount = selectedItems.size;
    deleteItemCount = selectedItems.size;

    // Check if any selected items are synced
    const hasSyncedItems = Array.from(selectedItemsData.values()).some(
      (item) => {
        return item && (item.syncStatus === "synced" || item.isSynced);
      },
    );

    if (!hasSyncedItems) {
      // Use simple ConfirmModal for local only
      confirmTitle = "Delete Selected Items";
      confirmMessage = `Are you sure you want to delete ${selectedItems.size} selected items? This action cannot be undone.`;
      confirmVariant = "danger";
      onConfirmAction = async () => {
        try {
          const itemIds = Array.from(selectedItems);
          const contentsToDelete = Array.from(selectedItemsData.values()).map(
            (item) => item.content,
          );

          await checkAndClearClipboard(contentsToDelete);
          await clipboardDBService.deleteItems(itemIds);

          items = items.filter((item) => !selectedItems.has(item.id));
          selectedItems = new Set();
          sendUpdateBadge();
          showConfirmModal = false;
          toast.success("Items deleted");
        } catch (error) {
          console.error("Failed to bulk delete local items:", error);
          toast.error("Failed to delete items");
        }
      };
      showConfirmModal = true;
      return;
    }

    onDeleteConfirm = async (deleteFromCloud: boolean) => {
      try {
        const itemIds = Array.from(selectedItems);

        // Collect contents for OS clipboard check
        const contentsToDelete = items
          .filter((item) => selectedItems.has(item.id))
          .map((item) => item.content);

        // Perform OS clipboard check proactively
        await checkAndClearClipboard(contentsToDelete);

        if (deleteFromCloud) {
          // Delete from cloud (will sync to all devices)
          const syncedItems = items.filter(
            (item) =>
              selectedItems.has(item.id) &&
              (item.syncStatus === "synced" || item.syncStatus === "error"),
          );

          if (syncedItems.length > 0) {
            // Mark as pending delete and trigger sync
            for (const item of syncedItems) {
              await clipboardDBService.deleteItem(item.id);
            }

            // Trigger sync to delete from cloud
            await sendSyncDeletion();
          }

          // Delete non-synced items locally
          const localItems = itemIds.filter(
            (id) => !syncedItems.find((item) => item.id === id),
          );
          if (localItems.length > 0) {
            await clipboardDBService.deleteItems(localItems);
          }
        } else {
          // Delete locally only
          await clipboardDBService.deleteItems(itemIds);
        }

        // Update UI
        const deletedCount = items.filter((item) =>
          selectedItems.has(item.id),
        ).length;
        items = items.filter((item) => !selectedItems.has(item.id));
        totalFilteredCount = Math.max(0, totalFilteredCount - deletedCount);
        selectedItems = new Set();

        sendUpdateBadge();

        // Auto-fill: If we deleted many items and list is short, try to load more
        if (items.length < itemsPerPage && hasMore) {
          await loadItems("append");
        }

        showDeleteModal = false;
        toast.success("Items deleted");
      } catch (error) {
        console.error("Failed to bulk delete:", error);
        toast.error("Failed to delete items");
      }
    };
    showDeleteModal = true;
  }

  async function clearAll() {
    if (mpcStore.inProgress) {
      toast.error(
        "Cannot clear all items while a master password change is in progress.",
      );
      return;
    }
    const totalCount = await clipboardDBService.count();

    deleteModalTitle = "Clear All History";
    deleteModalMessage =
      "You are about to clear all clipboard history. Choose where to delete from:";
    deleteItemCount = totalCount;

    // Check if any items are synced across the entire DB
    const syncedCount = await clipboardDBService.getSyncedCount();
    const hasSyncedItems = syncedCount > 0;

    if (!hasSyncedItems) {
      // Use simple ConfirmModal for local only
      confirmTitle = "Clear All History";
      confirmMessage =
        "Are you sure you want to delete all items? This will remove all clipboard history from this device.";
      confirmVariant = "danger";
      onConfirmAction = async () => {
        try {
          // Clear whole DB
          await clipboardDBService.clearAll();

          // Reset sync timestamp to force full check on next sync
          await chrome.storage.local.set({ lastSyncTimestamp: 0 });

          items = [];
          selectedItems = new Set();
          sendUpdateBadge();
          showConfirmModal = false;
          toast.success("All items cleared");
        } catch (error) {
          console.error("Failed to clear local items:", error);
          toast.error("Failed to clear items");
        }
      };
      showConfirmModal = true;
      return;
    }

    onDeleteConfirm = async (deleteFromCloud: boolean) => {
      try {
        // Efficiency: Check if current clipboard content exists in DB before wiping
        try {
          const clipboardText = await navigator.clipboard.readText();

          if (clipboardText) {
            const existingId =
              await clipboardDBService.findItemByContent(clipboardText);

            if (existingId) {
              await navigator.clipboard.writeText("");
            }
          }
        } catch (e) {
          // Ignore clipboard permission errors
        }

        if (deleteFromCloud) {
          // 1. Fetch ALL items to determine what needs cloud deletion
          const allDbItems = await clipboardDBService.getAllItems();

          // Identify items to sync-delete vs local-delete
          const syncedItems = allDbItems.filter(
            (item) =>
              item.syncStatus === "synced" || item.syncStatus === "error",
          );
          const localOnlyItems = allDbItems.filter(
            (item) =>
              item.syncStatus !== "synced" && item.syncStatus !== "error",
          );

          if (syncedItems.length > 0) {
            // Mark all synced items as pending delete in DB
            await Promise.all(
              syncedItems.map((item) =>
                clipboardDBService.updateSyncStatus(item.id, "pending_delete"),
              ),
            );

            // Trigger sync to delete from cloud
            sendSyncDeletion();
          }

          // Clear local-only items immediately from DB
          if (localOnlyItems.length > 0) {
            const localIds = localOnlyItems.map((i) => i.id);
            await clipboardDBService.deleteItems(localIds);
          }
        } else {
          // Clear locally only (everything)
          await clipboardDBService.clearAll();
        }

        // Update UI immediately (optimistic clear)
        items = [];
        totalFilteredCount = 0;
        hasMore = false;

        await sendUpdateBadge();

        showDeleteModal = false;
        toast.success("All items cleared");
      } catch (error) {
        console.error("Failed to clear items:", error);
        toast.error("Failed to clear items");
      }
    };
    showDeleteModal = true;
  }

  // Throttle scroll handler - re-evaluates position at timeout fire time (not event time)
  // This prevents stale `atBottom` captures from being used after async loads complete.
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  let itemsListContainer: HTMLElement;

  function isNearBottom(): boolean {
    if (!itemsListContainer) return false;

    return (
      itemsListContainer.scrollTop + itemsListContainer.clientHeight >=
      itemsListContainer.scrollHeight - 100
    );
  }

  let scrollSaveTimeout: number | undefined;
  let fabVisible = $state(true);

  function handleScroll() {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }

    if (itemsListContainer) {
      fabVisible = itemsListContainer.scrollTop < 50;
    }

    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;

      // Save scroll position when user scrolls
      if (itemsListContainer && itemsListContainer.scrollTop > 0) {
        clipboardItemLockService.setHasScrolled("sidepanel");
        clipboardItemLockService.setScrollPosition(
          Math.round(itemsListContainer.scrollTop),
          "sidepanel",
        );
      }

      if (isNearBottom()) {
        loadItems("append");
      }
    }, 150);
  }

  // Handle filter changes
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;

  function handleSearchChange() {
    const focusedEl =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (searchTimeout) clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
      const promise = loadItems("refresh");
      if (focusedEl) {
        promise.then(() => {
          if (document.body.contains(focusedEl)) {
            focusedEl.focus();
          }
        });
      }
    }, 300);
  }

  function handleFilterChange() {
    loadItems("refresh");
  }

  function handleFilterApply(filters: {
    dateFrom: number | null;
    dateTo: number | null;
    selectedTypes: Set<ItemType>;
    showFavoritesOnly: boolean;
    showSyncedOnly: boolean;
  }) {
    dateFrom = filters.dateFrom;
    dateTo = filters.dateTo;
    selectedTypes = new Set(filters.selectedTypes);
    showFavoritesOnly = filters.showFavoritesOnly;
    showSyncedOnly = filters.showSyncedOnly;
    itemsListContainer?.scrollTo({ top: 0 });
    handleFilterChange();
  }

  function toggleType(type: ItemType) {
    if (selectedTypes.has(type)) {
      selectedTypes.delete(type);
    } else {
      selectedTypes.add(type);
    }
    selectedTypes = new Set(selectedTypes);
    handleFilterChange();
  }

  function clearTypes() {
    selectedTypes.clear();
    selectedTypes = new Set();
    handleFilterChange();
  }

  const emptyStateMessage = $derived.by(() => {
    if (searchQuery)
      return `No items found against the keyword '${searchQuery}'`;
    if (dateFrom || dateTo) return "No items found in date range";
    if (showFavoritesOnly) return "No favorite items found";
    if (showSyncedOnly) return "No synced items found";
    if (selectedTypes.size > 0) return `No items found for selected types`;
    return "No clipboard items";
  });

  const emptyStateDescription = $derived.by(() => {
    if (
      searchQuery ||
      dateFrom ||
      dateTo ||
      showFavoritesOnly ||
      showSyncedOnly ||
      selectedTypes.size > 0
    ) {
      return "Try adjusting your search or filters";
    }
    return "Copy something to get started!";
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="clipboard-list-container">
  <!-- Search and Filters -->
  <div class="controls">
    {#if syncError}
      <Banner
        variant="error"
        message={syncError}
        dismissible={true}
        onDismiss={() => (syncError = null)}
      />
    {/if}

    {#if showPasswordError}
      <Banner
        variant="error"
        message="Your master password was incorrect and has been reset. Please enter the correct password to resume sync."
        dismissible={true}
        onDismiss={() => (showPasswordError = false)}
        confirmLabel="Fix Now"
        onConfirm={() => {
          showPasswordError = false;
          isFirstTimeSetup = false;
          showPasswordModal = true;
          pendingManualSync = true;
        }}
      />
    {/if}

    {#if pushServiceFailure}
      <PushWarningBanner
        ondismiss={() => {
          pushServiceFailure = false;
        }}
      />
    {/if}

    {#if showFilePermissionBanner && !isFileAccessAllowed}
      <Banner
        variant="info"
        message="Enable &quot;Allow access to file URLs&quot; to copy local images."
        dismissible={true}
        onDismiss={() => {
          showFilePermissionBanner = false;
          localStorage.setItem("file_permission_banner_dismissed", "true");
        }}
        confirmLabel="Enable Now"
        onConfirm={() => {
          chrome.tabs.create({
            url: `chrome://extensions/?id=${chrome.runtime.id}`,
          });
        }}
      />
    {/if}

    {#if showMpcCompletedBanner}
      <Banner
        variant="success"
        message="Master password change completed on another device. Set your new password and sync from cloud to restore your items."
        dismissible={true}
        onDismiss={() => {
          showMpcCompletedBanner = false;
          localStorage.setItem("mpc_completed_banner_dismissed", "true");
          mpcService.clearMpcCompleted();
        }}
      />
    {/if}

    <div class="search-row">
      <div class="search-bar">
        <Search size="14" />
        <input
          type="text"
          placeholder="Search clipboard..."
          maxlength="500"
          bind:value={searchQuery}
          bind:this={searchInput}
          oninput={handleSearchChange}
          disabled={loadingType === "init" || hasNoClipboardItems}
          title={loadingType === "init"
            ? "Loading..."
            : hasNoClipboardItems
              ? "No items to search"
              : "Search items"}
        />
        {#if searchQuery}
          <button
            class="clear-search visible"
            onclick={() => {
              searchQuery = "";
              handleSearchChange();
            }}
          >
            <X size="14" />
          </button>
        {/if}
      </div>
      <button
        class="filter-toggle"
        class:active={activeFilterCount() > 0}
        onclick={() => (showFilterModal = true)}
        title={loadingType === "init"
          ? "Loading..."
          : hasNoClipboardItems
            ? "No items to filter"
            : "Open Filters"}
        disabled={loadingType === "init" || hasNoClipboardItems}
      >
        <Filter size="14" />
        {#if activeFilterCount() > 0}
          <span class="filter-badge">{activeFilterCount()}</span>
        {/if}
      </button>
    </div>
    <div class="search-hint">
      Tip: Type <code>@img:</code>,
      <code>@url:</code>, or
      <code>@json:</code> to filter specific types.
    </div>

    {#if isSelectionMode}
      <div class="selection-bar" transition:slide={{ duration: 200 }}>
        <div class="actions-row">
          <button
            class="select-all-btn"
            onclick={selectAll}
            title="Select all loaded items"
          >
            <SquareCheck size={14} />
            <span class="btn-text">Select All</span>
          </button>

          <button
            class="unselect-btn"
            onclick={unselectAll}
            title="Unselect all"
          >
            <X size={14} />
            <span class="btn-text">Unselect ({selectedItems.size})</span>
          </button>

          {#if hasSelectedSyncedItems}
            <button
              class="bulk-unsync-btn"
              onclick={handleBulkUnsync}
              title={mpcStore.inProgress
                ? "Unavailable during master password change"
                : "Unsync selected"}
              disabled={mpcStore.inProgress}
            >
              <CloudOff size={14} />
              <span class="btn-text">Unsync</span>
            </button>
          {/if}

          <button
            class="bulk-delete-btn"
            onclick={handleBulkDelete}
            title={mpcStore.inProgress
              ? "Unavailable during master password change"
              : "Delete selected"}
            disabled={mpcStore.inProgress}
          >
            <Trash2 size={14} />
            <span class="btn-text">Delete</span>
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Items List -->
  <div
    class="items-list"
    onscroll={handleScroll}
    bind:this={itemsListContainer}
  >
    {#if items.length === 0 && (loadingType === "init" || isSyncing)}
      <div class="skeleton-grid">
        {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as _}
          <div class="skeleton-card">
            <div class="skeleton-shimmer"></div>
            <div class="skeleton-header">
              <div class="skeleton-checkbox"></div>
              <div class="skeleton-badge"></div>
              <div class="skeleton-time"></div>
            </div>
            <div class="skeleton-body">
              <div class="skeleton-line w-100"></div>
              <div class="skeleton-line w-75"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      {#if items.length === 0}
        <div class="empty-state">
          <Inbox class="w-16 h-16" />
          <h3>{emptyStateMessage}</h3>
          <p>{emptyStateDescription}</p>
        </div>
      {:else}
        <div class="items-grid">
          {#each items as item (item.id)}
            <ClipboardItem
              {item}
              selected={selectedItems.has(item.id)}
              {smartBlurEnabled}
              {smartBlurImagesEnabled}
              onCopy={handleCopy}
              onDelete={handleDelete}
              onToggleFavorite={handleToggleFavorite}
              onEdit={handleEdit}
              onView={handleView}
              onShare={handleShare}
              onSync={handleSync}
              onSelect={handleSelect}
              onLongPress={handleItemLongPress}
              {isSyncing}
              mpcInProgress={mpcStore.inProgress}
              {isSelectionMode}
            />
          {/each}
        </div>
      {/if}

      {#if loadingType === "append"}
        <div class="loading-indicator">
          <div class="spinner"></div>
          <span>Loading more...</span>
        </div>
      {/if}
    {/if}
  </div>

  <!-- FAB: Add New Item -->
  {#if (!syncModalStore.visible || syncModalStore.minimized) && !showAddModal}
    <button
      class="fab-button"
      class:fab-hidden={!fabVisible}
      onclick={() => (showAddModal = true)}
      title={loadingType === "init" ? "Loading..." : "Add new item"}
      disabled={loadingType === "init"}
      transition:scale={{ duration: 200 }}
    >
      <Plus class="w-6 h-6" />
    </button>
  {/if}

  <!-- Stats -->
  <div class="stats">
    <div class="stats-info">
      <span
        >Showing {items.length} of {totalFilteredCount}
        {searchQuery ||
        showFavoritesOnly ||
        showSyncedOnly ||
        selectedTypes.size > 0
          ? "matching "
          : ""}items</span
      >
      {#if searchQuery}
        <span>• Searching: "{searchQuery}"</span>
      {/if}
    </div>

    <div class="stats-actions">
      {#if selectionModeActive}
        <button
          class="cancel-selection-btn"
          onclick={cancelSelection}
          title="Exit selection mode"
        >
          <X size={14} />
          <span class="btn-text">Cancel Selection</span>
        </button>
      {:else}
        <button
          class="select-btn"
          onclick={enterSelectionMode}
          title="Select items for bulk actions"
        >
          <SquareCheck size={14} />
          <span class="btn-text">Select</span>
        </button>
      {/if}

      <button
        class="lock-now-btn"
        class:pin-set={isPinSet}
        onclick={handleLockNow}
        title={mpcStore.inProgress
          ? "Unavailable during master password change"
          : "Lock Now"}
        disabled={isLocking ||
          lockStore.isLocked ||
          loadingType === "init" ||
          isSelectionMode ||
          mpcStore.inProgress}
      >
        {#if isLocking}
          <Spinner size={14} />
        {:else}
          <Lock size={14} />
        {/if}
        <span class="btn-text">Lock Now</span>
      </button>

      <button
        class="clear-all-tiny"
        onclick={clearAll}
        title={mpcStore.inProgress
          ? "Unavailable during master password change"
          : "Clear all clipboard items"}
        disabled={isSelectionMode ||
          loadingType === "init" ||
          mpcStore.inProgress}
      >
        <Trash2 size={14} />
        <span class="btn-text">Clear</span>
      </button>

      {#if authStore.isAuthenticated}
        {#if !masterPasswordSet}
          <button
            class="set-master-pass-btn"
            onclick={() => {
              isFirstTimeSetup = !authStore.hasSyncedItems;
              showPasswordModal = true;
            }}
            title={isSelectionMode
              ? "Unavailable in selection mode"
              : "Set a master password to enable syncing"}
            disabled={isSelectionMode}
          >
            <Lock size={14} />
            <span class="btn-text">Set Master Pass</span>
          </button>
        {:else if mpcStore.inProgress && mpcStore.backgroundMode}
          <button
            class="sync-status-trigger is-syncing"
            onclick={() => {
              mpcStore.setBackgroundMode(false);
              mpcService.setBackgroundMode(false);
            }}
            title={mpcTooltip}
          >
            <Spinner size={14} />
            <span class="btn-text">MPC Running</span>
          </button>
        {:else}
          <button
            class="sync-status-trigger"
            class:has-changes={!autoSync && hasNewCloudItems && !isSyncing}
            class:is-syncing={isSyncing}
            class:is-paused={syncState === "paused"}
            onclick={() => {
              if (isSelectionMode) return;
              if (isSyncing) {
                syncModalStore.toggleMinimize();
                return;
              }
              handleManualSync();
            }}
            title={loadingType === "init"
              ? "Loading..."
              : isSelectionMode
                ? "Unavailable in selection mode"
                : mpcStore.inProgress
                  ? "Unavailable during master password change"
                  : syncState === "paused"
                    ? "Sync paused - tap to resume"
                    : syncState === "waiting"
                      ? "Waiting for network connectivity..."
                      : isSyncing && syncModalStore.progress
                        ? syncModalStore.progress.message || "Syncing..."
                        : isSyncing
                          ? "Syncing..."
                          : !autoSync && hasNewCloudItems
                            ? "Changes available in cloud"
                            : "Sync Now"}
            disabled={loadingType === "init" ||
              isSelectionMode ||
              mpcStore.inProgress}
          >
            {#if syncState === "paused"}
              <RefreshCw size={14} />
              <span class="btn-text">Resume Sync</span>
            {:else if syncState === "waiting"}
              <Spinner size={14} />
              <span class="btn-text">Waiting for network...</span>
            {:else if isSyncing}
              <Spinner size={14} />
              <span class="btn-text">Syncing...</span>
            {:else}
              <RefreshCw size={14} />
              <span class="btn-text">Sync Now</span>
            {/if}
          </button>
        {/if}
      {/if}
    </div>
  </div>

  <EditClipboardModal
    bind:show={showEditModal}
    item={editingItem}
    onSave={handleSaveEdit}
    onClose={async () => {
      if (editingItem) {
        const lockOwner = $isFloatingStore
          ? LockOwner.FLOATING_WINDOW
          : LockOwner.SIDEBAR;
        await clipboardItemLockService.clearItemLock(editingItem.id, lockOwner);
      }
      showEditModal = false;
      editingItem = null;
    }}
  />

  <ViewClipboardModal
    bind:show={showViewModal}
    item={viewingItem}
    onClose={() => {
      showViewModal = false;
      viewingItem = null;
    }}
  />

  <AddClipboardModal
    bind:show={showAddModal}
    onSave={handleAdd}
    onClose={() => {
      showAddModal = false;
    }}
  />

  <ShareItemModal
    bind:show={showShareModal}
    item={sharingItem}
    onClose={() => {
      showShareModal = false;
      sharingItem = null;
    }}
  />

  {#if showSyncDirectionModal}
    <SyncDirectionModal
      onConfirm={performSync}
      onCancel={() => (showSyncDirectionModal = false)}
    />
  {/if}

  <E2EPasswordModal
    show={showPasswordModal}
    isFirstTime={isFirstTimeSetup}
    onSubmit={handlePasswordSubmit}
    onCancel={() => {
      showPasswordModal = false;
      pendingSyncItemId = null;
      pendingManualSync = false;
    }}
    error={passwordError}
    isLoading={isVerifyingPassword}
    title={isFirstTimeSetup
      ? "Set Master Encryption Password"
      : pendingManualSync
        ? "Unlock Clipboard"
        : "Enter Master Password"}
    description={isFirstTimeSetup
      ? "Set a master password to encrypt your clipboard items before syncing to the cloud."
      : pendingManualSync
        ? "Enter your master password to unlock and sync your clipboard."
        : "Enter your master password to sync this item to the cloud."}
  />

  <ConfirmModal
    show={showConfirmModal}
    title={confirmTitle}
    message={confirmMessage}
    variant={confirmVariant}
    onConfirm={onConfirmAction}
    onCancel={() => (showConfirmModal = false)}
  />

  <DeleteConfirmModal
    show={showDeleteModal}
    title={deleteModalTitle}
    message={deleteModalMessage}
    itemCount={deleteItemCount}
    isLoggedIn={authStore.isAuthenticated}
    onConfirm={onDeleteConfirm}
    onCancel={() => (showDeleteModal = false)}
  />

  {#if showLockPinModal}
    <PinEntryModal
      title="Lock App"
      description="Enter your PIN to lock the app"
      submitButtonText="Lock Now"
      isLoading={isLocking}
      error={pinEntryError}
      onInputChange={() => (pinEntryError = null)}
      onSubmit={handleLockSubmit}
      onCancel={() => (showLockPinModal = false)}
    />
  {/if}

  {#if showPinSetupModal}
    <PinSetupModal
      onsetup={handlePinSetupComplete}
      oncancel={() => (showPinSetupModal = false)}
    />
  {/if}

  <FilterModal
    show={showFilterModal}
    filterState={{
      dateFrom,
      dateTo,
      selectedTypes,
      showFavoritesOnly,
      showSyncedOnly,
    }}
    onApply={handleFilterApply}
    onClose={() => (showFilterModal = false)}
  />
</div>
