import { handleRemoteLogout } from "./remote-logout.handler";
import { getBrowserId } from "@shared/utils/browser-id.util";

export const logoutHandler = async (payload?: any) => {
  // Check target browser ID if provided
  if (payload?.targetBrowserId) {
    const myBrowserId = await getBrowserId();
    if (payload.targetBrowserId !== myBrowserId) {
      return;
    }
  }

  // Show notification first (required for push events)
  const swSelf = self as any;
  if (swSelf.registration && swSelf.registration.showNotification) {
    await swSelf.registration.showNotification("Logged Out", {
      body: "You have been logged out remotely.",
      icon: chrome.runtime.getURL("assets/icons/icon.png"),
      badge: chrome.runtime.getURL("assets/icons/icon.png"),
      tag: "logout",
      requireInteraction: false,
    });
  }

  await handleRemoteLogout(true);
};
