export interface SyncSettings {
  autoSync: boolean;
  lastSyncAt: number;
  masterPasswordSet: boolean;
  smartBlurConfidential: boolean;
  smartBlurImages: boolean;
}

export type ChangePasswordPayload =
  | { mode: "reset"; newPassword?: string; currentPassword?: never }
  | { mode: "reencrypt"; currentPassword: string; newPassword: string };
