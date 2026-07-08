import {
  STORAGE_KEYS,
  type LockOwner,
  type GetLockResult,
  type SetLockResult,
  type LockedItemsMap,
  type SessionStorageData,
} from "../types/session-storage.types";

export class ClipboardItemLockService {
  async getLockedItems(): Promise<LockedItemsMap> {
    const result = (await chrome.storage.session.get(
      STORAGE_KEYS.LOCKED_ITEMS,
    )) as SessionStorageData;
    return result[STORAGE_KEYS.LOCKED_ITEMS] || {};
  }

  async getItemLock(itemId: string): Promise<GetLockResult> {
    const lockedItems = await this.getLockedItems();
    const lock = lockedItems[itemId] || null;
    return { isLocked: !!lock, lock };
  }

  async setItemLock(
    itemId: string,
    lockedBy: LockOwner,
  ): Promise<SetLockResult> {
    const { lock } = await this.getItemLock(itemId);

    if (lock && lock.lockedBy !== lockedBy) {
      return { success: false, error: "ALREADY_LOCKED" };
    }

    const lockedItems = await this.getLockedItems();
    lockedItems[itemId] = { lockedBy, lockedAt: Date.now() };

    await chrome.storage.session.set({
      [STORAGE_KEYS.LOCKED_ITEMS]: lockedItems,
    });

    return { success: true };
  }

  async clearItemLock(itemId: string, lockedBy: LockOwner): Promise<boolean> {
    const { lock } = await this.getItemLock(itemId);

    if (!lock) return true;

    if (lock.lockedBy !== lockedBy) {
      return false;
    }

    const lockedItems = await this.getLockedItems();
    delete lockedItems[itemId];

    await chrome.storage.session.set({
      [STORAGE_KEYS.LOCKED_ITEMS]: lockedItems,
    });

    return true;
  }

  async checkAndLock(itemId: string, lockedBy: LockOwner): Promise<boolean> {
    const result = await this.setItemLock(itemId, lockedBy);
    return result.success;
  }

  async canPerformAction(
    itemId: string,
    action: "edit" | "delete",
    requester: LockOwner,
  ): Promise<{ allowed: boolean; error?: string }> {
    const { lock } = await this.getItemLock(itemId);

    if (lock && lock.lockedBy !== requester) {
      const uiName =
        lock.lockedBy === "sidebar" ? "sidebar" : "floating window";
      return {
        allowed: false,
        error: `Cannot ${action} - item is being edited in ${uiName}. Close it first to ${action}.`,
      };
    }

    return { allowed: true };
  }

  async clearAllLocks(): Promise<void> {
    await chrome.storage.session.set({ [STORAGE_KEYS.LOCKED_ITEMS]: {} });
  }

  async clearLocksByOwner(owner: LockOwner): Promise<void> {
    const lockedItems = await this.getLockedItems();
    let changed = false;

    for (const itemId in lockedItems) {
      if (lockedItems[itemId].lockedBy === owner) {
        delete lockedItems[itemId];
        changed = true;
      }
    }

    if (changed) {
      await chrome.storage.session.set({
        [STORAGE_KEYS.LOCKED_ITEMS]: lockedItems,
      });
    }
  }

  async setFloatingWindowOpen(open: boolean): Promise<void> {
    await chrome.storage.session.set({
      [STORAGE_KEYS.FLOATING_WINDOW_OPEN]: open,
    });
  }

  async getFloatingWindowOpen(): Promise<boolean> {
    const result = (await chrome.storage.session.get(
      STORAGE_KEYS.FLOATING_WINDOW_OPEN,
    )) as SessionStorageData;
    return result[STORAGE_KEYS.FLOATING_WINDOW_OPEN] || false;
  }

  async setSidebarOpen(open: boolean): Promise<void> {
    await chrome.storage.session.set({
      [STORAGE_KEYS.SIDEBAR_OPEN]: open,
    });
  }

  async getSidebarOpen(): Promise<boolean> {
    const result = (await chrome.storage.session.get(
      STORAGE_KEYS.SIDEBAR_OPEN,
    )) as SessionStorageData;
    return result[STORAGE_KEYS.SIDEBAR_OPEN] || false;
  }

  private async getScrollStorageKey(
    ui: "sidepanel" | "floating_window",
  ): Promise<string> {
    return ui === "sidepanel"
      ? STORAGE_KEYS.SIDEPANEL_SCROLL_POSITION
      : STORAGE_KEYS.FLOATING_WINDOW_SCROLL_POSITION;
  }

  private async getScrolledKey(
    ui: "sidepanel" | "floating_window",
  ): Promise<string> {
    return ui === "sidepanel"
      ? STORAGE_KEYS.SIDEPANEL_SCROLLED
      : STORAGE_KEYS.FLOATING_WINDOW_SCROLLED;
  }

  async setScrollPosition(
    position: number,
    ui: "sidepanel" | "floating_window",
  ): Promise<void> {
    const scrollKey = await this.getScrollStorageKey(ui);
    await chrome.storage.session.set({
      [scrollKey]: position,
    });
  }

  async getScrollPosition(
    ui: "sidepanel" | "floating_window",
  ): Promise<number> {
    const scrollKey = await this.getScrollStorageKey(ui);
    const result = (await chrome.storage.session.get(scrollKey)) as Record<
      string,
      number
    >;
    return result[scrollKey] || 0;
  }

  async setHasScrolled(ui: "sidepanel" | "floating_window"): Promise<void> {
    const scrolledKey = await this.getScrolledKey(ui);
    await chrome.storage.session.set({
      [scrolledKey]: true,
    });
  }

  async getHasScrolled(ui: "sidepanel" | "floating_window"): Promise<boolean> {
    const scrolledKey = await this.getScrolledKey(ui);
    const result = (await chrome.storage.session.get(scrolledKey)) as Record<
      string,
      boolean
    >;
    return result[scrolledKey] || false;
  }

  async clearScrollPosition(
    ui: "sidepanel" | "floating_window",
  ): Promise<void> {
    const scrollKey = await this.getScrollStorageKey(ui);
    const scrolledKey = await this.getScrolledKey(ui);
    await chrome.storage.session.set({
      [scrollKey]: 0,
      [scrolledKey]: false,
    });
  }

  async restoreScrollWithSmooth(
    ui: "sidepanel" | "floating_window",
    container: HTMLElement,
  ): Promise<void> {
    const hasScrolled = await this.getHasScrolled(ui);
    if (!hasScrolled) return;

    const savedPos = await this.getScrollPosition(ui);
    if (savedPos <= 0 || !container) return;

    requestAnimationFrame(() => {
      if (container) {
        container.scrollTo({
          top: savedPos,
          behavior: "auto",
        });
      }
    });
  }
}
