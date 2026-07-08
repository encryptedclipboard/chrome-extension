import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { browserAPI } from "@shared/utils/browser-api.util";
import { logError } from "./error-formatter.util";
import { getSafeErrorMessage } from "./safe-error.util";
import { getApiBaseUrl, API_CONFIG } from "../../config";

/**
 * Initialize Axios instance with interceptors for authentication
 */
export default function initAxios(): AxiosInstance {
  const http = axios.create({
    baseURL: getApiBaseUrl(),
    timeout: API_CONFIG.TIMEOUT,
    // Use fetch adapter to avoid XHR/document access in Service Worker
    adapter: "fetch",
    headers: {
      "Content-Type": "application/json",
    },
  });

  // Request interceptor - Add auth token from chrome storage
  http.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      try {
        const result = await browserAPI.storage.local.get(["authToken"]);
        if (result.authToken) {
          config.headers.Authorization = `Bearer ${result.authToken}`;
        }
      } catch (error) {
        logError("[Axios] Failed to fetch auth token from storage", error);
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // Response interceptor - Handle unauthorized responses consistently
  http.interceptors.response.use(
    (response) => response,
    async (error) => {
      // Check for 401 status safely
      try {
        if (error && error.response && error.response.status === 401) {
          await browserAPI.storage.local.remove([
            "authToken",
            "user",
            "subscriptionStatus",
          ]);

          try {
            browserAPI.runtime.sendMessage({ type: "AUTH_EXPIRED" });
          } catch (sendError) {
            logError(
              "[Axios] Failed to broadcast AUTH_EXPIRED message",
              sendError,
            );
          }
        }
      } catch {
        // Ignore errors when checking status
      }

      // Create a completely safe error using our utility
      const safeError = new Error(
        getSafeErrorMessage(error, "Network request failed"),
      );

      // Try to preserve useful error information in a safe way
      try {
        if (error && typeof error === "object") {
          if ("response" in error && error.response) {
            const response = error.response;
            (safeError as any).response = {
              status: response.status || 0,
              statusText: response.statusText || "",
              data: response.data || null,
            };
          }

          if ("config" in error && error.config) {
            const config = error.config;
            (safeError as any).config = {
              url: config.url || "",
              method: config.method || "",
            };
          }
        }
      } catch {
        // If we can't preserve error info, that's okay
      }

      return Promise.reject(safeError);
    },
  );

  return http;
}
