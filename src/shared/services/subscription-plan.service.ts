import type { IApiResponse, ISubscriptionPlanSummary } from "../types";
import { getErrMsg, getErrMeta } from "../utils/error-handler.util";
import { BaseService } from "./base.service";

export class SubscriptionPlanService extends BaseService {
  async getPlans() {
    return this.http
      .get<IApiResponse<{ plans: ISubscriptionPlanSummary[] }>>(
        "/extension/subscriptions/plans",
      )
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from subscription plans");
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

  async getPlan(planId: string) {
    return this.getPlans()
      .then((resp) => {
        const plan = resp.data?.plans?.find((p) => p._id === planId);
        if (!plan) {
          throw new Error("Plan not found");
        }
        return plan;
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
