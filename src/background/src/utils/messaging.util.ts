import { MessageType } from "@shared/types";
import { sendSynced } from "@shared/utils/message.utils";

// Define strict types for the action
export type SyncAction = "added" | "updated" | "deleted";

/**
 * Notify the UI (sidebar/popup) that a clipboard item has been synced
 * @param action - The type of change (added, updated, deleted)
 * @param itemId - The Server ID of the item
 */
export const notifyClipboardSynced = (
  action: SyncAction,
  itemId: string,
): void => {
  sendSynced({ action, itemId });
};
