import { authService, clipboardPushService } from "../services";
import { updateContextMenus } from "../utils/context-menu.util";

export const emailVerifiedSyncHandler = async (payload: { token: string }) => {
  try {
    if (payload && payload.token) {
      const authResponse = await authService.exchangeToken(payload.token);

      if (authResponse) {
        await clipboardPushService.init();
        await updateContextMenus();

        chrome.notifications?.create("", {
          type: "basic",
          iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
          title: "Email Verified",
          message:
            "Your email has been successfully verified! Extension updated.",
        });

        return { success: true, data: authResponse };
      }
    }

    return { success: false, error: "Sync failed" };
  } catch (error) {
    return {
      success: false,
      error: "Internal sync error",
    };
  }
};
