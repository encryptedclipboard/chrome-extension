import type { IApiResponse } from "@shared/types";
import { getErrMeta } from "../utils/error-handler.util";
import { BaseService } from "./base.service";

export class ShareService extends BaseService {
  /**
   * Create a sharable link
   */
  async createSharedLink(payload: any) {
    return this.http
      .post<IApiResponse<any>>("/extension/shared", payload)
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from shared link creation");
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

  /**
   * Get a shared item by shortId
   */
  async getSharedLink(shortId: string, password?: string) {
    const params = password ? { password } : {};
    return this.http
      .get<IApiResponse<any>>(`/extension/shared/link/${shortId}`, { params })
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from shared link fetch");
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

  /**
   * List user's shared links
   */
  async listSharedLinks() {
    return this.http
      .get<IApiResponse<any[]>>("/extension/shared")
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from shared links list request");
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

  /**
   * Delete a shared link
   */
  async deleteSharedLink(id: string) {
    return this.http
      .delete<IApiResponse<null>>(`/extension/shared/${id}`)
      .then((resp) => resp.data)
      .catch((err) => {
        const meta = getErrMeta(err);
        const e: any = new Error(meta.message);
        e.code = meta.code;
        e.status = meta.status;
        return Promise.reject(e);
      });
  }
}
