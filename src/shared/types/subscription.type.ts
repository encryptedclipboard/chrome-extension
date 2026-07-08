import {
  Currency,
  PlanDuration,
  PlanAbility,
  SubscriptionPlanType,
  SubscriptionStatus,
} from "../enums";

export interface IPlanDetailsSnapshot {
  planId: string;
  type: SubscriptionPlanType;
  price: number;
  currency: Currency;
  duration: PlanDuration;
  features: string[];
  abilities: PlanAbility[];
  maxClipboardItemsLimit: number; // Max number of clipboard items (0 = unlimited)
  maxStorageBytes: number; // Max storage space in bytes (0 = unlimited)
  retentionMinutes: number; // Retention period in minutes (0 = never delete)
  maxBrowsers: number; // Max number of browsers (0 = unlimited)
  mobileDevicesLimit: number; // Max number of mobile devices (0 = unlimited)
  dodoProductId?: string;
}

export type IPlanDetailsPublic = Omit<IPlanDetailsSnapshot, "dodoProductId">;

export interface IUserSubscriptionResponse {
  _id: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  cancelledAt?: string | null;
  planDetails: IPlanDetailsSnapshot;
  planInactiveNotifiedAt?: string | null;
}

// Response for status check which might include full subscription details
// Response for status check which might include full subscription details
export type ISubscriptionStatusResponse =
  | {
      isActive: boolean;
      plan: null;
    }
  | {
      isActive: boolean;
      plan: IPlanDetailsPublic;
      planName: string;
      endDate: string;
      status: SubscriptionStatus;

      // Extended fields from IUserSubscriptionResponse
      _id: string;
      startDate: string;
      autoRenew: boolean;
      cancelledAt?: string | null;
      planDetails: IPlanDetailsSnapshot;
      planInactiveNotifiedAt?: string | null;
    };

export interface ISubscriptionFeaturesResponse {
  hasSubscription: boolean;
  isActive: boolean;
  planName?: string;
  planType?: SubscriptionPlanType;
  features: string[];
  abilities: PlanAbility[];
  endDate?: string | null;
}

export interface ISubscriptionPlanSummary {
  _id: string;
  name: string;
  type: SubscriptionPlanType;
  duration: PlanDuration;
  price: number;
  currency: Currency;
  features: string[];
  abilities: PlanAbility[];
  maxClipboardItemsLimit: number;
  maxStorageBytes: number;
  retentionMinutes: number;
  maxBrowsers: number;
  mobileDevicesLimit: number;
  isActive: boolean;
  isFeatured: boolean;
  dodoProductId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IAdminSubscriptionListItem {
  _id: string;
  user: {
    _id: string;
    email: string;
    name?: string;
  };
  plan: {
    _id: string;
    name: string;
    type: SubscriptionPlanType;
    price: number;
    currency: Currency;
    duration: PlanDuration;
  };
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  cancelledAt?: string | null;
}

export interface ICreateSubscriptionRequest {
  planId: string;
}

export interface IAdminUpgradeSubscriptionRequest {
  userId: string;
  planId: string;
  durationDays?: number;
  durationMonths?: number;
  reason?: string;
}

export interface ICancelSubscriptionRequest {
  subscriptionId: string;
  reason?: string;
}
