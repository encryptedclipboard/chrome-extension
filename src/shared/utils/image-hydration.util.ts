import { type ClipboardItem, ClipboardItemType } from "@shared/types";
import type { IDBPDatabase } from "idb";
import type { ClipboardDBSchema } from "@shared/types/db.types";

const DATA_STORE_NAME = "clipboard_data";

export async function hydrateImageContent(
  items: ClipboardItem[],
  db: IDBPDatabase<ClipboardDBSchema>,
): Promise<ClipboardItem[]> {
  const hydratedItems = await Promise.all(
    items.map(async (item) => {
      if (item.type === ClipboardItemType.IMAGE && !item.content) {
        try {
          const dataItem = await db.get(DATA_STORE_NAME, item.id);
          if (dataItem && dataItem.data) {
            return { ...item, content: dataItem.data };
          }
        } catch (e) {
          console.warn(`[ClipboardDB] Failed to hydrate image ${item.id}`, e);
        }
      }
      return item;
    }),
  );
  return hydratedItems;
}
