import {
  injectFloatingClipboard,
  removeFloatingClipboard,
} from "../utils/floating-clipboard.util";

export class TabManagerService {
  private lastActiveTabId: number | null = null;

  constructor() {}

  public async init() {
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));

    const [currentTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (currentTab?.id) {
      this.lastActiveTabId = currentTab.id;
      injectFloatingClipboard(currentTab.id);
    }
  }

  private async handleTabActivated(activeInfo: any) {
    const newTabId = activeInfo.tabId;

    if (this.lastActiveTabId !== null && this.lastActiveTabId !== newTabId) {
      removeFloatingClipboard(this.lastActiveTabId);
    }

    this.lastActiveTabId = newTabId;
    void injectFloatingClipboard(newTabId);
  }

  private async handleTabUpdated(tabId: number, changeInfo: any) {
    if (tabId === this.lastActiveTabId && changeInfo.status === "complete") {
      void injectFloatingClipboard(tabId);
    }
  }

  private handleTabRemoved(tabId: number) {
    if (this.lastActiveTabId === tabId) {
      this.lastActiveTabId = null;
    }
  }
}
