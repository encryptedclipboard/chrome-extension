// Type-safe storage keys and their data types for extension session state

export const STORAGE_KEYS = {
  FLOATING_WINDOW_OPEN: "floatingWindowOpen",
  SIDEBAR_OPEN: "sidebarOpen",
  LOCKED_ITEMS: "lockedItems",
  // Scroll positions for sidepanel and floating window
  SIDEPANEL_SCROLL_POSITION: "sidepanel_scrollPosition",
  FLOATING_WINDOW_SCROLL_POSITION: "floating_window_scrollPosition",
  // Track if user has scrolled (to avoid restore on initial load)
  SIDEPANEL_SCROLLED: "sidepanel_scrolled",
  FLOATING_WINDOW_SCROLLED: "floating_window_scrolled",
  // Settings UI state
  SETTINGS_ACTIVE_TAB: "settings_active_tab",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export interface SessionStorageData {
  [STORAGE_KEYS.FLOATING_WINDOW_OPEN]: boolean;
  [STORAGE_KEYS.SIDEBAR_OPEN]: boolean;
  [STORAGE_KEYS.LOCKED_ITEMS]: LockedItemsMap;
  [STORAGE_KEYS.SETTINGS_ACTIVE_TAB]: string;
}

export interface ItemLock {
  lockedBy: LockOwner;
  lockedAt: number;
}

export type LockedItemsMap = Record<string, ItemLock>;

export enum LockOwner {
  SIDEBAR = "sidebar",
  FLOATING_WINDOW = "floating_window",
}

export interface GetLockResult {
  isLocked: boolean;
  lock: ItemLock | null;
}

export interface SetLockResult {
  success: boolean;
  error?: "ALREADY_LOCKED" | "WRONG_OWNER";
}

export interface WindowState {
  floatingWindowOpen: boolean;
  sidebarOpen: boolean;
}

// UI type for scroll position
export type UIType = "sidepanel" | "floating_window";

// Scroll position result
export interface ScrollPosition {
  position: number;
  timestamp: number;
}
