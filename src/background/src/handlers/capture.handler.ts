export const captureVisibleTabHandler = async (
  message: any,
  sender: chrome.runtime.MessageSender,
): Promise<any> => {
  if (message.type === "CAPTURE_VISIBLE_TAB") {
    try {
      const windowId = sender.tab?.windowId;
      if (windowId === undefined) {
        throw new Error("No window ID found");
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: "png",
      });
      return { dataUrl };
    } catch (error) {
      console.error("[Background] Capture tab failed:", error);
      return { error: "Capture failed" };
    }
  }
};
