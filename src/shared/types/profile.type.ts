export interface ProfileStorageData {
  localStorage: { [key: string]: string };
  sessionStorage: { [key: string]: string };
  cookies: { [key: string]: string };
}

export interface ProfileMetadata {
  totalItems: number;
  totalSize: number; // Total size in bytes
  localStorageCount: number;
  sessionStorageCount: number;
  cookiesCount: number;
  localStorageSize: number; // Size in bytes
  sessionStorageSize: number; // Size in bytes
  cookiesSize: number; // Size in bytes
}

export interface UserProfile {
  _id?: string;
  userId: string;
  domain: string;
  name: string;
  description?: string;
  data: ProfileStorageData | any; // any when encrypted
  encrypted: boolean;
  metadata?: ProfileMetadata; // Unencrypted metadata for display
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProfileRequest {
  domain: string;
  name: string;
  description?: string;
  data: ProfileStorageData | any; // any when encrypted
  encrypted: boolean;
  metadata?: ProfileMetadata; // Unencrypted metadata for display (calculated before encryption)
}

export interface UpdateProfileRequest {
  name?: string;
  description?: string;
  data?: ProfileStorageData | any; // any when encrypted
  metadata?: ProfileMetadata; // Unencrypted metadata for display (calculated before encryption)
}

export interface ProfileResponse {
  success: boolean;
  message: string;
  profile?: UserProfile;
}

export interface ProfilesListResponse {
  success: boolean;
  message: string;
  profiles: UserProfile[];
}

export interface SwitchProfileRequest {
  profileId: string;
  domain: string;
}

export interface SwitchProfileResponse {
  success: boolean;
  message: string;
  data?: ProfileStorageData;
}
