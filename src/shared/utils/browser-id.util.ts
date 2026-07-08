import { browserAPI } from "./browser-api.util";

const BROWSER_ID_KEY = "ecm_browser_id";

/**
 * Generates a UUID v4
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Gets or creates a unique browser ID
 * This ID is stored in local storage and persists across sessions
 * It's used to track browser instances and enforce device limits
 */
export async function getBrowserId(): Promise<string> {
  try {
    // Try to get existing browser ID from extension storage
    // using browserAPI wrapper which handles chrome vs browser namespace
    const result = await chrome.storage.local.get([BROWSER_ID_KEY]);

    if (result && result[BROWSER_ID_KEY]) {
      return result[BROWSER_ID_KEY] as string;
    }

    // Generate new browser ID if none exists
    const newBrowserId = generateUUID();
    await browserAPI.storage.local.set({ [BROWSER_ID_KEY]: newBrowserId });

    // Generated new browser ID

    return newBrowserId;
  } catch (error) {
    console.error("[Browser ID] Error getting/creating browser ID:", error);
    // Return a temporary ID as fallback
    return `temp-${generateUUID()}`;
  }
}

/**
 * Gets browser information for fingerprinting
 * Safe for Service Worker environment (no DOM access)
 */
export function getBrowserInfo() {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;

  // Extract browser name and version
  let browserName = "Unknown";
  let browserVersion = "Unknown";

  if (userAgent.indexOf("Firefox") > -1) {
    browserName = "Firefox";
    const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  } else if (userAgent.indexOf("Edg") > -1) {
    browserName = "Edge";
    const match = userAgent.match(/Edg\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  } else if (userAgent.indexOf("Chrome") > -1) {
    browserName = "Chrome";
    const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  } else if (userAgent.indexOf("Safari") > -1) {
    browserName = "Safari";
    const match = userAgent.match(/Version\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  }

  // Extract OS name and version
  let osName = "Unknown";
  let osVersion = "Unknown";

  if (platform.indexOf("Win") > -1) {
    osName = "Windows";
    const match = userAgent.match(/Windows NT (\d+\.\d+)/);
    if (match) osVersion = match[1];
  } else if (platform.indexOf("Mac") > -1) {
    osName = "macOS";
    const match = userAgent.match(/Mac OS X (\d+[._]\d+[._]\d+)/);
    if (match) osVersion = match[1].replace(/_/g, ".");
  } else if (platform.indexOf("Linux") > -1) {
    osName = "Linux";
  }

  return {
    userAgent,
    platform,
    browserName,
    browserVersion,
    osName,
    osVersion,
  };
}

/**
 * Gets browser fingerprint data for anti-tampering detection
 * Safe for Service Worker environment
 */
export function getBrowserFingerprint() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const language = navigator.language;

  // Handle Service Worker environment where window is undefined
  let screenResolution = "1920x1080"; // Default
  try {
    if (typeof window !== "undefined" && window.screen) {
      screenResolution = `${window.screen.width}x${window.screen.height}`;
    }
  } catch (e) {
    // Ignore
  }

  const userAgent = navigator.userAgent;

  // Create a hash of the fingerprint properties
  const fingerprintString = `${userAgent}|${timezone}|${language}|${screenResolution}`;
  const hash = simpleHash(fingerprintString);

  return {
    userAgent,
    timezone,
    language,
    screenResolution,
    hash,
  };
}

/**
 * Simple hash function for fingerprinting
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
