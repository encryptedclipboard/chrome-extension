import { BaseService } from "./base.service";
import type { IApiResponse, IAuthResponse } from "@shared/types";
import { getErrMeta } from "../utils/error-handler.util";
import { backgroundHttp } from "../utils/background-http.util";
import { API_CONFIG } from "@config";
import {
  getBrowserId,
  getBrowserInfo,
  getBrowserFingerprint,
} from "../utils/browser-id.util";

export class AuthService extends BaseService {
  // Only keep methods used by the extension UI. Unused admin/console methods removed.
  async signin(token: string) {
    // Get or create browser ID before signin
    const browserId = await getBrowserId();
    const browserInfo = getBrowserInfo();
    const fingerprint = getBrowserFingerprint();

    return this.http
      .post<IApiResponse<Omit<IAuthResponse, "accessToken">>>(
        "/extension/signin",
        {
          token,
          browserId,
          browserInfo,
          fingerprint,
        },
      )
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from signin");
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
   * Signin via background script to bypass CORS restrictions in content scripts
   * Use this method when calling from content scripts (e.g., sidebar)
   */
  async signinViaBackground(token: string) {
    // Get or create browser ID before signin
    const browserId = await getBrowserId();
    const browserInfo = getBrowserInfo();
    const fingerprint = getBrowserFingerprint();

    return backgroundHttp(API_CONFIG.BASE_URL, "POST", "/extension/signin", {
      data: {
        token,
        browserId,
        browserInfo,
        fingerprint,
      },
    })
      .then((resp: any) => {
        const authData = resp.data?.data || resp.data;
        if (!authData) {
          throw new Error("No data returned from signin");
        }
        return authData as Omit<IAuthResponse, "accessToken">;
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
