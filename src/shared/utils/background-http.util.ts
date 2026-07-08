/**
 * HTTP utility that uses background script to make requests
 * This bypasses content script CSP restrictions and ad blocker blocking
 *
 * SECURITY: Content script provides the base URL to avoid exposing it in background script
 * (background scripts are not minified, while Vue content scripts are)
 */

import { sendToBackground } from "./chrome-messaging.util";
import {
  MessageType,
  type HttpRequestPayload,
  type HttpResponsePayload,
} from "../types/message.types";
import { browserAPI } from "./browser-api.util";

/**
 * Make an HTTP request via background script
 * This bypasses CSP and ad blocker restrictions that affect content scripts
 *
 * @param baseURL - The base URL for API requests (from centralized config)
 * @param method - HTTP method
 * @param endpoint - API endpoint path (e.g., "/extension/cloud-data/push")
 * @param options - Request options (data, headers, token)
 */
export async function backgroundHttp<T = any>(
  baseURL: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  endpoint: string,
  options?: {
    data?: any;
    headers?: Record<string, string>;
    token?: string;
  },
): Promise<T> {
  // Get auth token from storage if not provided
  let authToken = options?.token;
  if (!authToken) {
    try {
      const result = await browserAPI.storage.local.get(["authToken"]);
      authToken = result.authToken as string | undefined;
    } catch (error) {
      // Console output removed for production/browser-store readiness
    }
  }

  const payload: HttpRequestPayload = {
    url: baseURL,
    endpoint,
    method,
    data: options?.data,
    token: authToken,
    headers: options?.headers,
  };

  // Check if we are running in the background script
  // Detect if we are in a Service Worker or Background Page context
  // Check if we are running in the background script
  // Detect if we are in a Service Worker OR Background Page context
  const isServiceWorker =
    typeof window === "undefined" ||
    (typeof self !== "undefined" &&
      self.constructor.name === "ServiceWorkerGlobalScope");

  // Check for Firefox background page
  let isBackgroundPage = false;
  try {
    // In Firefox/MV2, background is a window.
    // We check if we can access extension API and if we match the background page.
    const browserAny = (globalThis as any).browser;
    if (
      !isServiceWorker &&
      typeof browserAny !== "undefined" &&
      browserAny.extension &&
      browserAny.extension.getBackgroundPage
    ) {
      const bgPage = browserAny.extension.getBackgroundPage();
      isBackgroundPage = bgPage === window;
    }
  } catch (e) {
    // Ignore access errors
  }

  // If in any background context, use direct fetch
  if (isServiceWorker || isBackgroundPage) {
    // We are in background service worker (MV3 or Firefox background)
    // Execute fetch directly
    try {
      // Get auth token from storage if not provided
      let authToken = options?.token;
      if (!authToken) {
        const result = await browserAPI.storage.local.get(["authToken"]);
        authToken = result.authToken as string | undefined;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const fetchOptions: any = {
        method,
        headers,
      };

      // Ensure method is not GET or HEAD before attaching body
      const isGetOrHead = method === "GET" || (method as string) === "HEAD";
      if (options?.data && !isGetOrHead) {
        fetchOptions.body = JSON.stringify(options.data);
      }

      const fullUrl = `${baseURL}${endpoint}`;
      const response = await fetch(fullUrl, fetchOptions);

      let responseData;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        responseData = await response.json();
      } else {
        responseData = {};
      }

      if (!response.ok) {
        const error: any = new Error(
          responseData.message || response.statusText || "HTTP Request Failed",
        );
        error.response = {
          status: response.status,
          data: responseData,
          code: responseData.code,
        };
        if (response.status === 401) {
          chrome.runtime
            .sendMessage({ type: MessageType.UNAUTHORIZED_ERROR })
            .catch(() => {});
        }
        throw error;
      }

      return {
        data: responseData.data || responseData,
        message: responseData.message,
        code: responseData.code,
        status: response.status,
      } as any;
    } catch (error) {
      throw error;
    }
  }

  const response = await sendToBackground<HttpResponsePayload>(
    MessageType.SEND_HTTP_REQUEST,
    payload,
  );

  // Check if the request failed at the background script level
  if (!response.success || response.error) {
    const error: any = new Error(response.error || "HTTP request failed");
    error.response = {
      status: (response.data as any)?.status || 0,
      data: response.data,
      code: (response.data as any)?.code,
    };
    throw error;
  }

  // response.data is the HttpResponsePayload from background script
  // HttpResponsePayload structure: { success: boolean, data?: any, error?: string, status?: number }
  const httpResponse = response.data as HttpResponsePayload;

  // Check if server returned an error response (even if background script succeeded)
  if (
    httpResponse &&
    !httpResponse.success &&
    (httpResponse.error || (httpResponse.data as any)?.message)
  ) {
    const errorMessage =
      httpResponse.error ||
      (httpResponse.data as any)?.message ||
      "Server error";
    const error: any = new Error(errorMessage);
    error.response = {
      status: httpResponse.status || 500,
      data: httpResponse.data,
      code: (httpResponse as any).code,
    };
    throw error;
  }

  // Return a structured response object that mirrors axios behavior but includes
  // server-supplied meta fields such as message and code.
  // This keeps the extension services consistent with the rest of the app where
  // responses are Axios-style objects with a `.data` property, and also exposes
  // server provided `message` and programmatic `code` fields (e.g. EMAIL_NOT_VERIFIED).
  return {
    data: httpResponse.data as T,
    message:
      (httpResponse as any)?.message || (httpResponse.data as any)?.message,
    code: (httpResponse.data as any)?.code,
    status: httpResponse.status,
  } as any;
}

/**
 * Create an axios-like interface with a specific base URL
 * @param baseURL - The base URL for API requests
 */
export function createBackgroundAxios(baseURL: string) {
  return {
    get: <T = any>(
      endpoint: string,
      config?: { params?: any; headers?: Record<string, string> },
    ) => {
      // Convert params to query string
      let url = endpoint;
      if (config?.params) {
        const params = new URLSearchParams(config.params).toString();
        url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}${params}`;
      }
      return backgroundHttp<T>(baseURL, "GET", url, {
        headers: config?.headers,
      });
    },

    post: <T = any>(
      endpoint: string,
      data?: any,
      config?: { headers?: Record<string, string> },
    ) => {
      return backgroundHttp<T>(baseURL, "POST", endpoint, {
        data,
        headers: config?.headers,
      });
    },

    put: <T = any>(
      endpoint: string,
      data?: any,
      config?: { headers?: Record<string, string> },
    ) => {
      return backgroundHttp<T>(baseURL, "PUT", endpoint, {
        data,
        headers: config?.headers,
      });
    },

    patch: <T = any>(
      endpoint: string,
      data?: any,
      config?: { headers?: Record<string, string> },
    ) => {
      return backgroundHttp<T>(baseURL, "PATCH", endpoint, {
        data,
        headers: config?.headers,
      });
    },

    delete: <T = any>(
      endpoint: string,
      config?: { headers?: Record<string, string> },
    ) => {
      return backgroundHttp<T>(baseURL, "DELETE", endpoint, {
        headers: config?.headers,
      });
    },
  };
}
