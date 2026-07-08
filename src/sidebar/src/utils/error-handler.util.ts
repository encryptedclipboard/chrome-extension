/**
 * Error Handler Utility
 *
 * Maps technical error messages to human-readable ones for UI toasts.
 */
export function getErrorMessage(error: any): string {
  if (!error) return "An unknown error occurred";

  const message =
    typeof error === "string"
      ? error
      : error.message || "An unknown error occurred";

  // Security/Crypto Errors
  if (
    message.includes("encryptData is not a function") ||
    message.includes("decryptData is not a function")
  ) {
    return "Security engine error. Please reload the extension.";
  }

  if (
    message.includes("Failed to decrypt") ||
    message.includes("Wrong password") ||
    message.includes("Incorrect password") ||
    message.includes("Invalid PIN")
  ) {
    return "Incorrect PIN or password. Please try again.";
  }

  if (message.includes("Master password must be at least 8 characters")) {
    return "Master password must be at least 8 characters long.";
  }

  // Network/Sync Errors
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Network error. Please check your connection.";
  }

  if (message.includes("Sync failed")) {
    return "Cloud sync failed. Will retry automatically.";
  }

  // Generic fallback: Strip technical prefixes if they exist
  if (message.startsWith("Error: ")) {
    return message.substring(7);
  }

  return message;
}
