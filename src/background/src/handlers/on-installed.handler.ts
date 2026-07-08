import { syncOrchestratorService } from "../services";
import { updateContextMenus } from "../utils/context-menu.util";
import { ratingService } from "@shared/services";

export const onInstalledHandler = async (details: any) => {
  if (details.reason === "install") {
    await ratingService.setFirstInstallDate(Date.now());
    chrome.tabs?.create({ url: "onboarding/index.html" });
  } else if (details.reason === "update") {
    const currentVersion = chrome.runtime.getManifest().version;
    if (details.previousVersion !== currentVersion) {
      chrome.tabs?.create({ url: "onboarding/index.html" });
    }
  }

  // Set side panel behavior to open on click
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }

  // Perform initial sync and setup (restored from clipboard-background.ts)
  await syncOrchestratorService.performFullSync({ silent: true });
  await updateContextMenus();
};
