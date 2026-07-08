import {
  Currency,
  PlanDuration,
  PlanAbility,
  SubscriptionPlanType,
  SubscriptionStatus,
} from "@shared/enums";
import { sendLogout } from "@shared/utils/chrome-messaging.util";
import { logError } from "@shared/utils/error-formatter.util";
import { storageService, subscriptionService } from "@shared/services";
import { MasterPassUtils } from "@shared/utils/master-pass.utils";
import type { AuthState } from "../types/auth.types";
import type {
  IUserResponse,
  IUserSubscriptionResponse,
  IPlanDetailsSnapshot,
} from "@shared/types";

export const GUEST_PLAN: IPlanDetailsSnapshot = {
  planId: "guest",
  type: SubscriptionPlanType.FREE,
  price: 0,
  currency: Currency.USD,
  duration: PlanDuration.LIFETIME,
  features: ["Offline Access", "Local Search", "Basic Export"],
  abilities: [PlanAbility.EXPORT_JSON, PlanAbility.EXPORT_CSV],
  maxClipboardItemsLimit: 1000,
  maxStorageBytes: 50 * 1024 * 1024, // 50MB
  retentionMinutes: 0,
  maxBrowsers: 1,
  mobileDevicesLimit: 0,
};

function createAuthStore() {
  const state = $state<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    subscription: null,
    planName: null,
    abilities: [],
    hasSyncedItems: false,
  });

  // Listen for background auth changes (e.g. Remote Logout)
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (
        message.type === "AUTH_STATUS_CHANGED" ||
        message.type === "auth_status_changed" ||
        message.type === "LOGOUT" // Standard logout message
      ) {
        // For LOGOUT type, we always logout. For AUTH_STATUS_CHANGED, check payload.
        if (message.type === "LOGOUT") {
          if (state.isAuthenticated) {
            logout(false, true);
          }
          return;
        }

        const isAuth = message.payload?.isAuthenticated;
        if (isAuth === false && state.isAuthenticated) {
          logout(false, true); // Don't broadcast loop, keep data logic handled by BG mostly
        }
      }
      return false;
    });
  }

  let logoutInProgress = $state(false);

  const hasActiveSubscription = $derived(
    state.subscription?.status === SubscriptionStatus.ACTIVE || false,
  );

  const isPaidUser = $derived.by(() => {
    const plan = state.subscription?.planDetails;
    return plan && plan.type !== SubscriptionPlanType.FREE;
  });

  // Guest if not authenticated OR if email is not verified (defaults to Guest)
  const isGuest = $derived(
    !state.isAuthenticated || (state.user && !state.user.emailVerifiedAt),
  );

  const hasAbility = (ability: PlanAbility) => {
    // If guest, check guest plan abilities
    if (isGuest) {
      return GUEST_PLAN.abilities.includes(ability);
    }
    return state.abilities.includes(ability);
  };

  async function loadAuth(): Promise<void> {
    try {
      const data = await storageService.getAuthData();

      if (data.authToken && data.user) {
        state.token = data.authToken;
        state.user = data.user;
        state.hasSyncedItems = !!data.hasSyncedItems;
        state.isAuthenticated = true;

        if (data.subscription) {
          state.subscription = data.subscription;
          state.planName = data.planName || null;

          state.abilities = state.subscription.planDetails.abilities;
        }

        setTimeout(() => {
          refreshSubscription();
        }, 500);
      } else {
        // Init as Guest
        state.isAuthenticated = false;
        state.token = null;
        state.user = null;
        state.subscription = null;
        state.planName = "Guest";
        state.abilities = GUEST_PLAN.abilities;
        state.hasSyncedItems = false;
      }
    } catch (error) {
      logError("[AuthStore] Failed to load auth", error);
      state.isAuthenticated = false;
      state.token = null;
      state.user = null;
      state.subscription = null;
      state.planName = null;
      state.abilities = [];
      state.hasSyncedItems = false;
    }
  }

  async function setAuth(
    token: string,
    user: IUserResponse,
    hasSyncedItems: boolean = false,
  ): Promise<void> {
    state.token = token;
    state.user = user;
    state.hasSyncedItems = hasSyncedItems;

    await storageService.setAuthData(token, user, hasSyncedItems);
  }

  function markAuthReady(): void {
    state.isAuthenticated = true;
  }

  async function setSubscription(
    newSubscription: IUserSubscriptionResponse,
    newPlanName?: string,
  ): Promise<void> {
    state.subscription = newSubscription;
    if (newPlanName) {
      state.planName = newPlanName;
    }

    state.abilities = newSubscription.planDetails.abilities;

    await storageService.setSubscription(newSubscription, newPlanName);
  }

  async function refreshSubscription() {
    if (!state.isAuthenticated) return;

    try {
      const resp = await subscriptionService.getStatus();

      if (resp && resp.data && resp.data.plan) {
        const data = resp.data;
        const newSubscription: IUserSubscriptionResponse = {
          _id: data._id,
          status: data.status,
          startDate: data.startDate,
          endDate: data.endDate,
          autoRenew: data.autoRenew,
          cancelledAt: data.cancelledAt,
          planDetails: data.planDetails,
          planInactiveNotifiedAt: data.planInactiveNotifiedAt,
        };

        await setSubscription(newSubscription, data.planName);
      } else {
        // If no plan is returned, clear the subscription state
        state.subscription = null;
        state.planName = null;
        state.abilities = [];
        await storageService.setSubscription(null, undefined);
      }
    } catch (error) {
      console.error(
        "[AuthStore] Failed to background refresh subscription",
        error,
      );
      // If unauthorized or specific error, might want to clear auth?
      // For now, assume network error and keep existing state (fallback)
      // BUT if it's a 401/403, we should probably logout or clear subscription.
    }
  }

  async function logout(
    broadcast: boolean = true,
    keepData: boolean = true,
  ): Promise<void> {
    logoutInProgress = true;

    state.token = null;
    state.user = null;
    state.isAuthenticated = false;
    state.subscription = null;
    state.planName = null;
    state.abilities = [];
    state.hasSyncedItems = false;
    // Clear E2E Password from memory
    MasterPassUtils.clearPassword();

    await storageService.clearAuthData();

    if (broadcast) {
      await sendLogout(true, keepData);
    }

    // Small delay to ensure UI transitions smoothly
    setTimeout(() => {
      logoutInProgress = false;
    }, 300);
  }

  return {
    get user() {
      return state.user;
    },
    get token() {
      return state.token;
    },
    get isAuthenticated() {
      return state.isAuthenticated;
    },
    get subscription() {
      return state.subscription;
    },
    get planName() {
      return state.planName;
    },
    get abilities() {
      return state.abilities;
    },
    get hasSyncedItems() {
      return state.hasSyncedItems;
    },
    get hasActiveSubscription() {
      return hasActiveSubscription;
    },
    get isPaidUser() {
      return isPaidUser;
    },

    hasAbility,
    loadAuth,
    setAuth,
    markAuthReady,
    setSubscription,
    refreshSubscription,
    logout,
    get isGuest() {
      return isGuest;
    },
    get logoutInProgress() {
      return logoutInProgress;
    },
  };
}

export const authStore = createAuthStore();
