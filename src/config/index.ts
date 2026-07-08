/**
 * Extension Configuration
 * Centralized configuration for the entire extension
 */

// VERSION of this extension
export const VERSION = "5.4.0";

export const SIDEBAR_ROOT_ELEMENT_ID =
  "encrypted-clipboard-manager-sidepanel-root-v1";

/**
 * API Configuration
 */
export const API_CONFIG = {
  BASE_URL: "https://server.encryptedclipboard.app/api",
  DASHBOARD_URL: "https://encryptedclipboard.app/dashboard/user",
  LOGIN_URL: "https://encryptedclipboard.app/user/login",

  // Timeout for API requests (in milliseconds)
  TIMEOUT: 60000,

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
} as const;

/**
 * Storage Configuration
 */
export const STORAGE_CONFIG = {
  // Chrome storage keys
  KEYS: {
    AUTH_TOKEN: "authToken",
    USER: "user",
    SUBSCRIPTION_STATUS: "subscriptionStatus",
    THEME: "theme",
    SIDEBAR_SHORTCUT: "sidebarShortcut",
  },

  // Storage limits
  MAX_PENDING_ROWS: 10,
} as const;

/**
 * UI Configuration
 */
export const UI_CONFIG: {
  TOAST: {
    DURATION: number;
    POSITION: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    LIMIT: number;
  };
  TOOLTIP: {
    DELAY: [number, number];
    DURATION: [number, number];
  };
} = {
  // Toast notifications
  TOAST: {
    DURATION: 4000,
    POSITION: "bottom-right" as const,
    LIMIT: 5,
  },

  // Tooltip configuration
  TOOLTIP: {
    DELAY: [200, 0] as [number, number],
    DURATION: [200, 150] as [number, number],
  },
} as const;

/**
 * Web App Configuration
 * URLs and domains for our web application/dashboard
 */
export const WEB_APP_CONFIG: {
  BASE_URLS: string[];
  HOSTNAMES: string[];
} = {
  // Base URLs for our web application
  BASE_URLS: ["https://encryptedclipboard.app"],

  // Hostnames to check for web app detection
  HOSTNAMES: ["encryptedclipboard.app"],
} as const;

/**
 * Lock Configuration
 */
export const LOCK_CONFIG = {
  DB_NAME: "clipboard-lock-db",
  DB_VERSION: 1,
  STORE_NAME: "encrypted_items",
  PBKDF2_ITERATIONS: 100000,
  SALT_LENGTH: 32,
  IV_LENGTH: 12,
} as const;

/**
 * Get API base URL
 * @returns The configured API base URL
 */
export function getApiBaseUrl(): string {
  return API_CONFIG.BASE_URL;
}

/**
 * Get full API endpoint URL
 * @param endpoint - The endpoint path (e.g., '/extension/cloud-data/push')
 * @returns Full URL
 */
export function getApiUrl(endpoint: string): string {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
}
