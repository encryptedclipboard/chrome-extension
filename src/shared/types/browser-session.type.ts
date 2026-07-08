export interface IBrowserFingerprint {
  hash: string;
  userAgent: string;
  timezone: string;
  language: string;
  screenResolution?: string;
  components?: Record<string, any>;
  version?: string;
}

export interface IBrowserInfo {
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
  platform?: string;
  userAgent?: string;
  language?: string;
  screenResolution?: string;
  timezone?: string;
}

export interface IRegisterBrowserRequest {
  browserId: string;
  browserInfo?: IBrowserInfo;
  fingerprint?: IBrowserFingerprint;
}

export interface IBrowserSession {
  _id: string;
  userId: string;
  browserId: string;
  browserInfo: IBrowserInfo;
  fingerprint?: IBrowserFingerprint;
  isActive: boolean;
  lastActive: Date;
  createdAt: Date;
  updatedAt: Date;
}
