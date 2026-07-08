import { lockService } from "../services";

const floatingScriptFiles = ["clipboard-palette/clipboard-palette.js"];

export async function injectFloatingClipboard(tabId: number): Promise<boolean> {
  try {
    // 1. Get tab details to check URL
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return false;

    // 2. Define restricted schemes and domains
    const restrictedSchemes = [
      "chrome://",
      "brave://",
      "edge://",
      "about:",
      "chrome-extension:",
      "view-source:",
      "devtools://",
    ];

    const restrictedDomains = [
      "chrome.google.com/webstore",
      "chromewebstore.google.com",
    ];

    // 3. Skip injection if URL is restricted
    const isRestrictedScheme = restrictedSchemes.some((scheme) =>
      tab.url?.startsWith(scheme),
    );

    const isRestrictedDomain = restrictedDomains.some((domain) =>
      tab.url?.includes(domain),
    );

    if (isRestrictedScheme || isRestrictedDomain) {
      return false;
    }

    // 4. Skip if clipboard is locked
    if (await lockService.isLockActive()) {
      return false;
    }

    // 5. Check if cbPalette is already injected (sentinel guard)
    // Prevents listener accumulation from multi-injection on SPA tab updates
    let isInjected = false;
    try {
      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => (window as any)["__ecmCbPalette_injected"] === true,
      });
      isInjected = injectionResult?.result === true;
    } catch (_) {
      // Tab might not be ready; proceed with injection
    }

    if (isInjected) {
      return false;
    }

    // 6. Proceed with injection
    await chrome.scripting.executeScript({
      target: { tabId },
      files: floatingScriptFiles,
    });
    return true;
  } catch (_) {
    return false;
  }
}

export async function removeFloatingClipboard(tabId: number) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "DESTROY_FLOATING_CLIPBOARD",
    });
  } catch (err) {
    // Tab might be closed or script not there
  }
}
