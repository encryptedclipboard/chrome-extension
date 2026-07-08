import { HttpRequestPayload, HttpResponsePayload } from "@/shared/types";
import { getErrorMessage } from "../utils/error.util";

export const httpHandler = async (
  payload: HttpRequestPayload,
): Promise<HttpResponsePayload> => {
  try {
    const fullUrl = `${payload.url}${payload.endpoint}`;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(payload.headers || {}),
    };

    if (payload.token) headers["Authorization"] = `Bearer ${payload.token}`;

    const requestInit: RequestInit = {
      method: payload.method,
      headers,
      mode: "cors",
      credentials: "omit",
    };

    if (payload.data && ["POST", "PUT", "PATCH"].includes(payload.method)) {
      requestInit.body = JSON.stringify(payload.data);
    }

    const response = await fetch(fullUrl, requestInit);
    let responseData: Record<string, any>;

    try {
      responseData = await response.json();
    } catch {
      try {
        responseData = { message: await response.text() };
      } catch {
        responseData = { message: `HTTP ${response.status}` };
      }
    }

    if (!response.ok) {
      return {
        success: false,
        error: responseData.message || response.statusText,
        status: response.status,
        data: responseData,
        code: responseData?.code,
      } as HttpResponsePayload;
    }
    return {
      success: true,
      data: responseData,
      status: response.status,
      code: responseData?.code,
    } as HttpResponsePayload;
  } catch (error: any) {
    const msg = getErrorMessage(error);
    return { success: false, error: msg, status: 0, data: { message: msg } };
  }
};
