/**
 * Chrome API Direct Access
 * Refactored to use 'chrome' directly as the single source of truth.
 */

export const browserAPI = chrome;

export function isBrowserEnvironment(): boolean {
  return typeof chrome !== "undefined" && !!chrome?.runtime;
}

export function isFirefox(): boolean {
  return false;
}

export function isChrome(): boolean {
  return true;
}
