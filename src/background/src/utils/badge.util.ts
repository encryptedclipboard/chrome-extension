import { ClipboardDBService } from "@shared/services/clipboard-db.service";
import { LockService } from "@shared/services/lock.service";

/**
 * Updates the extension badge with the current item count.
 * Logic is independent of service instantiation constraints.
 *
 * @param dbService Instance of ClipboardDBService
 * @param lockService Instance of LockService
 */
export async function updateBadge(
  dbService: ClipboardDBService,
  lockService: LockService,
) {
  try {
    const locked = await lockService.isLockActive();

    if (chrome.action) {
      if (locked) {
        chrome.action.setBadgeText({ text: "" });
        return;
      }

      const total = await dbService.count();
      const text = total > 0 ? (total > 999 ? "999+" : total.toString()) : "";
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color: "#32FF7E" });
    }
  } catch (error) {
    console.error("[BadgeUtil] Failed to update badge:", error);
  }
}
