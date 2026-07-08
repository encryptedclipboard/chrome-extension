import type {
  IApiResponse,
  IUserResponse,
  ISubscriptionStatusResponse,
} from "@shared/types";
import { getErrMeta } from "../utils/error-handler.util";
import { BaseService } from "./base.service";
import { backgroundHttp } from "../utils/background-http.util";
import { API_CONFIG } from "../../config/index";

export class ExtensionService extends BaseService {
  async getCurrentUser() {
    return this.http
      .get<IApiResponse<{ user: IUserResponse }>>("/extension/auth/me")
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from current user request");
        }
        return resp.data;
      })
      .catch((err) => {
        const meta = getErrMeta(err);
        const e: any = new Error(meta.message);
        e.code = meta.code;
        e.status = meta.status;
        return Promise.reject(e);
      });
  }

  async verifySubscription() {
    // Verifying subscription...
    return this.http
      .get<IApiResponse<ISubscriptionStatusResponse>>(
        "/extension/subscriptions/status",
      )
      .then((resp) => {
        if (!resp.data) {
          console.error(
            "[EXTENSION-SERVICE] No data returned from subscription status",
          );
          throw new Error("No data returned from subscription status");
        }
        return resp.data;
      })
      .catch((err) => {
        console.error("[EXTENSION-SERVICE] verifySubscription error:", err);
        const meta = getErrMeta(err);
        const e: any = new Error(meta.message);
        e.code = meta.code;
        e.status = meta.status;
        return Promise.reject(e);
      });
  }

  /**
   * Verify subscription via background script to bypass CORS restrictions in content scripts
   * Use this method when calling from content scripts (e.g., sidebar)
   */
  async verifySubscriptionViaBackground(token?: string) {
    return backgroundHttp(
      API_CONFIG.BASE_URL,
      "GET",
      "/extension/subscriptions/status",
      {
        token,
      },
    )
      .then((resp: any) => {
        const subscriptionData = resp.data?.data || resp.data;
        if (!subscriptionData) {
          throw new Error("No data returned from subscription status");
        }
        return subscriptionData as ISubscriptionStatusResponse;
      })
      .catch((err) => {
        const meta = getErrMeta(err);
        const e: any = new Error(meta.message);
        e.code = meta.code;
        e.status = meta.status;
        return Promise.reject(e);
      });
  }
}
