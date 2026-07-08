import { updateContextMenus } from "../utils/context-menu.util";
import { authService, clipboardPushService } from "../services";

export const subscriptionSyncHandler = async ({
  token,
}: {
  token?: string;
}) => {
  try {
    if (!token) {
      return { success: false, error: "Sync failed" };
    }

    const authResponse = await authService.exchangeToken(token);

    if (authResponse) {
      await clipboardPushService.init();
      await updateContextMenus();

      chrome.notifications?.create("", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
        title: "Subscription Updated",
        message: "Your subscription verification was successful!",
      });

      return { success: true, data: authResponse };
    }
  } catch (error) {
    return { success: false, error: "Internal sync error" };
  }
};
