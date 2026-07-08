import type { IApiResponse } from "@shared/types";
import { getErrMsg, getErrMeta } from "../utils/error-handler.util";
import { BaseService } from "./base.service";

export interface SystemSettingsPayload {
  maintenance: {
    enabled: boolean;
    message: string;
    startTime?: string | null;
    endTime?: string | null;
  };
  payment: Record<string, unknown>;
  email: Record<string, unknown>;
  security: Record<string, unknown>;
  analytics: Record<string, unknown>;
  app: Record<string, unknown>;
}

export class SettingsService extends BaseService {
  async getSettings() {
    return this.http
      .get<IApiResponse<{ settings: SystemSettingsPayload }>>(
        "/extension/admin/settings",
      )
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from admin settings");
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

  async updateSettings(settings: Partial<SystemSettingsPayload>) {
    return this.http
      .put<IApiResponse<{ settings: SystemSettingsPayload }>>(
        "/extension/admin/settings",
        settings,
      )
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from admin settings update");
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
}
