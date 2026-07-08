/**
 * Shared event constants for communication between web app and extension
 * All custom events use the "ecm:" prefix (Encrypted Clipboard Manager)
 */

export const ECM_LOGIN_EVENT = "ecm:login";
export const ECM_LOGOUT_EVENT = "ecm:logout";
export const ECM_AUTH_UPDATE_EVENT = "ecm:auth-update";
export const ECM_EXTENSION_READY_EVENT = "ecm:extension-ready";
export const ECM_SUBSCRIPTION_UPDATED_EVENT = "ecm:subscription-updated";
export const ECM_EMAIL_VERIFIED_EVENT = "ecm:email-verified";
