<script lang="ts">
  import { onMount } from "svelte";
  import { pMap } from "@shared/utils/concurrency.util";
  import { toast } from "svelte-sonner";
  import {
    RefreshCw,
    Lock,
    Cloud,
    CloudOff,
    Shield,
    Info,
    CircleAlert,
    AlertCircle,
    FileBraces,
    FileSpreadsheet,
    ChevronDown,
  } from "lucide-svelte";
  import Toggle from "./Toggle.svelte";
  import E2EPasswordModal from "./E2EPasswordModal.svelte";
  import ChangePasswordModal from "./ChangePasswordModal.svelte";
  import PinSetupModal from "./PinSetupModal.svelte";
  import PinEntryModal from "./PinEntryModal.svelte";
  import KeyboardShortcutRecorder from "./KeyboardShortcutRecorder.svelte";
  import SyncDirectionModal from "./SyncDirectionModal.svelte";
  import Spinner from "./Spinner.svelte";
  import { authStore } from "../stores/auth.svelte";
  import Banner from "./Banner.svelte";
  import ConfirmModal from "./ConfirmModal.svelte";
  import { slide } from "svelte/transition";
  import { upgradeModalStore } from "@/stores/upgrade-modal.svelte";
  import { authModalStore } from "@/stores/auth-modal.svelte";
  import { syncModalStore } from "@/stores/sync.modal.svelte";
  import { lockStore } from "@/stores/lock.svelte";
  import { mpcStore } from "@/stores/mpc.svelte";
  import { mpcService, MPCPhase } from "@shared/services/mpc.service";
  import { PlanAbility } from "@shared/enums";
  import { PasswordSetupIntent, SyncStage } from "@shared/enums";
  import { MessageType } from "@shared/types";
  import {
    sendSettingsUpdated,
    sendToggleAutoSync,
    sendSetMasterPassword,
    sendVerifyCloudPassword,
    sendManualSync,
    sendLock,
    sendLocked,
    sendVerifyPin,
    sendUpdateBadge,
    sendUpdated,
    sendForgetMasterPassword,
    sendMpcStart,
  } from "@shared/utils/message.utils";
  import type { ChangePasswordPayload } from "@shared/types/settings.types";
  import type { KeyboardShortcut } from "@shared/types/shortcut.types";
  import {
    DEFAULT_CB_PALETTE_SHORTCUT,
    STORAGE_KEY_CB_PALETTE_SHORTCUT,
    DEFAULT_ELEMENT_PICKER_SHORTCUT,
    STORAGE_KEY_ELEMENT_PICKER_SHORTCUT,
    DEFAULT_FILTER_SHORTCUT,
    STORAGE_KEY_FILTER_SHORTCUT,
  } from "@shared/types/shortcut.types";

  import {
    lockService,
    clipboardDBService,
    storageService,
    syncService,
    localSettingsService,
    clipboardPushService,
  } from "@shared/services";
  import type { SettingsTab } from "@shared/services/local-settings.service";
  import { MasterPassUtils } from "@shared/utils/master-pass.utils";
  import { EncryptionUtils } from "@shared/utils/encryption.utils";
  import { formatBytes } from "@shared/utils/format.util";
  import { getErrorMessage } from "../utils/error-handler.util";
  import {
    BlobWriter,
    TextReader,
    ZipWriter,
    configure,
    ZipReader,
    BlobReader,
    TextWriter,
  } from "@zip.js/zip.js";

  import "@/styles/components/settings-page.scss";

  // Clipboard settings
  let isMonitoringEnabled = $state(true);
  let itemsPerPage = $state(50);
  let maxHistory = $state(1000);
  let totalItemsCount = $state(0);
  let totalItemsSize = $state(0);
  let showNotificationOnSync = $state(true);
  let isFileAccessAllowed = $state(true);
  let autoCleanupDays = $state(0);
  let smartBlurConfidential = $state(true);
  let smartBlurImages = $state(false);
  let autoWriteSyncToClipboard = $state(false);

  // Cloud Sync state
  let autoSync = $state(false);
  let lastSyncAt = $state<number>(0);
  let pendingCount = $state(0);
  let errorCount = $state(0);
  let syncedCount = $state(0);
  let isSyncing = $state(false);
  let hasPendingCloudItems = $state(false);
  let masterPasswordSet = $state(false);
  let hasStoredPassword = $state(false);
  let disableImageSync = $state(false);
  let disableUploadToCloud = $state(false);

  // ... (lines 72-207 omitted)

  let importFile = $state<File | null>(null);
  let isImporting = $state(false);
  let importFileInput = $state<HTMLInputElement | null>(null);

  // Lock progress state
  let lockProgress = $state({ current: 0, total: 0 });
  let settingsLoaded = $state(false);

  // Password modal intent state
  let passwordSetupIntent = $state<PasswordSetupIntent>(
    PasswordSetupIntent.SETUP_ONLY,
  );
  let showChangePasswordModal = $state(false);
  let changePasswordError = $state("");

  // Password change loading state
  let isChangingPassword = $state(false);
  let isExporting = $state(false);
  let exportFormat = $state<"json" | "csv">("json");
  let showExportDropdown = $state(false);

  // Sync Progress State
  let syncSource = $state<"auto" | "manual">("auto");
  const manualProgressVisible = $state(false);
  let syncProgress = $state<{
    stage: string;
    current: number;
    total: number;
    message?: string;
  }>({ stage: "", current: 0, total: 0 });

  // Password modal
  let showPasswordModal = $state(false);
  let isFirstTimeSetup = $state(true);
  let passwordError = $state<string | null>(null);
  let isValidatingPassword = $state(false);

  // E2E Modal Customization State
  let modalTitle = $state<string | undefined>(undefined);
  let modalDescription = $state<string | undefined>(undefined);
  let modalPasswordLabel = $state("Master Password");
  let modalConfirmPasswordLabel = $state("Confirm Password");
  let modalPasswordPlaceholder = $state<string | undefined>(undefined);
  let modalConfirmPasswordPlaceholder = $state<string | undefined>(undefined);
  let modalSubmitBtnText = $state<string | undefined>(undefined);
  let modalShowHints = $state(true);
  let modalHint1 = $state<string | undefined>(undefined);
  let modalHint2 = $state<string | undefined>(undefined);

  // PIN Lock state
  let isPinSet = $state(false);
  let isLocked = $state(false);
  let autoLockMinutes = $state(0);
  let showPinSetupModal = $state(false);
  let showLockPinModal = $state(false);
  let isLocking = $state(false);
  let pinEntryError = $state<string | null>(null);

  // Clipboard Palette Shortcut state
  let cbPaletteShortcut = $state<KeyboardShortcut>(DEFAULT_CB_PALETTE_SHORTCUT);

  let elementPickerShortcut = $state<KeyboardShortcut>(
    DEFAULT_ELEMENT_PICKER_SHORTCUT,
  );

  let filterShortcut = $state<KeyboardShortcut>(DEFAULT_FILTER_SHORTCUT);

  let showSyncDirectionModal = $state(false);
  let showForgetPasswordConfirm = $state(false);

  // Check if user has sync ability

  // Tab State
  let activeTab = $state<SettingsTab>("General");

  const tabs: SettingsTab[] = [
    "General",
    "Cloud Sync",
    "Data Management",
    "Lock",
  ];

  // Check if user has sync ability
  const hasSyncAbility = $derived(
    authStore.hasAbility(PlanAbility.CLIPBOARD_SYNC),
  );

  const hasPinLockAbility = $derived(
    authStore.hasAbility(PlanAbility.PIN_LOCK),
  );

  const hasAutoSyncAbility = $derived(
    authStore.hasAbility(PlanAbility.AUTO_SYNC),
  );

  const hasFloatingWindowAbility = $derived(
    authStore.hasAbility(PlanAbility.FLOATING_WINDOW),
  );

  const hasAutoLockAbility = $derived(
    authStore.hasAbility(PlanAbility.AUTO_LOCK),
  );

  // Get max clipboard items limit from subscription
  const maxClipboardItemsLimit = $derived(
    authStore.subscription?.planDetails?.maxClipboardItemsLimit ?? 100,
  );

  // Format last sync time
  const lastSyncText = $derived.by(() => {
    if (!lastSyncAt) return "Never synced";
    const now = Date.now();
    const diff = now - lastSyncAt;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  });

  $effect(() => {
    // Reset syncSource to auto when manual progress finishes
    if (!manualProgressVisible && !isSyncing && syncSource === "manual") {
      // Small delay to ensure UI transition completes
      setTimeout(() => {
        syncSource = "auto";
      }, 500);
    }
  });

  onMount(() => {
    // Load initial data
    loadSettings();
    loadSyncSettings();
    loadLockSettings();
    loadCbPaletteShortcut();
    loadElementPickerShortcut();
    loadFilterShortcut();
    loadStorageStats();

    // Restore last active tab from session storage
    localSettingsService.getActiveSettingsTab().then((saved) => {
      if (saved) activeTab = saved;
    });

    // Check for file scheme access
    if (chrome.extension?.isAllowedFileSchemeAccess) {
      chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
        isFileAccessAllowed = isAllowed;
      });
    }

    // Listen for sync events
    const messageListener = (message: any) => {
      if (message.type === MessageType.CLIPBOARD_SYNCED) {
        loadSyncSettings();
        loadStorageStats();
      } else if (message.type === MessageType.CLIPBOARD_UPDATED) {
        loadStorageStats();
      } else if (
        message.type === MessageType.CLIPBOARD_LOCKED ||
        message.type === MessageType.CLIPBOARD_UNLOCKED
      ) {
        loadLockSettings();
      } else if (message.type === MessageType.LOCK_PROGRESS) {
        lockProgress = message.payload;
      } else if (message.type === MessageType.SYNC_PROGRESS) {
        const stage = message.syncProgress?.stage;
        syncProgress = message.syncProgress;
        if (
          [
            SyncStage.DOWNLOADING,
            SyncStage.DECRYPTING,
            SyncStage.PROCESSING,
            SyncStage.SYNCING,
            SyncStage.UPLOADING,
            SyncStage.SAVING,
            SyncStage.THUMBNAIL_GENERATING,
            SyncStage.WAITING_FOR_CONNECTIVITY,
          ].includes(stage)
        ) {
          isSyncing = true;
        } else if (
          stage === SyncStage.COMPLETE ||
          stage === SyncStage.ERROR ||
          stage === SyncStage.PAUSED
        ) {
          isSyncing = false;
          loadSyncSettings();
        }
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(messageListener);

    // Refresh status periodically
    const interval = setInterval(() => {
      loadSyncSettings();
      loadStorageStats();
    }, 30000);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      clearInterval(interval);
    };
  });

  async function loadSettings() {
    const settings = await localSettingsService.getSettings();
    isMonitoringEnabled = settings.monitoringEnabled ?? true;
    itemsPerPage = settings.itemsPerPage ?? 50;
    maxHistory = settings.maxHistory ?? 1000;
    showNotificationOnSync = settings.showNotificationOnSync ?? true;
    autoCleanupDays = settings.autoCleanupDays ?? 0;
    smartBlurConfidential = settings.smartBlurConfidential ?? true;
    smartBlurImages = settings.smartBlurImages ?? false;
    autoWriteSyncToClipboard = settings.autoWriteSyncToClipboard ?? false;
    settingsLoaded = true;
  }

  async function loadStorageStats() {
    try {
      totalItemsCount = await clipboardDBService.getCount();
      totalItemsSize = await clipboardDBService.getTotalSize();
    } catch (e) {
      console.error("[SettingsPage] Failed to load storage stats:", e);
    }
  }

  // Load sync settings
  async function loadSyncSettings() {
    try {
      const settings = await storageService.get([
        "clipboardAutoSync",
        "clipboardMasterPasswordSet",
        "hasPendingCloudItems",
        "e2eMasterPasswordEncrypted",
        "clipboardDisableImageSync",
        "clipboardDisableUploadToCloud",
        "totalCloudItems",
        "lastSyncTimestamp",
      ]);
      autoSync = settings.clipboardAutoSync || false;

      // Force autoSync to false if not authenticated or master password not set
      if (!authStore.isAuthenticated || !settings.clipboardMasterPasswordSet) {
        autoSync = false;
        if (settings.clipboardAutoSync) {
          await storageService.set({ clipboardAutoSync: false });
        }
      }

      masterPasswordSet = settings.clipboardMasterPasswordSet || false;
      hasPendingCloudItems = settings.hasPendingCloudItems || false;
      disableImageSync = settings.clipboardDisableImageSync || false;
      disableUploadToCloud = settings.clipboardDisableUploadToCloud || false;
      lastSyncAt = settings.lastSyncTimestamp || 0;

      // Check if password is actually persisted
      hasStoredPassword = !!settings.e2eMasterPasswordEncrypted;

      // Get sync status from DB
      const pendingItems = await clipboardDBService.getPendingSyncItems();
      pendingCount = pendingItems.length;

      // We don't have a direct error count index, but we can check items with syncStatus = 'error'
      // This might be expensive if many items, but for now reasonable.
      // Alternatively keep a separate counter.
      // Let's iterate all items and count (not ideal but safe for now)
      // Or better, add getErrorSyncItems to DB service later.
      // For now, let's just count pending which is more important.
      errorCount = 0; // Placeholder until DB service supports error count

      // Get synced count from IndexedDB (local synced copy)
      const localSyncedCount = await clipboardDBService.getSyncedCount();

      // Use the larger of local synced count or reported cloud count
      // This ensures we show the total cloud items even if not all downloaded yet
      const cloudTotal = settings.totalCloudItems || 0;
      syncedCount = Math.max(localSyncedCount, cloudTotal);
    } catch (error) {
      console.error("[SettingsPage] Failed to load sync settings:", error);
    }
  }

  async function toggleMonitoring(checked: boolean) {
    await saveSettings();
    sendSettingsUpdated();
  }

  async function toggleNotificationOnSync(checked: boolean) {
    await saveSettings();
  }

  async function toggleSmartBlur(checked: boolean) {
    await saveSettings();
    sendSettingsUpdated();
  }

  async function toggleSmartBlurImages(checked: boolean) {
    await saveSettings();
    sendSettingsUpdated();
  }

  async function toggleAutoWriteSyncToClipboard(checked: boolean) {
    await saveSettings();
    sendSettingsUpdated();
  }

  async function saveItemsPerPage() {
    await saveSettings();
  }

  async function toggleImageSync(checked: boolean) {
    await storageService.set({
      clipboardDisableImageSync: disableImageSync,
    });
  }

  async function toggleUploadToCloud(checked: boolean) {
    await storageService.set({
      clipboardDisableUploadToCloud: disableUploadToCloud,
    });
  }

  async function saveSettings() {
    // Validate maxHistory to reasonable limits
    if (maxHistory < 0) maxHistory = 0;
    if (maxHistory > 10000) maxHistory = 10000;
    await storageService.setSettings({
      monitoringEnabled: isMonitoringEnabled,
      itemsPerPage: itemsPerPage,
      showNotificationOnSync: showNotificationOnSync,
      autoCleanupDays: autoCleanupDays,
      smartBlurConfidential: smartBlurConfidential,
      smartBlurImages: smartBlurImages,
      autoWriteSyncToClipboard: autoWriteSyncToClipboard,
    });
  }

  function openShortcutsPage() {
    chrome.tabs?.create({ url: "chrome://extensions/shortcuts" });
  }

  // Clipboard Palette Shortcut functions
  async function loadCbPaletteShortcut() {
    try {
      const shortcut = await storageService.getCbPaletteShortcut();
      if (shortcut) {
        cbPaletteShortcut = shortcut;
      }
    } catch (error) {
      console.error(
        "[SettingsPage] Failed to load cb palette shortcut:",
        error,
      );
    }
  }

  async function handleShortcutChange(newShortcut: KeyboardShortcut) {
    try {
      await storageService.setCbPaletteShortcut(newShortcut);
      cbPaletteShortcut = newShortcut;
      toast.success("Shortcut updated successfully");
    } catch (error) {
      console.error("[SettingsPage] Failed to save shortcut:", error);
      toast.error("Failed to save shortcut");
    }
  }

  async function resetShortcut() {
    try {
      await storageService.setCbPaletteShortcut(DEFAULT_CB_PALETTE_SHORTCUT);

      cbPaletteShortcut = DEFAULT_CB_PALETTE_SHORTCUT;

      toast.success("Shortcut reset to default (Alt+V)");
    } catch (error: any) {
      console.error("[SettingsPage] Failed to reset shortcut:", error);
      toast.error("Failed to reset shortcut");
    }
  }

  // Element Picker Shortcut functions
  async function loadElementPickerShortcut() {
    try {
      const shortcut = await storageService.getElementPickerShortcut();
      if (shortcut) {
        elementPickerShortcut = shortcut;
      }
    } catch (error) {
      console.error(
        "[SettingsPage] Failed to load element picker shortcut:",
        error,
      );
    }
  }

  async function handleElementPickerShortcutChange(
    newShortcut: KeyboardShortcut,
  ) {
    try {
      await storageService.setElementPickerShortcut(newShortcut);
      elementPickerShortcut = newShortcut;
      toast.success("Shortcut updated successfully");
    } catch (error) {
      console.error("[SettingsPage] Failed to save shortcut:", error);
      toast.error("Failed to save shortcut");
    }
  }

  async function resetElementPickerShortcut() {
    try {
      await storageService.setElementPickerShortcut(
        DEFAULT_ELEMENT_PICKER_SHORTCUT,
      );
      elementPickerShortcut = DEFAULT_ELEMENT_PICKER_SHORTCUT;
      toast.success("Picker shortcut reset to default (Alt+Shift+C)");
    } catch (error: any) {
      console.error("[SettingsPage] Failed to reset picker shortcut:", error);
      toast.error("Failed to reset picker shortcut");
    }
  }

  // Filter Shortcut functions
  async function loadFilterShortcut() {
    try {
      const shortcut = await storageService.getFilterShortcut();
      if (shortcut) {
        filterShortcut = shortcut;
      }
    } catch (error) {
      console.error("[SettingsPage] Failed to load filter shortcut:", error);
    }
  }

  async function handleFilterShortcutChange(newShortcut: KeyboardShortcut) {
    try {
      await storageService.setFilterShortcut(newShortcut);
      filterShortcut = newShortcut;
      toast.success("Shortcut updated successfully");
    } catch (error: any) {
      console.error("[SettingsPage] Failed to save shortcut:", error);
      toast.error("Failed to save shortcut");
    }
  }

  async function resetFilterShortcut() {
    try {
      await storageService.setFilterShortcut(DEFAULT_FILTER_SHORTCUT);
      filterShortcut = DEFAULT_FILTER_SHORTCUT;
      toast.success("Filter shortcut reset to default (Ctrl+Shift+F)");
    } catch (error: any) {
      console.error("[SettingsPage] Failed to reset filter shortcut:", error);
      toast.error("Failed to reset filter shortcut");
    }
  }

  // Cloud Sync functions
  async function toggleAutoSync(newValue?: boolean) {
    if (newValue === undefined) {
      newValue = !autoSync;
    }

    // Check if user is guest first
    if (authStore.isGuest) {
      autoSync = false; // Revert visually
      authModalStore.open("sync");
      return;
    }

    if (!authStore.isAuthenticated) {
      autoSync = false; // Revert visually
      toast.error("Please login to enable sync");
      return;
    }

    if (!hasSyncAbility) {
      autoSync = false; // Revert visually
      upgradeModalStore.open({
        featureName: "Clipboard Cloud Sync",
        description: "Upgrade to sync your clipboard across all devices!",
      });
      return;
    }

    // Check if master password is set and loaded
    // We need the password available to persist it securely for auto-sync
    const isPasswordLoaded = await MasterPassUtils.isPasswordLoaded();

    if (!masterPasswordSet || !isPasswordLoaded) {
      autoSync = false; // Revert visually until password is set/loaded
      isFirstTimeSetup = !masterPasswordSet && !authStore.hasSyncedItems;
      passwordSetupIntent = PasswordSetupIntent.AUTO_SYNC;
      showPasswordModal = true;
      return;
    }

    // Set source BEFORE toggling
    syncSource = "auto";

    const password = MasterPassUtils.getMasterPassword();

    // Utilize background message to handle toggle and socket connection together
    const toggleResult = await sendToggleAutoSync({
      enabled: newValue,
      password: password || undefined,
    });
    if (!toggleResult?.success) {
      autoSync = !newValue; // revert
      toast.error(toggleResult?.error || "Failed to toggle auto-sync");
      return;
    }

    autoSync = newValue;
    if (newValue) {
      hasStoredPassword = true; // Update local state immediately
      toast.success("Auto-sync enabled");
    } else {
      toast.info("Auto-sync disabled");
    }
  }

  // Manual sync
  async function handleManualSync(
    options: { forcePrompt?: boolean } | MouseEvent = { forcePrompt: true },
  ) {
    // Handle MouseEvent from button click or object parameter
    const forcePrompt =
      options instanceof MouseEvent ? true : (options?.forcePrompt ?? true);

    // Check if user is guest first
    if (authStore.isGuest) {
      if (forcePrompt) authModalStore.open("sync");
      return;
    }

    if (!authStore.isAuthenticated) {
      if (forcePrompt) toast.error("Please login to sync");
      return;
    }

    if (!hasSyncAbility) {
      if (forcePrompt) {
        upgradeModalStore.open({
          featureName: "Clipboard Cloud Sync",
          description: "Upgrade now!",
        });
      }
      return;
    }

    if (!masterPasswordSet) {
      if (forcePrompt) {
        isFirstTimeSetup = !authStore.hasSyncedItems;
        passwordSetupIntent = PasswordSetupIntent.MANUAL_SYNC;
        showPasswordModal = true;
      }
      return;
    }

    // CRITICAL FIX: Even if master password is set, it might not be loaded in memory (session).
    // If not loaded, we must prompt the user to unlock/enter it before syncing.
    const isPasswordLoaded = await MasterPassUtils.isPasswordLoaded();
    if (!isPasswordLoaded) {
      if (forcePrompt) {
        isFirstTimeSetup = false; // Not first time, just unlocking
        passwordSetupIntent = PasswordSetupIntent.MANUAL_SYNC; // Will trigger sync after unlock
        showPasswordModal = true;
      }
      return;
    }

    // Logic for skipping prompt when called from import
    if (!forcePrompt) {
      if (autoSync) {
        await performSync("bidirectional");
      }
      return;
    }

    // Check upload possibility
    const unsyncedItems = await clipboardDBService.getUnsyncedItems();
    const localAdditions = unsyncedItems.filter(
      (i) => i.syncStatus !== "pending_delete",
    );

    const storage = await storageService.get([
      "clipboardDisableUploadToCloud",
      "totalCloudItems",
    ]);

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
    isSyncing = true;
    try {
      // Set source explicitly
      syncSource = "manual";

      // Delegate to background
      const response = await sendManualSync(syncType);

      if (!response?.success) {
        throw new Error(response?.error || "Sync failed");
      }

      // Clear pending cloud items flag
      await storageService.set({ hasPendingCloudItems: false });

      await loadSyncSettings();
    } catch (error: any) {
      console.error("[SettingsPage] Sync failed:", error);
      toast.error(`Sync failed: ${getErrorMessage(error)}`);
    } finally {
      isSyncing = false;
    }
  }

  // Handle password submission
  async function handlePasswordSubmit(
    password: string,
    rememberPassword?: boolean,
  ) {
    // 1. Check for standalone export/import encryption intent first
    if (
      passwordSetupIntent === PasswordSetupIntent.EXPORT_FILE_ENCRYPTION ||
      passwordSetupIntent === PasswordSetupIntent.IMPORT_FILE_DECRYPTION
    ) {
      if (!password || password.length < 1) {
        passwordError = "Password cannot be empty";
        return;
      }
      if (passwordSetupIntent === PasswordSetupIntent.EXPORT_FILE_ENCRYPTION) {
        await performExport(password);
      } else if (
        passwordSetupIntent === PasswordSetupIntent.IMPORT_FILE_DECRYPTION
      ) {
        await performImport(password);
      }
      return;
    }

    passwordError = null;

    isValidatingPassword = true;
    try {
      // Always check server for existing items to validate against
      // This handles the case where a user moves to a new device/browser
      // and local flags (hasSyncedItems) are not yet set.
      let existingItems: any[] = [];
      try {
        const response = await syncService.fetchAllItems({ limit: 5 });
        existingItems = response.items || [];
      } catch (err) {
        console.warn(
          "[SettingsPage] Failed to fetch items for validation check:",
          err,
        );
        // If we can't reach server, we can't validate.
        // If we proceed, we might create a split-brain password.
        // But if it's just a network error on first setup?
        // Let's assume if fetch fails, we proceed with caution or rely on local state if existed.
        // For now, if fetch fails, we'll assume no items ONLY if we really don't have local synced items flag.
        if (authStore.hasSyncedItems) throw err; // If we SHOULD have items but can't fetch, stop.
      }

      if (existingItems.length > 0) {
        // Validation Mode: Verify against existing server items
        try {
          // Send to background for robust verification (handles legacy and new formats)
          const verifyResponse = await sendVerifyCloudPassword({ password });

          if (!verifyResponse?.success) {
            throw new Error(
              verifyResponse?.error || "Incorrect master password",
            );
          }

          // Success! Password is correct.
          // Set password locally in sidebar service (re-creates local hash/storage status)
          await MasterPassUtils.setMasterPassword(password);

          // CRITICAL: Propagate password to background memory
          const setResult = await sendSetMasterPassword({ password });
          if (!setResult?.success) {
            throw new Error(
              setResult?.error || "Failed to set master password in background",
            );
          }

          // Persist status
          await storageService.set({
            clipboardMasterPasswordSet: true,
            hasSyncedItems: true, // Update local flag
          });
          masterPasswordSet = true;
          showPasswordModal = false;

          // Resume flow
          if (passwordSetupIntent === PasswordSetupIntent.AUTO_SYNC) {
            const toggleResult = await sendToggleAutoSync({
              enabled: true,
              password,
            });
            if (!toggleResult?.success) {
              toast.error(toggleResult?.error || "Failed to enable auto-sync");
            } else {
              autoSync = true;
              hasStoredPassword = true;
            }
          } else if (passwordSetupIntent === PasswordSetupIntent.MANUAL_SYNC) {
            handleManualSync();
          } else if (passwordSetupIntent === PasswordSetupIntent.EXPORT) {
            // Should not happen here ideally as EXPORT intent handles its own flow below
            // But if we ever needed master password for export (e.g. to decrypt first)
            // then we might end up here.
            // However, our new flow separates "Decrypting Database" (Master Pass)
            // from "Encrypting Export" (Custom Pass).
            // So this path might be triggered if we need to decrypt DB first.
            handleExportWithDecryption(exportFormat);
          }
        } catch (err: any) {
          console.error("Validation failed:", err);
          // Clear the invalid password
          MasterPassUtils.clearPassword();
          passwordError =
            "Incorrect master password. Please use the password you used on your other devices.";
        }
      } else {
        // Setup Mode: Fresh password (No items on server)
        await MasterPassUtils.setMasterPassword(password);

        // Also send to background
        const setResult = await sendSetMasterPassword({ password });
        if (!setResult?.success) {
          toast.error(
            setResult?.error || "Failed to set master password in background",
          );
          return;
        }

        await storageService.set({
          clipboardMasterPasswordSet: true,
        });
        masterPasswordSet = true;
        showPasswordModal = false;

        // Handle based on intent
        if (passwordSetupIntent === PasswordSetupIntent.AUTO_SYNC) {
          const toggleResult = await sendToggleAutoSync({
            enabled: true,
            password,
          });
          if (!toggleResult?.success) {
            toast.error(toggleResult?.error || "Failed to enable auto-sync");
          } else {
            autoSync = true;
            toast.success("Master password set & Auto-sync enabled");
          }
        } else if (passwordSetupIntent === PasswordSetupIntent.MANUAL_SYNC) {
          toast.success("Master password set");
          handleManualSync();
        } else if (passwordSetupIntent === PasswordSetupIntent.EXPORT) {
          handleExportWithDecryption(exportFormat);
        } else {
          toast.success("Master password set successfully");
        }
      }
    } catch (error: any) {
      console.error("[SettingsPage] Password error:", error);
      passwordError = error.message || "Failed to set password";
    } finally {
      isValidatingPassword = false;
    }
  }

  // PIN Lock functions
  async function loadLockSettings() {
    try {
      isPinSet = await lockService.isPinSet();
      const settings = await lockService.getLockSettings();
      isLocked = settings.isLocked;
      autoLockMinutes = Number(settings.autoLockMinutes);
    } catch (error) {
      console.error("[SettingsPage] Failed to load lock settings:", error);
    }
  }

  function handleSetupPin() {
    if (authStore.isGuest) {
      authModalStore.open("lock");
      return;
    }

    if (!hasPinLockAbility) {
      upgradeModalStore.open({
        featureName: "PIN Lock",
        title: "Premium Feature",
        description:
          "Secure your clipboard with a 6-digit PIN. This premium feature ensures your sensitive data stays protected.",
      });
      return;
    }

    showPinSetupModal = true;
  }

  async function handlePinSetupComplete() {
    showPinSetupModal = false;
    await loadLockSettings();
    toast.success("PIN lock enabled");
  }

  async function handleLockNow() {
    if (authStore.isGuest) {
      authModalStore.open("lock");
      return;
    }

    if (!hasPinLockAbility) {
      upgradeModalStore.open({
        featureName: "PIN Lock",
        title: "Premium Feature",
        description:
          "Secure your clipboard with a 6-digit PIN. This premium feature ensures your sensitive data stays protected.",
      });
      return;
    }

    if (!isPinSet) {
      toast.error("Please set a PIN first");
      return;
    }

    showLockPinModal = true;
  }

  async function handleLockSubmit(pin: string) {
    if (!pin || pin.length !== 6) return;

    isLocking = true;
    pinEntryError = null;

    // Step 1: Verify PIN first (modal stays open)
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

    // Step 2: PIN valid - close modal and start locking
    showLockPinModal = false;
    lockProgress = { current: 0, total: 0 };

    try {
      const response = await sendLock({ pin });

      if (!response || !response.success) {
        throw new Error(response?.error || "Lock failed");
      }

      await loadLockSettings();
      lockStore.setLocked(true);

      toast.success("Clipboard locked");

      sendLocked();
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    } finally {
      isLocking = false;
      lockProgress = { current: 0, total: 0 };
    }
  }

  async function handleAutoLockChange() {
    const minutes = Number(autoLockMinutes);

    if (authStore.isGuest) {
      autoLockMinutes = 0;
      authModalStore.open("lock");
      return;
    }

    if (minutes > 0 && !hasAutoLockAbility) {
      autoLockMinutes = 0;
      upgradeModalStore.open({
        featureName: "Auto-Lock",
        title: "Premium Feature",
        description:
          "Automatically lock your clipboard after a period of inactivity. This premium feature requires an active subscription.",
      });
      return;
    }

    try {
      await lockService.setAutoLock(minutes);
      toast.success(`Auto-lock ${minutes > 0 ? "enabled" : "disabled"}`);
    } catch (error: any) {
      console.error("[SettingsPage] Failed to set auto-lock:", error);
      toast.error("Failed to update auto-lock");
    }
  }

  function openSetMasterPassword() {
    if (!authStore.isAuthenticated) return;
    isFirstTimeSetup = true;
    passwordSetupIntent = PasswordSetupIntent.SETUP_ONLY;
    showPasswordModal = true;
  }

  function openChangeMasterPassword() {
    // Check if user is guest first
    if (authStore.isGuest) {
      authModalStore.open("sync");
      return;
    }

    if (!authStore.isAuthenticated) {
      toast.error("Please login to change password");
      return;
    }

    if (
      (mpcStore.inProgress || mpcStore.currentPhase === MPCPhase.ERROR) &&
      mpcStore.currentPhase !== MPCPhase.COMPLETE
    ) {
      handleShowMPCOverlay();
      return;
    }

    showChangePasswordModal = true;
  }

  async function handleChangePasswordSubmit(data: ChangePasswordPayload) {
    if (isChangingPassword) return;
    changePasswordError = "";
    isChangingPassword = true;
    try {
      if (data.mode === "reset") {
        await storageService.clearE2EPasswordData();
        await MasterPassUtils.removeMasterPasswordFromStorage();
        MasterPassUtils.clearPassword();

        if (data.newPassword) {
          await MasterPassUtils.setMasterPassword(data.newPassword);
          await sendSetMasterPassword({ password: data.newPassword });
        }

        try {
          const { items } = await syncService.fetchAllItems({
            limit: 1000,
          });
          const senderEndpoint =
            await clipboardPushService.getSubscriptionEndpoint();
          for (const item of items) {
            if (item._id)
              await syncService.deleteFromCloud(
                item._id,
                senderEndpoint || undefined,
              );
          }
        } catch (e) {
          console.warn("Failed to wipe cloud items during reset", e);
        }

        await storageService.set({
          clipboardAutoSync: false,
        });

        masterPasswordSet = data.newPassword ? true : false;
        autoSync = false;
        showChangePasswordModal = false;
        toast.success("Password reset successfully.");
      } else {
        // First verify password via background (modal stays open on failure)
        const verifyResult = await chrome.runtime.sendMessage({
          type: MessageType.VERIFY_MASTER_PASS,
          payload: { password: data.currentPassword },
        });

        if (!verifyResult?.success) {
          toast.error("Current password is incorrect");
          return;
        }

        // Password verified - show overlay, close modal, start MPC
        mpcStore.update({
          inProgress: true,
          phase: MPCPhase.DOWNLOADING,
          message: "Downloading items from cloud",
          progressPercentage: 5,
          subMessage: "",
          error: "",
          startedAt: Date.now(),
          browserId: "",
        });
        showChangePasswordModal = false;

        // Store password in memory for potential retry
        mpcService.setRetryPassword(data.newPassword);

        const response = await sendMpcStart({
          newPassword: data.newPassword,
        });

        if (!response?.success) {
          return;
        }

        toast.success("Password changed & data re-encrypted");
      }
    } catch (error: any) {
      console.error("Failed to change password:", error);
      toast.error(getErrorMessage(error));
    } finally {
      isChangingPassword = false;
    }
  }

  async function handleForgetPassword() {
    showForgetPasswordConfirm = true;
  }

  async function handleShowMPCOverlay() {
    mpcStore.setBackgroundMode(false);
    await mpcService.setBackgroundMode(false);
  }

  async function handleRetryMPC() {
    sendMpcStart({ newPassword: "" }).catch(() => {});
  }

  async function handleForgetPasswordConfirm() {
    showForgetPasswordConfirm = false;
    try {
      await MasterPassUtils.forgetMasterPassword();

      // Also send to background
      const forgetResult = await sendForgetMasterPassword();
      if (!forgetResult?.success) {
        toast.error(forgetResult?.error || "Failed to forget master password");
        return;
      }

      // Disable auto-sync locally and in storage
      await storageService.set({
        clipboardAutoSync: false,
      });

      autoSync = false;
      masterPasswordSet = false;
      hasStoredPassword = false;

      toast.success("Master password forgotten. Auto-sync disabled.");
    } catch (error: any) {
      console.error("Failed to forget password:", error);
      toast.error("Failed to forget password");
    }
  }

  async function handleExport(format: "json" | "csv") {
    // [ABILITY CHECK] Enforce Export Capability
    if (authStore.isGuest) {
      authModalStore.open();
      return;
    }

    if (format === "json" && !authStore.hasAbility(PlanAbility.EXPORT_JSON)) {
      upgradeModalStore.open({
        featureName: "Export JSON",
        title: "Premium Feature",
        description:
          "Exporting your clipboard history to JSON is a premium feature. Upgrade to unlock.",
      });
      return;
    }

    if (format === "csv" && !authStore.hasAbility(PlanAbility.EXPORT_CSV)) {
      upgradeModalStore.open({
        featureName: "Export CSV",
        title: "Premium Feature",
        description:
          "Exporting your clipboard history to CSV is a premium feature. Upgrade to unlock.",
      });
      return;
    }

    exportFormat = format;

    // Skip checking for master password based on user feedback.
    // Export should proceed with whatever is available (unencrypted local items).
    // If items are encrypted and app is locked, they will simply fail decryption during export iteration.

    // Proceed directly to File Password setup
    passwordSetupIntent = PasswordSetupIntent.EXPORT_FILE_ENCRYPTION;
    resetModalCustomization(); // Reset modal to default then apply export customizations
    modalTitle = "Secure Export File";
    modalDescription = "Set a password for the exported ZIP file.";
    modalPasswordLabel = "File Password";
    modalConfirmPasswordLabel = "Confirm File Password";
    modalSubmitBtnText = "Export & Download";
    modalShowHints = false;

    // We don't need to ask for "existing" password, we are setting a NEW one for the file
    isFirstTimeSetup = true;
    showPasswordModal = true;
  }

  function resetModalCustomization() {
    modalTitle = undefined;
    modalDescription = undefined;
    modalPasswordLabel = "Master Password";
    modalConfirmPasswordLabel = "Confirm Password";
    modalPasswordPlaceholder = undefined;
    modalConfirmPasswordPlaceholder = undefined;
    modalSubmitBtnText = undefined;
    modalShowHints = true;
    modalHint1 = undefined;
    modalHint2 = undefined;
  }

  // Intermediate step: We have master password (or data is decrypted), now we act.
  async function handleExportWithDecryption(format: "json" | "csv") {
    // Now that we are ready to export, we need to ask for the EXPORT FILE password.
    // We will re-use the modal but with "First Time" styling to force confirmation.

    // Configure modal for Export Password
    isFirstTimeSetup = true; // Force confirm password
    passwordSetupIntent = PasswordSetupIntent.EXPORT_FILE_ENCRYPTION; // New intent

    modalTitle = "Secure Export File";
    modalDescription =
      "Set a password to lock your export file. You will need this password to open the file.";
    modalPasswordLabel = "File Password";
    modalConfirmPasswordLabel = "Confirm File Password";
    modalPasswordPlaceholder = "Enter password for this file";
    modalConfirmPasswordPlaceholder = "Confirm password";
    modalSubmitBtnText = "Export & Download";
    modalShowHints = true;
    modalHint1 =
      "The exported data will be inside a password-protected ZIP file.";
    modalHint2 =
      "Important: If you forget this password, you cannot open the exported file.";

    showPasswordModal = true;
  }

  // Handle the actual export after we get the file password
  async function performExport(filePassword: string) {
    if (!filePassword) return;

    isExporting = true;
    showPasswordModal = false;
    resetModalCustomization(); // Reset for next use

    // Disable web workers for zip.js to prevent hanging in extension environment
    configure({ useWebWorkers: false });

    try {
      // 1. Fetch all items
      const items = await clipboardDBService.getAllItems();
      const decryptedItems = await pMap(
        items,
        async (item: any) => {
          try {
            let content = item.content;
            const password = MasterPassUtils.getMasterPassword()!;
            if (item.isEncrypted && item.encryptionData) {
              content = await EncryptionUtils.decrypt(
                {
                  ...item.encryptionData,
                  ciphertext: item.content,
                },
                password,
              );
            }
            return {
              ...item,
              content,
              // Remove internal fields
              isEncrypted: false,
              encryptionData: undefined,
              // Sanitize sensitive metadata during export to prevent conflicts on re-import
              _id: undefined,
              isSynced: false,
              syncStatus: undefined,
              lastSyncedAt: undefined,
              failedSyncAttempts: undefined,
              lastSyncError: undefined,
            };
          } catch (e) {
            console.warn("Failed to decrypt item for export:", item.id);
            // Include with error note
            return {
              ...item,
              _exportError: "Decryption failed",
            };
          }
        },
        { concurrency: 10 },
      );

      // 3. Format Data
      let dataToEncrypt = "";
      let mimeType = "";
      let extension = "";

      if (exportFormat === "json") {
        dataToEncrypt = JSON.stringify(decryptedItems, null, 2);
        mimeType = "application/json";
        extension = "json";
      } else {
        // CSV Format
        const headers = [
          "ID",
          "Type",
          "Content",
          "Created At",
          "Is Favorite",
          "Tags",
        ];
        const rows = decryptedItems.map((item) => {
          // Escape quotes and wrap in quotes
          const escape = (text: any) => {
            if (text === null || text === undefined) return "";
            const str = String(text);
            return `"${str.replace(/"/g, '""')}"`; // CSV escaping: " -> ""
          };

          return [
            escape(item.id),
            escape(item.type),
            escape(item.content),
            escape(new Date(item.createdAt).toISOString()),
            escape(item.isFavorite),
            escape(item.tags.join(",")),
          ].join(",");
        });
        dataToEncrypt = [headers.join(","), ...rows].join("\n");
        mimeType = "text/csv";
        extension = "csv";
      }

      // 4. Create Password-Protected ZIP
      const dateStr = new Date().toISOString().slice(0, 10);
      const innerFilename = `clipboard-export-${dateStr}.${extension}`;
      const zipFilename = `clipboard-export-${dateStr}.zip`;

      const zipWriter = new ZipWriter(new BlobWriter("application/zip"), {
        password: filePassword,
        zipCrypto: false, // Use AES-256 (default if false? wait, library defaults might differ)
        // actually @zip.js/zip.js uses AES 256 by default if encryption is enabled via password
        // except if useWebWorkers is involved sometimes.
        // Let's rely on default strong encryption.
      });

      await zipWriter.add(innerFilename, new TextReader(dataToEncrypt));
      const blob = await zipWriter.close();

      const url = URL.createObjectURL(blob);

      await chrome.downloads.download({
        url: url,
        filename: zipFilename,
        saveAs: true,
      });

      toast.success(`Exported ${decryptedItems.length} items`);
    } catch (error: any) {
      console.error("Export failed:", error);
      toast.error("Export failed: " + error.message);
    } finally {
      isExporting = false;
    }
  }

  // --- Import Logic ---
  async function handleImportClick() {
    if (importFileInput) {
      importFileInput.click();
    }
  }

  function handleImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      importFile = input.files[0];

      // Setup modal for Import Password
      passwordSetupIntent = PasswordSetupIntent.IMPORT_FILE_DECRYPTION;
      resetModalCustomization();
      modalTitle = "Decrypt Import File";
      modalDescription = "Enter the password to decrypt the imported ZIP file.";
      modalPasswordLabel = "File Password";
      modalSubmitBtnText = "Unlock & Import";
      modalShowHints = false;

      // We are "authenticating" against the file, not setting up a new one.
      // Reuse the "isFirstTime=false" logic which expects a single password input + submit
      // But E2EPasswordModal behaves differently for isFirstTime=false (it triggers onSubmit with just password)
      // We want to skip "confirmation" but use the single password logic.
      isFirstTimeSetup = false;

      showPasswordModal = true;
    }
    input.value = ""; // Reset input
  }

  async function performImport(password: string) {
    if (!importFile || !password) return;

    isImporting = true;
    showPasswordModal = false;
    resetModalCustomization();

    // Disable workers for import too
    configure({ useWebWorkers: false });

    try {
      const zipReader = new ZipReader(new BlobReader(importFile), {
        password: password,
      });

      const entries = await zipReader.getEntries();
      let importedCount = 0;

      for (const entry of entries) {
        if (entry.directory) continue;

        // zip.js Entry type handling
        if (entry.filename.endsWith(".json")) {
          // Explicitly pass password to getData to ensure context is maintained
          // @ts-ignore - type definition might be missing password option but zip.js supports it
          const jsonText = await entry.getData(new TextWriter(), {
            password: password,
          });

          const items = JSON.parse(jsonText);

          if (Array.isArray(items)) {
            const { imported, skipped } =
              await clipboardDBService.importItems(items);

            importedCount += imported;
          }
        } else if (entry.filename.endsWith(".csv")) {
          // Basic CSV parsing support could be added here if needed
          // For now, JSON is the primary/reliable format
          toast.warning(
            "Importing from CSV is not fully supported yet. Please use JSON export.",
          );
        }
      }

      await zipReader.close();

      const summary = `Successfully imported ${importedCount} items`;
      toast.success(summary);

      // System Notification for background context (or if panel closed)
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
        title: "Import Complete",
        message: summary,
      });

      // Update badge and UI
      sendUpdateBadge();
      sendUpdated();
      loadStorageStats();

      handleManualSync({ forcePrompt: false }); // Sync newly imported items if auto-sync is on.
    } catch (error: any) {
      console.error("Import failed details:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
        code: error.code,
      });
      toast.error("Import failed: " + getErrorMessage(error));
    } finally {
      isImporting = false;
      importFile = null;
    }
  }
</script>

<div class="page settings-page">
  <div class="page-header">
    <div class="tabs-nav">
      {#each tabs as tab}
        <button
          class="tab-btn {activeTab === tab ? 'active' : ''}"
          onclick={() => {
            activeTab = tab;
            localSettingsService.setActiveSettingsTab(tab);
          }}
        >
          {tab}
        </button>
      {/each}
    </div>
  </div>

  <div class="page-content">
    {#if activeTab === "General"}
      <div class="settings-section" in:slide={{ duration: 200, axis: "y" }}>
        {#if !isFileAccessAllowed}
          <Banner
            variant="info"
            message="Enable &quot;Allow access to file URLs&quot; to copy local images."
            dismissible={false}
            confirmLabel="Enable Now"
            onConfirm={() => {
              chrome.tabs.create({
                url: `chrome://extensions/?id=${chrome.runtime.id}`,
              });
            }}
          />
        {/if}

        <!-- Storage Usage Details (Simple UI) -->
        <div class="setting-item no-border usage-no-padding-bottom">
          <div class="setting-info usage-full-width">
            <div class="usage-stats usage-no-margin">
              <div class="usage-header">
                <span class="label usage-label">Storage Usage</span>
                <span class="usage-text">
                  <strong>{totalItemsCount}</strong>
                  items stored locally
                  <span class="usage-separator">•</span>
                  <strong>{formatBytes(totalItemsSize)}</strong> used
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="usage-divider"></div>

        {#if !settingsLoaded}
          <div
            class="flex flex-col items-center justify-center py-12 gap-3 opacity-50"
          >
            <Spinner size={24} />
            <span class="text-sm">Loading settings...</span>
          </div>
        {:else}
          <!-- Clipboard Settings -->
          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Clipboard Monitoring</span>
              <p class="setting-description">
                Monitor clipboard changes in background (requires offscreen
              </p>
            </div>
            <Toggle
              bind:checked={isMonitoringEnabled}
              onChange={toggleMonitoring}
              title="Toggle clipboard monitoring"
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Smart Blur Confidential Items</span>
              <p class="setting-description">
                Intelligently blur sensitive data (emails, passwords, API keys)
                until hovered
              </p>
            </div>
            <Toggle
              bind:checked={smartBlurConfidential}
              onChange={toggleSmartBlur}
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Blur All Images</span>
              <p class="setting-description">
                Always blur image items by default. Hover to reveal.
              </p>
            </div>
            <Toggle
              bind:checked={smartBlurImages}
              onChange={toggleSmartBlurImages}
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Auto-write Cloud Syncs</span>
              <p class="setting-description">
                Auto-write the last item from the new items synced from cloud
              </p>
            </div>
            <Toggle
              bind:checked={autoWriteSyncToClipboard}
              onChange={toggleAutoWriteSyncToClipboard}
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Auto-Cleanup Items (days)</span>
              <p class="setting-description">
                Automatically delete items older than specified days (0 = Keep
                forever)
              </p>
            </div>
            <div class="flex items-center gap-2">
              <input
                type="number"
                bind:value={autoCleanupDays}
                onchange={saveSettings}
                min="0"
                max="365"
                class="select-input"
                style="width: 80px;"
              />
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Items Per Page</span>
              <p class="setting-description">
                Number of items to load at a time
              </p>
            </div>
            <select
              bind:value={itemsPerPage}
              onchange={saveItemsPerPage}
              class="select-input"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        {/if}

        <!-- Max History hidden as per user request - currently hardcoded in background -->
        <!--
        <div class="setting-item">
          <div class="setting-info">
            <span class="label">Max History</span>
            <p class="setting-description">
              Maximum clipboard items to keep locally in this browser
            </p>
          </div>
          <input
            type="number"
            bind:value={maxHistory}
            onchange={saveSettings}
            min="1"
            max="10000"
            step="1"
            class="select-input"
            style="width: 120px;"
          />
        </div>
        -->

        <!-- Keyboard Shortcut -->
        <h3 class="section-heading">Keyboard Shortcut</h3>

        {#if hasFloatingWindowAbility}
          <div class="setting-item">
            <div class="setting-info">
              <span
                class="label"
                title="Open Clipboard Manager in a floating window"
                >Open Clipboard Manager in a floating window</span
              >
              <p class="setting-description">
                Default: <strong>Alt+Shift+E</strong>
              </p>
            </div>

            <button
              onclick={openShortcutsPage}
              class="btn btn-secondary btn-compact"
            >
              Customize
            </button>
          </div>
        {/if}

        <div class="setting-item setting-item-stacked">
          <div class="setting-info">
            <span>Instant Floating Clipboard (In-Page)</span>
            <p class="setting-description">
              Quick access to clipboard items on any webpage
            </p>
          </div>
          <div class="shortcut-controls">
            <KeyboardShortcutRecorder
              bind:shortcut={cbPaletteShortcut}
              onChange={handleShortcutChange}
            />
            <button
              onclick={resetShortcut}
              class="btn btn-secondary btn-sm"
              title="Reset to default (Alt+V)"
            >
              Reset
            </button>
          </div>
        </div>

        <div class="setting-item setting-item-stacked">
          <div class="setting-info">
            <span>Element Picker Mode</span>
            <p class="setting-description">
              Select and copy DOM elements with styles or screenshots
            </p>
          </div>
          <div class="shortcut-controls">
            <KeyboardShortcutRecorder
              bind:shortcut={elementPickerShortcut}
              onChange={handleElementPickerShortcutChange}
            />
            <button
              onclick={resetElementPickerShortcut}
              class="btn btn-secondary btn-sm"
              title="Reset to default (Alt+Shift+C)"
            >
              Reset
            </button>
          </div>
        </div>

        <div class="setting-item setting-item-stacked">
          <div class="setting-info">
            <span>Open Filters</span>
            <p class="setting-description">
              Open the filter modal to search clipboard history
            </p>
          </div>
          <div class="shortcut-controls">
            <KeyboardShortcutRecorder
              bind:shortcut={filterShortcut}
              onChange={handleFilterShortcutChange}
            />
            <button
              onclick={resetFilterShortcut}
              class="btn btn-secondary btn-sm"
              title="Reset to default (Ctrl+Shift+F)"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if activeTab === "Data Management"}
      <div class="settings-section" in:slide={{ duration: 200, axis: "y" }}>
        <!-- Import Section -->
        <div class="setting-item">
          <div class="setting-info">
            <span class="label">Import Data</span>
            <p class="setting-description">
              Import clipboard items from a previously exported encrypted file
            </p>
          </div>
          <div>
            <input
              type="file"
              bind:this={importFileInput}
              accept=".zip"
              class="hidden-input"
              onchange={handleImportFile}
            />
            <button
              class="btn btn-secondary"
              onclick={handleImportClick}
              disabled={isImporting}
              title={isImporting
                ? "Import in progress"
                : "Import clipboard data"}
            >
              {#if isImporting}
                <Spinner size={16} />
                <span>Importing...</span>
              {:else}
                <FileBraces size="16" />
                <span>Import</span>
              {/if}
            </button>
          </div>
        </div>

        <!-- Export Section -->
        <div class="setting-item">
          <div class="setting-info">
            <span class="label">Export Data</span>
            <p class="setting-description">
              Download your clipboard history. Files are <strong
                >encrypted</strong
              > with your master password.
            </p>
          </div>
          <div class="export-dropdown">
            <button
              onclick={() => (showExportDropdown = !showExportDropdown)}
              class="btn btn-secondary"
              disabled={isExporting}
              title={isExporting
                ? "Export in progress"
                : "Export clipboard data"}
            >
              {#if isExporting}
                <Spinner size={16} />
                <span>Exporting...</span>
              {:else}
                <span>Export</span>
                <ChevronDown size="16" />
              {/if}
            </button>

            {#if showExportDropdown && !isExporting}
              <div class="dropdown-menu" transition:slide={{ duration: 200 }}>
                <button
                  onclick={() => {
                    handleExport("json");
                    showExportDropdown = false;
                  }}
                  class="dropdown-item"
                >
                  <FileBraces size="16" />
                  <span>Export as JSON</span>
                </button>
                <button
                  onclick={() => {
                    handleExport("csv");
                    showExportDropdown = false;
                  }}
                  class="dropdown-item"
                >
                  <FileSpreadsheet size="16" />
                  <span>Export as CSV</span>
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    {#if activeTab === "Cloud Sync"}
      <div class="settings-section" in:slide={{ duration: 200, axis: "y" }}>
        <!-- Cloud Sync (Premium only / Login required) -->

        <div class="setting-item">
          <div class="setting-info">
            <span class="label">Auto-sync</span>
            <p class="setting-description">
              Automatically sync clipboard items across all your devices
            </p>
            {#if !masterPasswordSet && hasAutoSyncAbility}
              <div class="hint-box">
                <Info size="16" />
                <span
                  >Master password required for auto-sync. Set it below to
                  enable this feature.</span
                >
              </div>
            {/if}
            {#if !hasAutoSyncAbility}
              <div class="hint-box warning">
                <CircleAlert size="16" />
                <span>
                  {authStore.isGuest
                    ? "Create an account to enable auto-sync"
                    : "Upgrade to a premium plan to unlock auto-sync"}
                </span>
              </div>
            {/if}
          </div>
          <Toggle
            bind:checked={autoSync}
            disabled={!hasAutoSyncAbility}
            onChange={toggleAutoSync}
            title={!masterPasswordSet
              ? "Click to set Master Password & enable Auto-sync"
              : !hasAutoSyncAbility
                ? "Upgrade to enable auto-sync"
                : "Toggle auto-sync"}
          />
        </div>

        <!-- Auto-Sync Progress Indicator -->
        <!-- Global Modal now handles this -->

        <div class="setting-item">
          <div class="setting-info">
            <span class="label">Sync Notifications</span>
            <p class="setting-description">
              Show a notification when clipboard items are synced from other
              devices
            </p>
          </div>
          <Toggle
            bind:checked={showNotificationOnSync}
            onChange={toggleNotificationOnSync}
            title="Toggle push notifications"
          />
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="label">Master Password</span>
            <p class="setting-description">
              {masterPasswordSet ? "Password is set and encrypted" : "Not set"}
            </p>
          </div>

          <div class="status-indicator">
            {#if masterPasswordSet}
              <button
                class="btn btn-sm btn-secondary"
                onclick={openChangeMasterPassword}
                disabled={isSyncing || mpcStore.inProgress}
                title={isSyncing
                  ? "Cannot change during sync"
                  : mpcStore.inProgress
                    ? "Unavailable during password change"
                    : "Change master password"}
              >
                Change Password
              </button>
            {:else}
              <button
                class="btn btn-sm btn-secondary"
                onclick={openSetMasterPassword}
                disabled={!authStore.isAuthenticated}
                title={!authStore.isAuthenticated
                  ? "Login to set a master password"
                  : "Set master encryption password"}
              >
                Set Password
              </button>
            {/if}
          </div>
        </div>

        {#if mpcStore.inProgress}
          <div class="setting-item mpc-progress-widget" transition:slide>
            <div class="setting-info usage-full-width">
              <div class="mpc-widget-header">
                <span class="label">Master Password Change in Progress</span>
                <button
                  class="btn btn-sm btn-secondary btn-compact"
                  onclick={handleShowMPCOverlay}
                >
                  Show
                </button>
              </div>
              <div class="mpc-widget-steps">
                {#each mpcStore.steps as step}
                  {#if step.status === "active" || step.status === "error"}
                    <div class="mpc-widget-step">
                      <span class="mpc-widget-step-icon">
                        {#if step.status === "active"}
                          <Spinner size={14} />
                        {:else}
                          <AlertCircle size="14" class="danger-icon" />
                        {/if}
                      </span>
                      <span class="mpc-widget-step-label">{step.label}</span>
                    </div>
                    {#if step.message}
                      <div class="mpc-widget-message">{step.message}</div>
                    {/if}
                    {#if [MPCPhase.DOWNLOADING, MPCPhase.UPLOADING].includes(step.phase) && step.status === "active"}
                      <div class="progress-bar progress-bar-widget">
                        <div
                          class="progress-fill"
                          style="width: {step.progress}%;"
                        ></div>
                      </div>
                    {/if}
                    {#if step.status === "error"}
                      {#if step.error}
                        <div class="mpc-widget-error">{step.error}</div>
                      {/if}
                      {#if step.retryable}
                        <button
                          class="mpc-widget-retry"
                          onclick={handleRetryMPC}
                        >
                          <RefreshCw size="12" />
                          Retry
                        </button>
                      {/if}
                    {/if}
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <div class="setting-item">
          <div class="setting-info">
            <span class="label">Password Storage</span>
            <p class="setting-description">
              Your master password is stored locally in your browser (encrypted)
              to enable uninterrupted auto-sync. This allows the extension to
              automatically sync your clipboard items even after browser
              restarts.
            </p>
          </div>
        </div>

        {#if hasStoredPassword}
          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Forget Master Password</span>
              <p class="setting-description">
                Remove the stored password from this device. You'll need to
                re-enter it to enable auto-sync again.
              </p>
            </div>
            <div class="action-row">
              <button
                class="btn btn-danger btn-sm"
                onclick={handleForgetPassword}
                disabled={isSyncing || mpcStore.inProgress}
                title={isSyncing
                  ? "Cannot forget during sync"
                  : mpcStore.inProgress
                    ? "Unavailable during password change"
                    : "Forget stored master password"}
              >
                Forget Password
              </button>
            </div>
          </div>
        {/if}

        {#if authStore.isAuthenticated}
          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Sync Status</span>
              <p class="setting-description">
                Last synced: {lastSyncText}
              </p>
              <div class="usage-stats">
                <span class="usage-text">
                  Storage Used: <strong
                    >{syncedCount} / {maxClipboardItemsLimit}</strong
                  >
                  items
                  {#if maxClipboardItemsLimit > 0}
                    ({Math.min(
                      Math.round((syncedCount / maxClipboardItemsLimit) * 100),
                      100,
                    )}%)
                  {/if}
                </span>
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    style="width: {Math.min(
                      (syncedCount / maxClipboardItemsLimit) * 100,
                      100,
                    )}%"
                    class:success={syncedCount < maxClipboardItemsLimit * 0.8}
                    class:warning={syncedCount >=
                      maxClipboardItemsLimit * 0.8 &&
                      syncedCount < maxClipboardItemsLimit}
                    class:danger={syncedCount >= maxClipboardItemsLimit}
                  ></div>
                </div>
              </div>
            </div>
            <div class="sync-status-badges">
              {#if autoSync}
                <Cloud size="16" class="icon-primary" />
              {:else}
                <CloudOff size="16" class="icon-tertiary" />
              {/if}
              {#if pendingCount > 0}
                <span
                  class="badge badge-pending"
                  title="{pendingCount} item{pendingCount === 1
                    ? ''
                    : 's'} pending sync"
                >
                  {pendingCount}
                </span>
              {/if}
              {#if errorCount > 0}
                <span class="badge badge-error">{errorCount}</span>
              {/if}
            </div>
          </div>
        {/if}

        {#if authStore.isAuthenticated && pendingCount > 0}
          <div class="setting-item warning-block mt-12">
            <div class="setting-info">
              <div class="warning-content">
                <CircleAlert size="14" class="warning-icon" />
                {#if syncedCount >= maxClipboardItemsLimit}
                  <span class="warning-text">
                    <strong
                      >{pendingCount} item{pendingCount === 1 ? "" : "s"} pending:</strong
                    >
                    Storage limit reached ({maxClipboardItemsLimit}). Delete
                    items from cloud to make space.
                  </span>
                {:else}
                  <span class="warning-text">
                    <strong
                      >{pendingCount} item{pendingCount === 1 ? "" : "s"} pending
                      sync.</strong
                    >
                    Check your connection or try manual sync.
                  </span>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        {#if authStore.isAuthenticated && syncedCount > maxClipboardItemsLimit}
          <div class="setting-item info-block mt-12">
            <div class="setting-info">
              <div class="info-content">
                <Info size="14" class="info-icon" />
                <span class="info-text">
                  <strong>Automatic cleanup active:</strong>
                  You have {syncedCount - maxClipboardItemsLimit} items over your
                  plan limit. Older items will be automatically removed from cloud
                  to stay within your {maxClipboardItemsLimit}-item limit. Items
                  remain available locally.
                </span>
              </div>
            </div>
          </div>
        {/if}

        <div class="setting-item">
          <div class="setting-info">
            <span class="label">Don't upload items to cloud</span>
            <p class="setting-description">
              Prevent uploading any new items from this browser to the cloud.
              Items will still download from cloud and deletions will sync
              automatically.
            </p>
          </div>
          <Toggle
            bind:checked={disableUploadToCloud}
            onChange={toggleUploadToCloud}
          />
        </div>

        {#if authStore.hasAbility(PlanAbility.IMAGE_SUPPORT)}
          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Don't sync image items</span>
              <p class="setting-description">
                Prevent uploading images from this device (save bandwidth)
              </p>
            </div>
            <Toggle
              bind:checked={disableImageSync}
              onChange={toggleImageSync}
              disabled={disableUploadToCloud}
            />
          </div>
        {/if}

        <div class="setting-item no-border">
          <div class="setting-info">
            <span class="label">Manual Sync</span>
            <p class="setting-description">Sync all clipboard items now</p>
          </div>
          <div class="action-row">
            <button
              class="btn btn-secondary btn-full"
              onclick={handleManualSync}
              disabled={isSyncing}
            >
              {#if isSyncing}
                <Spinner size={16} />
                <span>Syncing...</span>
              {:else}
                <RefreshCw size="16" />
                <span>Sync Now</span>
              {/if}
            </button>
          </div>
        </div>

        <!-- Sync Progress -->
        {#if isSyncing && syncProgress.total > 0}
          <div class="setting-item no-border" transition:slide>
            <div class="setting-info usage-full-width">
              <div class="progress-header sync-progress-header">
                <span class="label sync-progress-label"
                  >{syncProgress.message || "Syncing..."}</span
                >
                <span class="status-value sync-progress-value"
                  >{Math.round(
                    ((syncProgress.current || 0) / (syncProgress.total || 1)) *
                      100,
                  )}%</span
                >
              </div>
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  style="width: {Math.min(
                    ((syncProgress.current || 0) / (syncProgress.total || 1)) *
                      100,
                    100,
                  )}%"
                ></div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    {#if activeTab === "Lock"}
      <div class="settings-section" in:slide={{ duration: 200, axis: "y" }}>
        <!-- PIN Lock -->

        <div class="setting-item">
          <div class="setting-info">
            <span class="label">PIN Lock</span>
            <p class="setting-description">
              {isPinSet
                ? "PIN is set and ready to use"
                : "Set a 6-digit PIN to lock your clipboard"}
            </p>
            {#if !hasPinLockAbility}
              <span class="premium-badge">Premium</span>
            {/if}
          </div>
          <div class="status-indicator">
            {#if isPinSet}
              <Shield size="16" class="icon-primary" />
            {:else}
              <Shield size="16" class="icon-tertiary" />
            {/if}
          </div>
        </div>

        {#if !isPinSet}
          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Setup PIN</span>
              <p class="setting-description">
                Create a 6-digit PIN to secure your clipboard data
                {#if !hasPinLockAbility}
                  <span class="premium-badge">Premium</span>
                {/if}
              </p>
            </div>
            <button
              class="btn btn-secondary btn-compact"
              onclick={() => {
                // Check if user is guest first
                if (authStore.isGuest) {
                  authModalStore.open("lock");
                  return;
                }

                if (hasPinLockAbility) {
                  handleSetupPin();
                } else {
                  upgradeModalStore.open({
                    featureName: "PIN Lock",
                    description:
                      "Secure your clipboard with a 6-digit PIN. This premium feature ensures your sensitive data stays protected.",
                  });
                }
              }}
              title={authStore.isGuest
                ? "Create an account to use PIN Lock"
                : hasPinLockAbility
                  ? "Set up PIN lock"
                  : "Upgrade to Premium to use PIN Lock"}
            >
              <Lock size="16" />
              <span>Set PIN</span>
            </button>
          </div>
        {:else}
          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Change PIN</span>
              <p class="setting-description">
                Update your PIN or reset it (deletes encrypted data)
              </p>
            </div>
            <button
              class="btn btn-secondary btn-compact"
              onclick={handleSetupPin}
            >
              <Lock size="16" />
              <span>Change PIN</span>
            </button>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Auto-lock Timer</span>
              <p class="setting-description">
                Lock clipboard after inactivity (0 = disabled)
              </p>
              {#if !hasAutoLockAbility}
                <div class="hint-box warning">
                  <CircleAlert size="16" />
                  <span>
                    {authStore.isGuest
                      ? "Create an account to use Auto-lock"
                      : "Upgrade to unlock Auto-lock feature"}
                  </span>
                </div>
              {/if}
            </div>
            <div class="auto-lock-control">
              <select
                bind:value={autoLockMinutes}
                onchange={handleAutoLockChange}
                class="select-input"
              >
                <option value={0}>Disabled</option>
                <option value={1}>1 minute</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
              </select>
            </div>
          </div>
          <!-- Global Modal now handles LockProgress -->

          <div class="setting-item">
            <div class="setting-info">
              <span class="label">Lock Now</span>
              <p class="setting-description">
                Immediately lock your clipboard and encrypt all data
              </p>
            </div>
            <button
              class="btn btn-danger btn-compact"
              onclick={handleLockNow}
              disabled={isLocking || isLocked || isSyncing}
              title={isLocking
                ? "Locking..."
                : isLocked
                  ? "Already locked"
                  : isSyncing
                    ? "Cannot lock during sync"
                    : "Lock clipboard"}
            >
              {#if isLocking}
                <Spinner size={16} />
              {:else}
                <Lock size="16" />
              {/if}
              <span>{isLocked ? "Locked" : "Lock Now"}</span>
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Lock PIN Entry Modal -->
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

<!-- Password Modal -->
{#if showPasswordModal}
  <E2EPasswordModal
    show={showPasswordModal}
    isFirstTime={isFirstTimeSetup}
    onSubmit={handlePasswordSubmit}
    onCancel={() => (showPasswordModal = false)}
    error={passwordError}
    title={modalTitle ||
      (isFirstTimeSetup
        ? "Set Master Encryption Password"
        : "Enter Master Password")}
    description={modalDescription ||
      (isFirstTimeSetup
        ? "Set a strong password to encrypt your clipboard data. You'll need this password on all devices."
        : "Enter your master password to unlock cloud sync.")}
    passwordLabel={modalPasswordLabel}
    confirmPasswordLabel={modalConfirmPasswordLabel}
    passwordPlaceholder={modalPasswordPlaceholder}
    confirmPasswordPlaceholder={modalConfirmPasswordPlaceholder}
    submitButtonText={modalSubmitBtnText}
    showHints={modalShowHints}
    hint1Text={modalHint1}
    hint2Text={modalHint2}
    closeOnOutsideClick={passwordSetupIntent !== PasswordSetupIntent.EXPORT &&
      passwordSetupIntent !== PasswordSetupIntent.EXPORT_FILE_ENCRYPTION}
    enforceStrongPassword={passwordSetupIntent !==
      PasswordSetupIntent.EXPORT_FILE_ENCRYPTION}
    isLoading={isValidatingPassword}
  />
{/if}

<!-- Change Password Modal -->
{#if showChangePasswordModal}
  <ChangePasswordModal
    show={showChangePasswordModal}
    error={changePasswordError}
    loading={isChangingPassword}
    onSubmit={handleChangePasswordSubmit}
    onCancel={() => {
      changePasswordError = "";
      showChangePasswordModal = false;
    }}
  />
{/if}

<!-- PIN Setup Modal -->
{#if showPinSetupModal}
  <PinSetupModal
    onsetup={handlePinSetupComplete}
    oncancel={() => (showPinSetupModal = false)}
  />
{/if}

{#if showSyncDirectionModal}
  <SyncDirectionModal
    onConfirm={performSync}
    onCancel={() => (showSyncDirectionModal = false)}
  />
{/if}

<ConfirmModal
  show={showForgetPasswordConfirm}
  title="Forget Master Password"
  message="Are you sure you want to forget your master password? You'll need to re-enter it to enable auto-sync again."
  confirmText="Forget Password"
  variant="danger"
  onConfirm={handleForgetPasswordConfirm}
  onCancel={() => (showForgetPasswordConfirm = false)}
/>
