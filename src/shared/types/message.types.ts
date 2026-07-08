import { SyncStage, SyncDirection } from "../enums";

export enum MessageType {
  CLIPBOARD_CAPTURED = "clipboard_captured",
  CLIPBOARD_SYNCED = "CLIPBOARD_SYNCED",
  NEW_ITEMS_AVAILABLE = "NEW_ITEMS_AVAILABLE",
  GET_CLIPBOARD_ITEMS = "get_clipboard_items",
  DELETE_CLIPBOARD_ITEM = "delete_clipboard_item",
  TOGGLE_FAVORITE = "toggle_favorite",
  ADD_TAGS = "add_tags",
  REMOVE_TAGS = "remove_tags",
  LOGIN_SYNC = "LOGIN_SYNC",
  LOGOUT_SYNC = "LOGOUT_SYNC",
  LOGOUT = "LOGOUT",
  // Sync-related messages
  CLIPBOARD_SYNC_ITEM = "CLIPBOARD_SYNC_ITEM",
  CLIPBOARD_SYNC_ALL = "CLIPBOARD_SYNC_ALL",
  CLIPBOARD_MANUAL_SYNC = "CLIPBOARD_MANUAL_SYNC",
  CLIPBOARD_CHECK_UPDATES = "CLIPBOARD_CHECK_UPDATES",
  CLIPBOARD_DELETE_CLOUD = "CLIPBOARD_DELETE_CLOUD",
  CLIPBOARD_SYNC_DELETION = "CLIPBOARD_SYNC_DELETION",
  CLIPBOARD_UNSYNC_ITEM = "CLIPBOARD_UNSYNC_ITEM",
  CLIPBOARD_UNSYNC_ITEMS = "CLIPBOARD_UNSYNC_ITEMS",
  CLIPBOARD_TOGGLE_AUTO_SYNC = "CLIPBOARD_TOGGLE_AUTO_SYNC",
  CLIPBOARD_SET_MASTER_PASSWORD = "CLIPBOARD_SET_MASTER_PASSWORD",
  CLIPBOARD_FORGET_MASTER_PASSWORD = "CLIPBOARD_FORGET_MASTER_PASSWORD",
  VERIFY_MASTER_PASS = "VERIFY_MASTER_PASS",
  CLIPBOARD_VERIFY_CLOUD_PASSWORD = "CLIPBOARD_VERIFY_CLOUD_PASSWORD",
  CLIPBOARD_CONNECT_SOCKET = "CLIPBOARD_CONNECT_SOCKET",
  CLIPBOARD_DISCONNECT_SOCKET = "CLIPBOARD_DISCONNECT_SOCKET",
  CLIPBOARD_GET_SYNC_STATUS = "CLIPBOARD_GET_SYNC_STATUS",
  // Lock-related messages
  CLIPBOARD_LOCK = "CLIPBOARD_LOCK",
  CLIPBOARD_UNLOCK = "CLIPBOARD_UNLOCK",
  CLIPBOARD_RESET_PIN = "CLIPBOARD_RESET_PIN",
  CLIPBOARD_VERIFY_PIN = "CLIPBOARD_VERIFY_PIN",
  SUBSCRIPTION_SYNC = "SUBSCRIPTION_SYNC",
  PING = "PING",
  OPEN_WINDOW = "OPEN_WINDOW",
  UPDATE_BADGE = "UPDATE_BADGE",
  ERROR_LOG = "ERROR_LOG",
  DEBUG_LOG = "DEBUG_LOG",
  SEND_HTTP_REQUEST = "SEND_HTTP_REQUEST",
  AUTH_ERROR = "AUTH_ERROR",
  AUTH_SUCCESS = "AUTH_SUCCESS",
  AUTH_STATUS_CHANGED = "AUTH_STATUS_CHANGED",
  UNAUTHORIZED_ERROR = "UNAUTHORIZED_ERROR",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  CLIPBOARD_UPDATED = "CLIPBOARD_UPDATED",
  GENERATE_THUMBNAIL = "GENERATE_THUMBNAIL",
  ITEM_BATCH_UPDATED = "ITEM_BATCH_UPDATED",
  SHOW_TOAST = "SHOW_TOAST",
  BS_SUBSCRIPTION_UPDATED = "BS_SUBSCRIPTION_UPDATED",
  CLIPBOARD_LOCKED = "CLIPBOARD_LOCKED",
  CLIPBOARD_UNLOCKED = "CLIPBOARD_UNLOCKED",
  TEST_PUSH_NOTIFICATION = "TEST_PUSH_NOTIFICATION",
  PUSH_SERVICE_FAILURE = "PUSH_SERVICE_FAILURE",
  SYNC_PROGRESS = "SYNC_PROGRESS",
  SEARCH_CLIPBOARD_ITEMS = "SEARCH_CLIPBOARD_ITEMS",
  GET_CLIPBOARD_ITEM = "GET_CLIPBOARD_ITEM",
  CLIPBOARD_ITEM_UPDATED = "CLIPBOARD_ITEM_UPDATED",
  SETTINGS_UPDATED = "SETTINGS_UPDATED",
  CLIPBOARD_ACTIVITY = "CLIPBOARD_ACTIVITY",
  CHECK_AUTH_VALIDITY = "CHECK_AUTH_VALIDITY",
  LOCK_PROGRESS = "LOCK_PROGRESS",
  UNLOCK_PROGRESS = "UNLOCK_PROGRESS",
  INVALID_MASTER_PASSWORD = "INVALID_MASTER_PASSWORD",
  MPC_START = "MPC_START",
  MPC_PROGRESS = "MPC_PROGRESS",

  // Snippets
  SNIPPETS_GET_ALL = "SNIPPETS_GET_ALL",
  SNIPPETS_GET_ALL_KEYS = "SNIPPETS_GET_ALL_KEYS",
  SNIPPETS_ADD = "SNIPPETS_ADD",
  SNIPPETS_UPDATE = "SNIPPETS_UPDATE",
  SNIPPETS_DELETE = "SNIPPETS_DELETE",
  SNIPPETS_GET_SNIPPET = "SNIPPETS_GET_SNIPPET",
  SNIPPETS_COUNT = "SNIPPETS_COUNT",
  SNIPPETS_WRITE_CLIPBOARD = "SNIPPETS_WRITE_CLIPBOARD",
  SNIPPETS_RESTORE_CLIPBOARD = "SNIPPETS_RESTORE_CLIPBOARD",
}

export interface SyncProgressPayload {
  stage: SyncStage;
  current?: number;
  total?: number;
  message?: string;
}

export interface BackgroundMessage {
  type: MessageType;
  data?: any; // For CLIPBOARD_CAPTURED
  id?: string; // For DELETE_CLIPBOARD_ITEM, TOGGLE_FAVORITE, ADD/REMOVE TAGS
  tags?: string[]; // For ADD/REMOVE TAGS
  limit?: number; // For GET_CLIPBOARD_ITEMS
  offset?: number; // For GET_CLIPBOARD_ITEMS
  payload?: any; // For many actions
  error?: any; // For ERROR_LOG
  syncProgress?: SyncProgressPayload;
  query?: string; // For SEARCH_CLIPBOARD_ITEMS
  downloadOnly?: boolean; // For CLIPBOARD_MANUAL_SYNC (Legacy)
  syncType?: SyncDirection; // For CLIPBOARD_MANUAL_SYNC
}

export interface ChromeMessage<T = any> {
  type: MessageType | string;
  payload?: T;
  tabId?: number;
  timestamp?: number;
}

export interface AuthSuccessPayload {
  token: string;
  user?: any;
}

export interface LogoutPayload {
  reloadTabs?: boolean;
  clearStorage?: boolean;
  keepData?: boolean;
}

// HTTP Request/Response Payloads for background script proxy
export interface HttpRequestPayload {
  url: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: any;
  token?: string;
  headers?: Record<string, string>;
}

export interface HttpResponsePayload {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  code?: string;
  status?: number;
}

// Message Response Type
export interface ChromeMessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Generic batch update payload for any item field changes
export interface ItemBatchUpdatedPayload {
  items: Array<{
    id: string;
    changes: Record<string, any>; // Generic changes object
  }>;
}
