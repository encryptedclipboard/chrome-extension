import { browserAPI } from "./browser-api.util";
import {
  MessageType,
  type ChromeMessage,
  type ChromeMessageResponse,
  type HttpRequestPayload,
  type HttpResponsePayload,
} from "../types/message.types";
import { logError } from "./error-formatter.util";

/**
 * Send a message to the background script
 */
export async function sendToBackground<T = any>(
  type: MessageType | string,
  payload?: any,
): Promise<ChromeMessageResponse<T>> {
  const message: ChromeMessage = {
    type,
    payload,
    timestamp: Date.now(),
  };

  return new Promise((resolve) => {
    browserAPI.runtime
      .sendMessage(message)
      .then((response) => {
        resolve(response || { success: true });
      })
      .catch((error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });
  });
}

/**
 * Send a message to a specific tab
 */
export async function sendToTab<T = any>(
  tabId: number,
  type: MessageType | string,
  payload?: any,
): Promise<ChromeMessageResponse<T>> {
  if (!browserAPI.tabs) {
    return {
      success: false,
      error: "Tabs API not available",
    };
  }

  const message: ChromeMessage = {
    type,
    payload,
    tabId,
    timestamp: Date.now(),
  };

  return new Promise((resolve) => {
    browserAPI
      .tabs!.sendMessage(tabId, message)
      .then((response) => {
        resolve(response || { success: true });
      })
      .catch((error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });
  });
}

/**
 * Broadcast a message to all tabs (via background script)
 */
export async function broadcastToAllTabs(
  type: MessageType | string,
  payload?: any,
): Promise<ChromeMessageResponse> {
  const message: ChromeMessage = {
    type,
    payload,
    timestamp: Date.now(),
  };

  return new Promise((resolve) => {
    browserAPI.runtime
      .sendMessage({ ...message, broadcast: true })
      .then((response) => {
        resolve(response || { success: true });
      })
      .catch((error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });
  });
}

/**
 * Send a message to all tabs directly (use from background script only)
 */
export async function sendToAllTabs(
  type: MessageType | string,
  payload?: any,
): Promise<void> {
  if (!browserAPI.tabs) return;

  const message: ChromeMessage = {
    type,
    payload,
    timestamp: Date.now(),
  };

  try {
    const tabs = await browserAPI.tabs!.query({});
    const promises = tabs.map((tab) => {
      if (tab.id) {
        return browserAPI.tabs!.sendMessage(tab.id, message).catch(() => {
          // Silently ignore errors for tabs that can't receive messages
        });
      }
      return Promise.resolve();
    });
    await Promise.all(promises);
  } catch (error) {
    logError("Error broadcasting to all tabs", error);
  }
}

/**
 * Add a typed message listener
 */
export function addMessageListener<T = any>(
  type: MessageType | string,
  handler: (payload: T, sender: any) => Promise<any> | any,
): void {
  browserAPI.runtime.onMessage.addListener(
    (message: ChromeMessage<T>, sender: any, sendResponse: any) => {
      if (message.type === type) {
        const result = handler(message.payload as T, sender);

        if (result instanceof Promise) {
          result
            .then((data) => sendResponse({ success: true, data }))
            .catch((error) =>
              sendResponse({ success: false, error: error.message }),
            );
          return true; // Keep channel open for async response
        } else {
          sendResponse({ success: true, data: result });
          return false;
        }
      }
      return false;
    },
  );
}

/**
 * Add a general message listener that handles multiple message types
 */
export function addGeneralMessageListener(
  handlers: Partial<
    Record<
      MessageType | string,
      (payload: any, sender: any) => Promise<any> | any
    >
  >,
): void {
  browserAPI.runtime.onMessage.addListener(
    (message: ChromeMessage, sender: any, sendResponse: any) => {
      const handler = handlers[message.type];

      if (handler) {
        const result = handler(message.payload, sender);

        if (result instanceof Promise) {
          result
            .then((data) => sendResponse({ success: true, data }))
            .catch((error) =>
              sendResponse({ success: false, error: error.message }),
            );
          return true; // Keep channel open for async response
        } else {
          sendResponse({ success: true, data: result });
          return false;
        }
      }

      return false;
    },
  );
}

/**
 * Send auth success message
 */
export async function sendAuthSuccess(
  token: string,
  user?: any,
): Promise<ChromeMessageResponse> {
  return sendToBackground(MessageType.AUTH_SUCCESS, { token, user });
}

/**
 * Send logout message
 */
export async function sendLogout(
  clearStorage = true,
  keepData = true,
): Promise<ChromeMessageResponse> {
  // Send to background to trigger cleanup/retention logic
  // We MUST await this to ensure data is cleared/persisted before UI reloads
  try {
    const response = await sendToBackground(MessageType.LOGOUT, {
      clearStorage,
      keepData,
    });

    if (!response.success) {
      console.error("Background logout failed:", response.error);
    }
  } catch (e) {
    console.error("Failed to send logout to background:", e);
  }

  // Broadcast to all tabs to update UI/Content Scripts
  return broadcastToAllTabs(MessageType.LOGOUT, {
    clearStorage,
  });
}
