import type { IUserResponse, IUserSubscriptionResponse } from "@shared/types";
import { PlanAbility } from "@shared/enums";

export interface AuthState {
  user: IUserResponse | null;
  token: string | null;
  isAuthenticated: boolean;
  subscription: IUserSubscriptionResponse | null;
  planName: string | null;
  abilities: PlanAbility[];
  hasSyncedItems: boolean;
}
