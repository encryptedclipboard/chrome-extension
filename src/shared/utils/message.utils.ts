import { MessageType } from "../types/message.types";
import { SyncStage } from "../enums";

export function sendUpdated(payload?: { itemId?: string }): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.CLIPBOARD_UPDATED,
      payload,
    })
    .catch(() => {});
}

export function sendSyncItem(payload: { itemId: string }): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_SYNC_ITEM,
    payload,
  });
}

export function sendSyncDeletion(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.CLIPBOARD_SYNC_DELETION,
    })
    .catch(() => {});
}

export function sendSynced(payload?: {
  itemId?: string;
  serverId?: string;
  items?: any[];
  action?: string;
  changeType?: string;
  itemIds?: string[];
}): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.CLIPBOARD_SYNCED,
      ...payload,
    })
    .catch(() => {});
}

export function sendUnsyncItem(payload: {
  id: string;
  serverId?: string;
}): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_UNSYNC_ITEM,
    payload,
  });
}

export function sendUnsyncItems(payload: {
  items: Array<{ id: string; serverId: string }>;
}): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_UNSYNC_ITEMS,
    payload,
  });
}

export function sendManualSync(syncType?: string): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_MANUAL_SYNC,
    syncType,
  });
}

export function sendCheckUpdates(): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_CHECK_UPDATES,
  });
}

export function sendGetSyncStatus(): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_GET_SYNC_STATUS,
  });
}

export function sendNewItemsAvailable(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.NEW_ITEMS_AVAILABLE,
    })
    .catch(() => {});
}

export function sendSyncTrigger(payload: { reason: string }): void {
  chrome.runtime
    .sendMessage({
      type: "SYNC_TRIGGER",
      payload,
    })
    .catch(() => {});
}

export function sendSettingsUpdated(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.SETTINGS_UPDATED,
    })
    .catch(() => {});
}

export function sendToggleAutoSync(payload: {
  enabled: boolean;
  password?: string;
}): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_TOGGLE_AUTO_SYNC,
    payload,
  });
}

export function sendSetMasterPassword(payload: {
  password: string;
  rememberPassword?: boolean;
}): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_SET_MASTER_PASSWORD,
    payload,
  });
}

export function sendVerifyMasterPassword(payload: {
  password: string;
}): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.VERIFY_MASTER_PASS,
    payload,
  });
}

export function sendVerifyCloudPassword(payload: {
  password: string;
}): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_VERIFY_CLOUD_PASSWORD,
    payload,
  });
}

export function sendForgetMasterPassword(): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_FORGET_MASTER_PASSWORD,
  });
}

export function sendLock(payload?: { pin?: string }): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_LOCK,
    payload,
  });
}

export function sendVerifyPin(pin: string): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_VERIFY_PIN,
    payload: { pin },
  });
}

export function sendUnlock(payload?: { pin?: string }): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_UNLOCK,
    payload,
  });
}

export function sendLocked(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.CLIPBOARD_LOCKED,
    })
    .catch(() => {});
}

export function sendUnlocked(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.CLIPBOARD_UNLOCKED,
    })
    .catch(() => {});
}

export function sendSyncProgress(payload: {
  stage: SyncStage;
  current?: number;
  total?: number;
  message?: string;
}): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.SYNC_PROGRESS,
      syncProgress: payload,
    })
    .catch(() => {});
}

export function sendLockProgress(payload: {
  stage: string;
  current?: number;
  total?: number;
  message?: string;
}): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.LOCK_PROGRESS,
      payload,
    })
    .catch(() => {});
}

export function sendUnlockProgress(payload: {
  stage?: string;
  current?: number;
  total?: number;
  message?: string;
}): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.UNLOCK_PROGRESS,
      payload,
    })
    .catch(() => {});
}

export function sendUpdateBadge(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.UPDATE_BADGE,
    })
    .catch(() => {});
}

export function sendOpenWindow(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.OPEN_WINDOW,
    })
    .catch(() => {});
}

export function sendAuthError(payload?: { message?: string }): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.AUTH_ERROR,
      payload,
    })
    .catch(() => {});
}

export function sendAuthSuccess(payload?: {
  token?: string;
  user?: any;
  subscription?: any;
  planName?: string;
  hasSyncedItems?: boolean;
  isReconnect?: boolean;
}): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.AUTH_SUCCESS,
      payload,
    })
    .catch(() => {});
}

export function sendLogout(payload?: {
  reloadTabs?: boolean;
  clearStorage?: boolean;
  keepData?: boolean;
}): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.LOGOUT,
      payload,
    })
    .catch(() => {});
}

export function sendSessionExpired(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.SESSION_EXPIRED,
    })
    .catch(() => {});
}

export function sendAuthStatusChanged(payload: {
  isAuthenticated: boolean;
}): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.AUTH_STATUS_CHANGED,
      payload,
    })
    .catch(() => {});
}

export function sendPushServiceFailure(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.PUSH_SERVICE_FAILURE,
    })
    .catch(() => {});
}

export function sendUnauthorizedError(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.UNAUTHORIZED_ERROR,
    })
    .catch(() => {});
}

export function sendInvalidMasterPassword(): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.INVALID_MASTER_PASSWORD,
    })
    .catch(() => {});
}

export function sendErrorLog(payload: {
  error: string;
  context?: string;
}): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.ERROR_LOG,
      payload,
    })
    .catch(() => {});
}

export function sendPing(): Promise<boolean> {
  return chrome.runtime
    .sendMessage({
      type: MessageType.PING,
    })
    .then(() => true)
    .catch(() => false);
}

export function sendCaptured(payload: { item: any }): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.CLIPBOARD_CAPTURED,
      payload,
    })
    .catch(() => {});
}

export function sendCheckAuthValidity(): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CHECK_AUTH_VALIDITY,
  });
}

export function sendClipboardActivity(): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_ACTIVITY,
  });
}

export function sendResetPin(): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_RESET_PIN,
  });
}

export function sendItemUpdated(payload: {
  itemId: string;
  changes?: any;
}): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.CLIPBOARD_ITEM_UPDATED,
      payload,
    })
    .catch(() => {});
}

export function sendItemsUpdated(itemIds: string[]): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.CLIPBOARD_ITEM_UPDATED,
      payload: { itemIds },
    })
    .catch(() => {});
}

export function sendDeleteCloud(payload: { itemId: string }): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.CLIPBOARD_DELETE_CLOUD,
    payload,
  });
}

export interface ToastPayload {
  message: string;
  type?: "success" | "error" | "warning" | "info";
}

export function sendToast(payload: ToastPayload): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.SHOW_TOAST,
      payload,
    })
    .catch(() => {});
}

export function sendItemBatchUpdated(payload: {
  items: Array<{ id: string; changes: Record<string, any> }>;
}): void {
  chrome.runtime
    .sendMessage({
      type: MessageType.ITEM_BATCH_UPDATED,
      payload,
    })
    .catch(() => {});
}

export function sendMpcStart(payload: { newPassword: string }): Promise<any> {
  return chrome.runtime.sendMessage({
    type: MessageType.MPC_START,
    payload,
  });
}
