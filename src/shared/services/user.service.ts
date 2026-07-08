import type { IApiResponse, IAuthResponse, IUserResponse } from "@shared/types";
import { getErrMsg, getErrMeta } from "../utils/error-handler.util";
import { BaseService } from "./base.service";

export class UserService extends BaseService {
  async signin(email: string, password: string) {
    return this.http
      .post<IApiResponse<IAuthResponse>>("/extension/signin", {
        email,
        password,
      })
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from user signin");
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

  async autologin() {
    return this.http
      .get<IApiResponse<{ user: IUserResponse }>>(
        "/extension/auth/auto-login-admin",
      )
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from user autologin");
        }
        return resp.data;
      })
      .catch((err) => {
        // Fallback to user autologin if admin fails
        return this.http
          .get<IApiResponse<{ user: IUserResponse }>>("/extension/autologin")
          .then((resp) => {
            if (!resp.data) {
              throw new Error("No data returned from user autologin");
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
      });
  }

  async getProfile() {
    return this.http
      .get<IApiResponse<{ user: IUserResponse }>>("/extension/profile")
      .then((resp) => {
        if (!resp.data) {
          throw new Error("No data returned from user profile");
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

  async updateEncryptionVerifier(encryptionVerifier: any) {
    return this.http
      .put<IApiResponse<void>>("/extension/profile/encryption-verifier", {
        encryptionVerifier,
      })
      .then((resp) => {
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
