// Sidebar-specific enums and types
import type { CookieItem } from "@shared/types";
import { StorageType } from "@shared/enums";

export enum PageType {
  HOME = "home",
  PROFILE = "profile",
  SETTINGS = "settings",
  PROFILES = "profiles",
  PROFILE_FORM = "profile-form",
  JWT_TOOLS = "jwt-tools",
}

export enum ConfirmDialogVariant {
  DEFAULT = "default",
  DANGER = "danger",
}

export enum SameSiteType {
  STRICT = "Strict",
  LAX = "Lax",
  NONE = "None",
}

export enum StorageFieldType {
  KEY = "key",
  VALUE = "value",
}

export interface TabConfig {
  label: string;
  value: StorageType;
  disabled?: boolean;
  requiresUpgrade?: boolean;
}

export interface PendingRow {
  id: string;
  key: string;
  value: string;
}

export interface StorageItem {
  key: string;
  value: string;
  cookieName?: string;
  cookieIndex?: number;
}

export interface ConfirmDialogState {
  show: boolean;
  title: string;
  message: string;
  variant: ConfirmDialogVariant;
}

export interface ISidebarState {
  // Navigation
  currentPage: PageType;

  // UI State
  isOpen: boolean;
  isClosing: boolean;
  isFullscreen: boolean;

  // Storage State
  activeTab: StorageType;
  currentTabDomain: string;
  loading: boolean;
  error: string | null;

  // Storage Data
  items: StorageItem[];
  cookieItems: CookieItem[];
  pendingNewRows: PendingRow[];

  // Editing State
  editingRow: string | null;
  editFormData: { key: string; value: string };
  selectedRows: Set<string>;

  // Modal States
  showStorageModal: boolean;
  showCookieModal: boolean;
  showConfirmModal: boolean;
  confirmTitle: string;
  confirmMessage: string;
  confirmVariant: "default" | "danger";

  // Search State
  searchQuery: string;
  showSearchBar: boolean;

  // Sync State
  hasSyncedDataForCurrentDomain: boolean;

  // Form State
  editMode: boolean;
  formData: { key: string; value: string };
  currentCookieItem: CookieItem | undefined;

  // Profile Form State
  editingProfile: any | null;
  editingProfileId: string | null;
}

export interface ISidebarActions {
  // Navigation
  setPage(page: PageType): void;
  goHome(): void;
  goToProfile(): void;
  goToSettings(): void;
  goToProfiles(): void;
  goToProfileForm(profile?: any, profileId?: string): void;
  goToJwtTools(): void;

  // UI Actions
  toggleSidebar(): void;
  toggleFullscreen(): void;
  toggleSearchBar(): void;
  clearSearch(): void;

  // Storage Data Actions
  loadStorageData(): Promise<void>;
  refreshData(): void;
  exportData(): void;
  importData(): void;

  // Tab Management
  handleTabChange(tab: StorageType): void;

  // Item Management
  addNewItem(): void;
  startEdit(item: StorageItem): void;
  saveInlineEdit(key: string): Promise<void>;
  cancelInlineEdit(): void;
  deleteItem(key: string): void;
  handleInlineSave(
    item: StorageItem,
    field: StorageFieldType,
    newValue: string,
    originalValue: string,
  ): Promise<void>;

  // Bulk Operations
  toggleRowSelection(key: string): void;
  toggleSelectAll(): void;
  bulkDelete(): void;
  bulkEdit(editedItems: Record<string, string>): Promise<void>;

  // Pending Rows
  savePendingRow(id: string): Promise<void>;
  cancelPendingRow(id: string): void;

  // Modal Management
  openStorageModal(): void;
  openCookieModal(): void;
  closeModals(): void;
  handleStorageItemSave(item: {
    key: string;
    value: string;
    originalKey?: string;
  }): Promise<void>;
  handleCookieSave(
    cookie: CookieItem & { originalName?: string },
  ): Promise<void>;
  handleProfileFormSave(formData: any): Promise<void>;

  // Confirm Dialog
  showConfirmDialog(
    title: string,
    message: string,
    variant?: ConfirmDialogVariant,
  ): Promise<boolean>;
  handleConfirmOk(): void;
  handleConfirmCancel(): void;

  // Sync Operations
  handleSyncedData(data: Record<string, string>): Promise<void>;
  checkSyncedDataForCurrentDomain(): Promise<void>;
  handleDeleteSyncedData(): Promise<void>;

  // Utility
  updateEditValue(value: string): void;
  updateSearchQuery(query: string): void;
}
