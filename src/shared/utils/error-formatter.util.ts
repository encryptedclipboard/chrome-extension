/**
 * Formats error objects into readable strings for logging
 * Handles various error types: Error objects, axios errors, unknown objects
 */

import type {
  AxiosErrorResponse,
  AxiosError,
  ErrorLike,
} from "../types/error.types";

export function formatError(error: unknown): string {
  // Handle null/undefined
  if (error == null) {
    return "Unknown error (null/undefined)";
  }

  // Handle Error objects
  if (error instanceof Error) {
    // Check if it's an axios error with response data
    if ("response" in error && error.response) {
      const axiosErr = error as AxiosError;
      const response = axiosErr.response;
      if (response) {
        const status = response.status || "unknown";
        const message =
          response.data?.message ||
          response.data?.error ||
          response.statusText ||
          error.message;
        return `HTTP ${status}: ${message}`;
      }
    }

    // Regular Error object
    return error.message || error.toString();
  }

  // Handle objects with message property
  if (typeof error === "object" && "message" in error) {
    const errorLike = error as ErrorLike;
    return String(errorLike.message);
  }

  // Handle objects with error property
  if (typeof error === "object" && "error" in error) {
    const errorLike = error as ErrorLike;
    return String(errorLike.error);
  }

  // Handle plain objects - try to stringify
  if (typeof error === "object") {
    try {
      const jsonStr = JSON.stringify(error, null, 2);
      // If it's just an empty object, return a more helpful message
      if (jsonStr === "{}") {
        return "Unknown error (empty object)";
      }
      return jsonStr;
    } catch (e) {
      // If stringify fails (circular reference, etc.), use toString
      return Object.prototype.toString.call(error);
    }
  }

  // Handle primitives (string, number, boolean)
  return String(error);
}

/**
 * Logs error with proper formatting
 * @param prefix - Prefix message to identify where the error occurred
 * @param error - The error to log
 */
export function logError(prefix: string, error: unknown): void {
  // Console output removed for production/browser-store readiness.
  // This function intentionally does not write to the console in production.
}
