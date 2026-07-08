export interface StorageItem {
  key: string;
  value: string;
  type?: "string" | "number" | "boolean" | "object" | "array";
  size?: number; // bytes
  lastModified?: Date;
}

export interface CookieItem {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number; // timestamp
  expirationDate?: number; // timestamp for chrome.cookies API
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  hostOnly?: boolean;
  session?: boolean;
}

export interface StorageData {
  localStorage: StorageItem[];
  sessionStorage: StorageItem[];
  cookies: CookieItem[];
  totalSize: number;
  lastUpdated: Date;
}

export interface ExportOptions {
  format: "json" | "csv";
  includeLocalStorage: boolean;
  includeSessionStorage: boolean;
  includeCookies: boolean;
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
  items: StorageItem[] | CookieItem[];
}
