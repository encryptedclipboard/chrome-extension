import type { ServerClipboardItem } from "@shared/types/clipboard.types";

export interface ClipboardSocketHandlers {
  onItemAdded: (item: ServerClipboardItem) => Promise<void>;
  onItemUpdated: (item: ServerClipboardItem) => Promise<void>;
  onItemDeleted: (itemId: string) => Promise<void>;
}
