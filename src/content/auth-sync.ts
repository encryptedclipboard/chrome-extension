import {
  ECM_LOGIN_EVENT,
  ECM_LOGOUT_EVENT,
  ECM_EXTENSION_READY_EVENT,
  ECM_SUBSCRIPTION_UPDATED_EVENT,
  ECM_EMAIL_VERIFIED_EVENT,
} from "@shared/utils/events.util";
import { browserAPI } from "@shared/utils/browser-api.util";

// Listen for login events from the web app
document.addEventListener(ECM_LOGIN_EVENT, (event: any) => {
  const { token, user, subscription, planName, hasSyncedItems } = event.detail;

  if (token && user) {
    browserAPI.runtime
      .sendMessage({
        type: "LOGIN_SYNC",
        payload: { token, user, subscription, planName, hasSyncedItems },
      })
      .catch((error) => {
        console.error("[ECM Extension] LOGIN_SYNC sending failed:", error);
      });
  }
});

// Subscription update events handled below...

// Listen for subscription update events from the web app
document.addEventListener(ECM_SUBSCRIPTION_UPDATED_EVENT, (event: any) => {
  const { token } = event.detail;

  if (token) {
    browserAPI.runtime.sendMessage({
      type: "SUBSCRIPTION_SYNC",
      payload: { token },
    });
  }
});

// Listen for email verification events from the web app
document.addEventListener(ECM_EMAIL_VERIFIED_EVENT, (event: any) => {
  const { token } = event.detail;

  if (token) {
    browserAPI.runtime.sendMessage({
      type: "EMAIL_VERIFIED_SYNC",
      payload: { token },
    });
  }
});

// Dispatch extension ready event to request current auth state
// This handles the case where the user is already logged in when the extension loads
document.dispatchEvent(new CustomEvent(ECM_EXTENSION_READY_EVENT));
