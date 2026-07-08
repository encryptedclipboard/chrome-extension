import { sendToAllTabs } from "@/shared/utils/chrome-messaging.util";
import { clipboardPushService } from "../services";
import { MessageType } from "@/shared/types";
import { sendAuthSuccess } from "@shared/utils/message.utils";

export const authSuccessHandler = async (payload: Record<string, any>) => {
  try {
    const sanitizedPayload = { ...payload };
    delete sanitizedPayload.token;
    delete sanitizedPayload.authToken;
    delete sanitizedPayload.accessToken;
    delete sanitizedPayload.isReconnect;

    await sendToAllTabs(MessageType.AUTH_SUCCESS, sanitizedPayload);

    sendAuthSuccess(sanitizedPayload);

    if (!payload.isReconnect) {
      chrome.notifications?.create("", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icons/icon.png"),
        title: "Logged In",
        message: "You are now logged in to Encrypted Clipboard Manager",
      });
    }

    await clipboardPushService.init();

    return { success: true };
  } catch (error) {
    console.error("Auth success handler error:", error);
    return { success: false, error: "Internal auth error" };
  }
};
