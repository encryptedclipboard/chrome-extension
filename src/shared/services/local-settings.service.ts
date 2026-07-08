/**
 * Local Settings Service
 * Provides type-safe methods for accessing extension local settings
 */

import { browserAPI } from "@shared/utils/browser-api.util";
import { STORAGE_KEYS } from "../types/session-storage.types";

export type SettingsTab = "General" | "Cloud Sync" | "Data Management" | "Lock";

export interface ExtensionSettings {
  itemsPerPage?: number;
  theme?: "light" | "dark" | "auto";
  autoSync?: boolean;
  syncInterval?: number;
  maxClipboardItems?: number;
  showNotificationOnSync?: boolean;
  autoWriteSyncToClipboard?: boolean;
  [key: string]: any;
}

export interface SettingsResult {
  settings?: ExtensionSettings;
}

export class LocalSettingsService {
  /**
   * Get all settings from local storage
   */
  async getSettings(): Promise<ExtensionSettings> {
    try {
      const result = (await browserAPI.storage.local.get([
        "settings",
      ])) as SettingsResult;
      return result.settings || {};
    } catch (error) {
      console.error("[LocalSettingsService] Failed to get settings:", error);
      return {};
    }
  }

  /**
   * Get a specific setting value
   */
  async getSetting<K extends keyof ExtensionSettings>(
    key: K,
  ): Promise<ExtensionSettings[K] | undefined> {
    const settings = await this.getSettings();
    return settings[key];
  }

  /**
   * Update settings in local storage
   */
  async updateSettings(updates: Partial<ExtensionSettings>): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const newSettings = { ...currentSettings, ...updates };

      await browserAPI.storage.local.set({ settings: newSettings });

      // Notify other parts of the extension about settings change
      if (browserAPI.runtime) {
        await browserAPI.runtime.sendMessage({
          type: "SETTINGS_UPDATED",
          payload: newSettings,
        });
      }
    } catch (error) {
      console.error("[LocalSettingsService] Failed to update settings:", error);
      throw error;
    }
  }

  /**
   * Reset settings to defaults
   */
  async resetSettings(): Promise<void> {
    const defaultSettings: ExtensionSettings = {
      itemsPerPage: 50,
      theme: "auto",
      autoSync: false,
      syncInterval: 300000, // 5 minutes
      maxClipboardItems: 1000,
      showNotificationOnSync: true,
      autoWriteSyncToClipboard: false,
    };

    await browserAPI.storage.local.set({ settings: defaultSettings });
  }

  /**
   * Listen for settings changes
   */
  onSettingsChanged(callback: (settings: ExtensionSettings) => void): void {
    const listener = (message: any) => {
      if (message.type === "SETTINGS_UPDATED" && message.payload) {
        callback(message.payload);
      }
    };

    if (browserAPI.runtime?.onMessage) {
      browserAPI.runtime.onMessage.addListener(listener);
    }
  }

  // ===== SESSION STORAGE METHODS =====

  async getActiveSettingsTab(): Promise<SettingsTab | null> {
    const result = await chrome.storage.session.get([
      STORAGE_KEYS.SETTINGS_ACTIVE_TAB,
    ]);
    return (result[STORAGE_KEYS.SETTINGS_ACTIVE_TAB] as SettingsTab) || null;
  }

  async setActiveSettingsTab(tab: SettingsTab): Promise<void> {
    await chrome.storage.session.set({
      [STORAGE_KEYS.SETTINGS_ACTIVE_TAB]: tab,
    });
  }
}
