import { AccountStatus, SubscriptionStatus, UserRole } from "../enums";
import type {
  IAdminSubscriptionListItem,
  ISubscriptionPlanSummary,
  IUserSubscriptionResponse,
} from "./subscription.type";
import type { IPaginationMeta } from "./pagination.type";
import type { IAdminPaymentRecord } from "./payment.type";

export interface IUserResponse {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  accountStatus: AccountStatus;
  emailVerifiedAt?: string | null;
  twoFactorEnabled?: boolean;
  isPasswordLoginDisabled?: boolean;
  hasPassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IUserSignupRequest {
  email: string;
  name: string;
  password: string;
}

export interface ILoginRequest {
  email: string;
  password: string;
}

export interface IAuthResponse {
  accessToken: string;
  user: IUserResponse;
  subscription?: IUserSubscriptionResponse | null;
  subscriptionPlanName?: string;
  hasSyncedItems?: boolean;
}

export interface IUserProfileUpdateRequest {
  name?: string;
  email?: string;
}

export interface IUserChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface IUserDeleteAccountRequest {
  password: string;
}

export interface IUserForgotPasswordRequest {
  email: string;
}

export interface IUserResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface IUserVerifyEmailRequest {
  token: string;
}

export interface IUserResendVerificationRequest {
  email: string;
}

export interface IUserStatusUpdateRequest {
  accountStatus: AccountStatus;
}

export interface IUserListItem extends Omit<IUserResponse, "subscription"> {
  subscriptionStatus: SubscriptionStatus | null;
  currentPlanName?: string;
}

export interface IUserListResponse {
  users: IUserListItem[];
  pagination: IPaginationMeta;
}

export interface IUserDetailResponse {
  user: IUserResponse;
  subscriptions: IAdminSubscriptionListItem[];
  payments: IAdminPaymentRecord[];
}

export interface IUserSubscriptionUpgradeRequest {
  planId: string;
  durationDays?: number;
  durationMonths?: number;
  reason?: string;
}

export interface IUserPlanSelection {
  plans: ISubscriptionPlanSummary[];
}
