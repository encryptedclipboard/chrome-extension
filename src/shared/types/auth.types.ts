import type { IUserResponse } from "./user.type";
import type { IUserSubscriptionResponse } from "./subscription.type";

export interface ExtensionSigninResponse {
  user: IUserResponse;
  subscription: IUserSubscriptionResponse | null;
  subscriptionPlanName?: string;
  accessToken: string;
  lastSyncTimestamp?: number;
}

export interface AuthData {
  authToken?: string;
  user?: IUserResponse;
  hasSyncedItems?: boolean;
  subscription?: IUserSubscriptionResponse;
  planName?: string;
}
