import type { IApiResponse, ISubscriptionStatusResponse } from "@shared/types";
import { getErrMsg, getErrMeta } from "../utils/error-handler.util";
import { BaseService } from "./base.service";

export class SubscriptionService extends BaseService {
  async getStatus() {
    return this.http
      .get<IApiResponse<ISubscriptionStatusResponse>>(
        "/extension/subscriptions/status",
      )
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from subscription status");
        }
        // Response structure: axios resp.data = { data: ISubscriptionStatusResponse }
        // which matches IApiResponse<ISubscriptionStatusResponse>
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
}
