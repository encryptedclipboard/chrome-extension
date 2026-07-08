import { addGeneralMessageListener } from "@shared/utils/chrome-messaging.util";
import { MessageType, LogoutPayload } from "@shared/types";
import { init } from "./clipboard-background";
import { httpHandler } from "./handlers/http.handler";
import { emailVerifiedSyncHandler } from "./handlers/email-verified-sync.handler";
import { clipboardUnsyncItemHandler } from "./handlers/clipboard-unsync-item.handler";
import { subscriptionSyncHandler } from "./handlers/subscription-sync.handler";
import { authSuccessHandler } from "./handlers/auth-success.handler";
import { onInstalledHandler } from "./handlers/on-installed.handler";
import { handleRemoteLogout } from "./handlers/remote-logout.handler";

// Initialize Background Services
init().catch(console.error);

chrome.runtime.onInstalled.addListener(onInstalledHandler);

// Setup message handlers using the new messaging utilities
// Message listeners are handled in clipboard-background.ts via mainMessageHandler
