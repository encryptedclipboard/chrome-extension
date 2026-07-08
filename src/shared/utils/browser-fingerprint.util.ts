/**
 * Browser Fingerprinting Utility
 *
 * Generates a unique, stable fingerprint for browser identification.
 * Combines multiple signals to detect device changes while maintaining
 * consistency across sessions on the same device.
 */

import type { FingerprintComponents } from "../types/fingerprint.types";

/**
 * Generate canvas fingerprint
 */
async function getCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";

    canvas.width = 200;
    canvas.height = 50;

    // Draw with specific text and styling
    ctx.textBaseline = "top";
    ctx.font = '14px "Arial"';
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("ClipboardPro 🔐", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("ClipboardPro 🔐", 4, 17);

    // Get image data hash
    const dataUrl = canvas.toDataURL();
    return await hashString(dataUrl);
  } catch (error) {
    console.error("Canvas fingerprint error:", error);
    return "canvas-error";
  }
}

/**
 * Generate WebGL fingerprint
 */
async function getWebGLFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "no-webgl";

    const debugInfo = (gl as any).getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return "no-debug-info";

    const vendor = (gl as any).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = (gl as any).getParameter(
      debugInfo.UNMASKED_RENDERER_WEBGL,
    );

    return await hashString(`${vendor}|${renderer}`);
  } catch (error) {
    console.error("WebGL fingerprint error:", error);
    return "webgl-error";
  }
}

/**
 * Generate audio fingerprint
 */
async function getAudioFingerprint(): Promise<string> {
  try {
    const context = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const oscillator = context.createOscillator();
    const analyser = context.createAnalyser();
    const gainNode = context.createGain();
    const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

    gainNode.gain.value = 0; // Mute
    oscillator.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(0);

    return new Promise<string>((resolve) => {
      scriptProcessor.onaudioprocess = (event) => {
        const output = event.inputBuffer.getChannelData(0);
        const sum = output.reduce((acc, val) => acc + Math.abs(val), 0);
        oscillator.stop();
        context.close();
        resolve(hashString(sum.toString()));
      };
    });
  } catch (error) {
    console.error("Audio fingerprint error:", error);
    return "audio-error";
  }
}

/**
 * Get screen information
 */
function getScreenInfo(): string {
  const screen = window.screen;
  return `${screen.width}x${screen.height}x${screen.colorDepth}|${screen.availWidth}x${screen.availHeight}`;
}

/**
 * Get hardware concurrency (CPU cores)
 */
function getHardwareInfo(): string {
  return `cores:${navigator.hardwareConcurrency || "unknown"}|memory:${(navigator as any).deviceMemory || "unknown"}`;
}

/**
 * Get timezone information
 */
function getTimezoneInfo(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get language preferences
 */
function getLanguageInfo(): string {
  return `${navigator.language}|${navigator.languages.join(",")}`;
}

/**
 * Get platform information
 */
function getPlatformInfo(): string {
  return `${navigator.platform}|${navigator.userAgent}`;
}

/**
 * Get installed plugins (for browsers that support it)
 */
function getPluginsInfo(): string {
  try {
    if (!navigator.plugins || navigator.plugins.length === 0) {
      return "no-plugins";
    }
    const pluginNames = Array.from(navigator.plugins)
      .map((p) => p.name)
      .sort()
      .join("|");
    return pluginNames;
  } catch (error) {
    return "plugins-error";
  }
}

/**
 * Detect available fonts
 */
async function getFontsInfo(): Promise<string> {
  try {
    // Test for common fonts
    const testFonts = [
      "Arial",
      "Verdana",
      "Times New Roman",
      "Courier New",
      "Georgia",
      "Palatino",
      "Garamond",
      "Comic Sans MS",
      "Trebuchet MS",
      "Impact",
      "Lucida Console",
    ];

    const availableFonts: string[] = [];
    const baseFonts = ["monospace", "sans-serif", "serif"];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";

    const testString = "mmmmmmmmmmlli";
    const testSize = "72px";

    // Get baseline measurements
    const baselines: { [key: string]: { width: number; height: number } } = {};
    for (const baseFont of baseFonts) {
      ctx.font = `${testSize} ${baseFont}`;
      const metrics = ctx.measureText(testString);
      baselines[baseFont] = {
        width: metrics.width,
        height:
          metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
      };
    }

    // Test each font against baselines
    for (const font of testFonts) {
      let detected = false;
      for (const baseFont of baseFonts) {
        ctx.font = `${testSize} '${font}', ${baseFont}`;
        const metrics = ctx.measureText(testString);
        const width = metrics.width;
        const height =
          metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

        if (
          width !== baselines[baseFont].width ||
          height !== baselines[baseFont].height
        ) {
          detected = true;
          break;
        }
      }
      if (detected) {
        availableFonts.push(font);
      }
    }

    return availableFonts.sort().join("|");
  } catch (error) {
    console.error("Font detection error:", error);
    return "fonts-error";
  }
}

/**
 * Hash a string using SHA-256
 */
async function hashString(str: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  } catch (error) {
    console.error("Hash error:", error);
    // Fallback to simple hash if crypto API fails
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Generate complete browser fingerprint
 */
export async function generateFingerprint(): Promise<string> {
  try {
    // Generating browser fingerprint...

    // Collect all fingerprint components
    const components: FingerprintComponents = {
      canvas: await getCanvasFingerprint(),
      webgl: await getWebGLFingerprint(),
      audio: await getAudioFingerprint(),
      screen: getScreenInfo(),
      hardware: getHardwareInfo(),
      timezone: getTimezoneInfo(),
      language: getLanguageInfo(),
      platform: getPlatformInfo(),
      plugins: getPluginsInfo(),
      fonts: await getFontsInfo(),
    };

    // Combine all components
    const combined = Object.entries(components)
      .map(([key, value]) => `${key}:${value}`)
      .join("|");

    // Generate final hash
    const fingerprint = await hashString(combined);
    // Generated fingerprint

    return fingerprint;
  } catch (error) {
    console.error("❌ Fingerprint generation failed:", error);
    // Generate fallback fingerprint
    const fallback = `fallback-${Date.now()}-${Math.random()}`;
    return hashString(fallback);
  }
}

/**
 * Get or generate browser ID
 * This ID persists across sessions and is validated against fingerprint
 */
export async function getBrowserId(): Promise<{
  browserId: string;
  fingerprint: string;
}> {
  const STORAGE_KEY = "clipboardpro_browser_id";
  const FINGERPRINT_KEY = "clipboardpro_fingerprint";

  try {
    // Generate current fingerprint
    const currentFingerprint = await generateFingerprint();

    // Get stored browser ID and fingerprint
    const storedBrowserId = localStorage.getItem(STORAGE_KEY);
    const storedFingerprint = localStorage.getItem(FINGERPRINT_KEY);

    // If no stored ID or fingerprint changed significantly, generate new ID
    if (!storedBrowserId || !storedFingerprint) {
      // No stored browser ID, generating new one
      const newBrowserId = await generateBrowserId();
      localStorage.setItem(STORAGE_KEY, newBrowserId);
      localStorage.setItem(FINGERPRINT_KEY, currentFingerprint);
      return { browserId: newBrowserId, fingerprint: currentFingerprint };
    }

    // Validate fingerprint hasn't changed too much
    const fingerprintMatch = await validateFingerprint(
      storedFingerprint,
      currentFingerprint,
    );

    if (!fingerprintMatch) {
      // Fingerprint changed, generating new browser ID
      const newBrowserId = await generateBrowserId();
      localStorage.setItem(STORAGE_KEY, newBrowserId);
      localStorage.setItem(FINGERPRINT_KEY, currentFingerprint);
      return { browserId: newBrowserId, fingerprint: currentFingerprint };
    }

    // Update fingerprint to latest
    localStorage.setItem(FINGERPRINT_KEY, currentFingerprint);

    // Using stored browser ID
    return { browserId: storedBrowserId, fingerprint: currentFingerprint };
  } catch (error) {
    console.error("❌ getBrowserId failed:", error);
    throw error;
  }
}

/**
 * Generate a unique browser ID
 */
async function generateBrowserId(): Promise<string> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const fingerprint = await generateFingerprint();
  const combined = `${timestamp}-${random}-${fingerprint}`;
  return hashString(combined);
}

/**
 * Validate if two fingerprints are similar enough
 * (allows for minor variations due to browser updates, etc.)
 */
async function validateFingerprint(
  stored: string,
  current: string,
): Promise<boolean> {
  // For now, require exact match
  // In production, you might want to implement fuzzy matching
  return stored === current;
}

/**
 * Clear stored browser ID (for testing or reset)
 */
export function clearBrowserId(): void {
  localStorage.removeItem("clipboardpro_browser_id");
  localStorage.removeItem("clipboardpro_fingerprint");
  // Cleared browser ID
}
