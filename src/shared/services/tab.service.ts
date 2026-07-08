/**
 * Tab Service
 * Provides type-safe methods for browser tab operations
 */

import { browserAPI } from "@shared/utils/browser-api.util";

export interface TabInfo {
  id?: number;
  url?: string;
  title?: string;
  active: boolean;
  hostname?: string;
}

export class TabService {
  /**
   * Get the current active tab in the current window
   */
  async getCurrentTab(): Promise<TabInfo | null> {
    try {
      if (!browserAPI.tabs) {
        throw new Error("Tabs API not available");
      }

      const tabs = await browserAPI.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tabs.length === 0) {
        return null;
      }

      const tab = tabs[0];
      let hostname: string | undefined;

      if (tab.url) {
        try {
          const url = new URL(tab.url);
          hostname = url.hostname;
        } catch {
          // Invalid URL, skip hostname
        }
      }

      return {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        active: tab.active,
        hostname,
      };
    } catch (error) {
      console.error("[TabService] Failed to get current tab:", error);
      return null;
    }
  }

  /**
   * Get hostname of the current active tab
   */
  async getCurrentHostname(): Promise<string | null> {
    const tab = await this.getCurrentTab();
    return tab?.hostname ?? null;
  }

  /**
   * Get all tabs matching query criteria
   */
  async queryTabs(queryInfo: {
    active?: boolean;
    currentWindow?: boolean;
    url?: string | string[];
  }): Promise<TabInfo[]> {
    try {
      if (!browserAPI.tabs) {
        throw new Error("Tabs API not available");
      }

      const tabs = await browserAPI.tabs.query(queryInfo);
      return tabs.map((tab: any) => {
        let hostname: string | undefined;
        if (tab.url) {
          try {
            const url = new URL(tab.url);
            hostname = url.hostname;
          } catch {
            // Invalid URL
          }
        }

        return {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active,
          hostname,
        };
      });
    } catch (error) {
      console.error("[TabService] Failed to query tabs:", error);
      return [];
    }
  }
}
