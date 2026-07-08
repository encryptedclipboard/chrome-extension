import { browserAPI } from "./browser-api.util";

/**
 * Cross-browser permission utility for managing optional permissions at runtime
 * Supports Chrome (chrome.permissions) and Firefox (browser.permissions)
 *
 * IMPORTANT: permissions.request() can only be called from:
 * - Extension popup/options pages
 * - Background script in response to user action
 * - NOT from content scripts
 *
 * When called from a content script (sidebar), this will send a message to
 * the background script to request permissions on behalf of the content script.
 */

declare const browser: any;
declare const chrome: any;

/**
 * Check if we're in a content script context
 * Content scripts cannot call permissions.request() - must use popup/options page
 */
function isContentScript(): boolean {
  try {
    // If no window object, we're in background/service worker
    if (typeof window === "undefined") return false;

    // If no browser APIs, we're not in an extension context
    if (typeof chrome === "undefined" && typeof browser === "undefined")
      return false;

    // Check if chrome.permissions API is available
    // Content scripts don't have access to chrome.permissions
    const hasPermissionsAPI =
      (typeof chrome !== "undefined" && chrome.permissions) ||
      (typeof browser !== "undefined" && browser.permissions);

    // If permissions API is not available and we have window, we're in a content script
    return !hasPermissionsAPI;
  } catch {
    return true; // Assume content script if error
  }
}

/**
 * Normalize origins input to array format
 */
const normalizeOrigins = (origins: string | string[]): string[] =>
  Array.isArray(origins) ? origins : [origins];

/**
 * Normalize permissions input to array format
 */
const normalizePermissions = (permissions: string | string[]): string[] =>
  Array.isArray(permissions) ? permissions : [permissions];

/**
 * Get the native permissions API (Firefox or Chrome)
 */
function getPermissionsAPI() {
  if (typeof browser !== "undefined" && browser.permissions) {
    return { api: browser.permissions, isPromise: true };
  }
  if (typeof chrome !== "undefined" && chrome.permissions) {
    return { api: chrome.permissions, isPromise: false };
  }
  return null;
}

/**
 * Check if the extension has the specified permissions and/or origins
 */
export async function hasPermission(params: {
  permissions?: string | string[];
  origins?: string | string[];
}): Promise<boolean> {
  const inContentScript = isContentScript();

  // If in content script, delegate to background script
  if (inContentScript) {
    try {
      // Delegating permission check to background
      const response = await browserAPI.runtime.sendMessage({
        action: "checkPermission",
        params,
      });
      // Permission check response received
      return !!response?.hasPermission;
    } catch (error) {
      console.error("Error checking permission from content script:", error);
      return false;
    }
  }

  const permissionsAPI = getPermissionsAPI();
  if (!permissionsAPI) {
    // No permissions API available
    return false;
  }

  const query: any = {};
  if (params.permissions) {
    query.permissions = normalizePermissions(params.permissions);
  }
  if (params.origins) {
    query.origins = normalizeOrigins(params.origins);
  }

  try {
    if (permissionsAPI.isPromise) {
      const result = await permissionsAPI.api.contains(query);
      return !!result;
    } else {
      return new Promise<boolean>((resolve) => {
        permissionsAPI.api.contains(query, (result: boolean) => {
          if (chrome.runtime?.lastError) {
            resolve(false);
          } else {
            resolve(!!result);
          }
        });
      });
    }
  } catch {
    return false;
  }
}

/**
 * Request the specified permissions and/or origins from the user
 * Must be called from a user gesture (e.g., button click)
 */
export async function requestPermission(params: {
  permissions?: string | string[];
  origins?: string | string[];
}): Promise<boolean> {
  // If called from content script, cannot request directly (browser restriction)
  // User must open popup settings to grant permissions
  if (isContentScript()) {
    console.warn(
      "Cannot request permissions from content script. User must open extension popup > Settings to grant permissions.",
    );
    return false;
  }

  // Direct API call (from popup/background/options)
  const permissionsAPI = getPermissionsAPI();
  if (!permissionsAPI) return false;

  const query: any = {};
  if (params.permissions) {
    query.permissions = normalizePermissions(params.permissions);
  }
  if (params.origins) {
    query.origins = normalizeOrigins(params.origins);
  }

  try {
    if (permissionsAPI.isPromise) {
      const granted = await permissionsAPI.api.request(query);
      return !!granted;
    } else {
      return new Promise<boolean>((resolve) => {
        permissionsAPI.api.request(query, (granted: boolean) => {
          if (chrome.runtime?.lastError) {
            resolve(false);
          } else {
            resolve(!!granted);
          }
        });
      });
    }
  } catch {
    return false;
  }
}

/**
 * Remove (revoke) the specified permissions and/or origins
 */
export async function removePermission(params: {
  permissions?: string | string[];
  origins?: string | string[];
}): Promise<boolean> {
  const permissionsAPI = getPermissionsAPI();
  if (!permissionsAPI) return false;

  const query: any = {};
  if (params.permissions) {
    query.permissions = normalizePermissions(params.permissions);
  }
  if (params.origins) {
    query.origins = normalizeOrigins(params.origins);
  }

  try {
    if (permissionsAPI.isPromise) {
      const removed = await permissionsAPI.api.remove(query);
      return !!removed;
    } else {
      return new Promise<boolean>((resolve) => {
        permissionsAPI.api.remove(query, (removed: boolean) => {
          if (chrome.runtime?.lastError) {
            resolve(false);
          } else {
            resolve(!!removed);
          }
        });
      });
    }
  } catch {
    return false;
  }
}

/**
 * Ensure the extension has the specified permissions/origins; request if not present
 */
export async function ensurePermission(params: {
  permissions?: string | string[];
  origins?: string | string[];
}): Promise<boolean> {
  const has = await hasPermission(params);
  if (has) return true;

  const granted = await requestPermission(params);
  return granted;
}

/**
 * Build http/https host patterns for a given domain/hostname
 * Example: "example.com" => ["http://example.com/*", "https://example.com/*"]
 */
export function hostPatternsForDomain(domain: string): string[] {
  const clean = domain.startsWith(".") ? domain.substring(1) : domain;
  return [`http://${clean}/*`, `https://${clean}/*`];
}

/**
 * Check if cookies permission is granted
 */
export async function hasCookiesPermission(): Promise<boolean> {
  return hasPermission({ permissions: "cookies" });
}

/**
 * Check if webNavigation permission is granted
 */
export async function hasWebNavigationPermission(): Promise<boolean> {
  return hasPermission({ permissions: "webNavigation" });
}

/**
 * Request cookies permission from user
 */
export async function requestCookiesPermission(): Promise<boolean> {
  return requestPermission({ permissions: "cookies" });
}

/**
 * Request webNavigation permission from user
 */
export async function requestWebNavigationPermission(): Promise<boolean> {
  return requestPermission({ permissions: "webNavigation" });
}

/**
 * Request host permission for backend domains
 */
export async function requestBackendHostPermission(): Promise<boolean> {
  return requestPermission({
    origins: [
      "https://encryptedclipboard.app/*",
      "https://encryptedclipboard.app/*",
    ],
  });
}

/**
 * Ensure host permission for backend domains
 */
export async function ensureBackendHostPermission(): Promise<boolean> {
  return ensurePermission({
    origins: [
      "https://encryptedclipboard.app/*",
      "https://encryptedclipboard.app/*",
    ],
  });
}

/**
 * Ensure origin permission (shorthand for origins-only)
 */
export async function ensureOriginPermission(
  origins: string | string[],
): Promise<boolean> {
  return ensurePermission({ origins });
}

/**
 * Check if cookies management requires permissions and user has premium access
 */
export interface FeaturePermissionStatus {
  hasPermission: boolean;
  isPremiumFeature: boolean;
  isPremiumUser: boolean;
  canUse: boolean;
  missingPermissions?: string[];
  reason?: string;
}

/**
 * Check if user can use cookies management feature
 */
export async function canUseCookiesFeature(
  isPremiumUser: boolean,
): Promise<FeaturePermissionStatus> {
  const hasCookies = await hasCookiesPermission();
  const hasWebNav = await hasWebNavigationPermission();

  return {
    hasPermission: hasCookies && hasWebNav,
    isPremiumFeature: true,
    isPremiumUser,
    canUse: isPremiumUser && hasCookies && hasWebNav,
    missingPermissions: [
      ...(!hasCookies ? ["cookies"] : []),
      ...(!hasWebNav ? ["webNavigation"] : []),
    ],
    reason: !isPremiumUser
      ? "Cookies management requires a premium subscription"
      : !hasCookies || !hasWebNav
        ? "Required permissions not granted"
        : undefined,
  };
}
