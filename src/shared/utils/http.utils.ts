import { API_CONFIG } from "@config";
import { getBrowserId } from "@shared/utils/browser-id.util";
import { StorageUtil } from "@shared/utils/extension-storage.util";
import { sendUnauthorizedError } from "@shared/utils/message.utils";

const recentResponseTimes: number[] = [];
const MAX_TRACKED_TIMES = 10;
const BASE_TIMEOUT = 180000;

function getAdaptiveTimeout(): number {
  if (recentResponseTimes.length === 0) return BASE_TIMEOUT;

  const avg =
    recentResponseTimes.reduce((a, b) => a + b, 0) / recentResponseTimes.length;
  const multiplier = Math.max(1, avg / 30000);

  return Math.min(600000, Math.round(BASE_TIMEOUT * multiplier));
}

export async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await StorageUtil.getAuthToken();
  const browserId = await getBrowserId();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (browserId) {
    headers["x-browser-id"] = browserId;
  } else {
    console.warn("[HTTP] WARNING: Browser ID is missing in fetchWithAuth!");
  }

  const controller = new AbortController();
  const timeout = getAdaptiveTimeout();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const startTime = Date.now();

  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      const error: any = new Error(
        data.message || response.statusText || "Request failed",
      );
      error.response = { status: response.status, data };
      if (response.status === 401) {
        sendUnauthorizedError();
      }
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;
    recentResponseTimes.push(elapsed);
    if (recentResponseTimes.length > MAX_TRACKED_TIMES)
      recentResponseTimes.shift();
  }
}
