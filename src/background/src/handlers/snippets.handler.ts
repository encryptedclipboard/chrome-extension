import { MessageType, ClipboardItemType } from "@shared/types";
import {
  snippetsDBService,
  storageService,
  clipboardDBService,
} from "../services";

export async function handleSnippetMessage(
  message: any,
): Promise<{ success: boolean; payload?: any }> {
  switch (message.type) {
    case MessageType.SNIPPETS_GET_ALL: {
      const items = await snippetsDBService.getAllItems();
      return { success: true, payload: items };
    }

    case MessageType.SNIPPETS_GET_ALL_KEYS: {
      const keys = await snippetsDBService.getAllKeywordKeys();
      return { success: true, payload: keys };
    }

    case MessageType.SNIPPETS_ADD: {
      const { keyword, snippet, type, codeLanguage } = message.payload;
      const newItem = await snippetsDBService.addItem(
        keyword,
        snippet,
        type,
        codeLanguage,
      );
      return { success: true, payload: newItem };
    }

    case MessageType.SNIPPETS_UPDATE: {
      const { id: updateId, updates } = message.payload;
      await snippetsDBService.updateItem(updateId, updates);
      return { success: true };
    }

    case MessageType.SNIPPETS_DELETE: {
      await snippetsDBService.deleteItem(message.payload.id);
      return { success: true };
    }

    case MessageType.SNIPPETS_GET_SNIPPET: {
      const keyword = message.payload?.keyword;
      if (!keyword) {
        return { success: true, payload: null };
      }
      const item = await snippetsDBService.getItemByKeyword(keyword);
      return {
        success: true,
        payload: item
          ? { snippet: item.snippet, richContent: item.richContent }
          : null,
      };
    }

    case MessageType.SNIPPETS_COUNT: {
      const count = await snippetsDBService.getCount();
      return { success: true, payload: count };
    }

    case MessageType.SNIPPETS_WRITE_CLIPBOARD: {
      const { text, html } = message.payload || {};
      try {
        const success = await writeClipboardViaOffscreen(text, html);
        return { success };
      } catch (e: any) {
        return { success: false };
      }
    }

    case MessageType.SNIPPETS_RESTORE_CLIPBOARD: {
      const settings = await storageService.getSettings();
      const monitoringEnabled = settings?.monitoringEnabled ?? true;
      if (!monitoringEnabled) {
        await writeClipboardViaOffscreen("", undefined);
        return { success: true };
      }
      const all = await clipboardDBService.getAllItemsLightweight();
      all.sort((a, b) => b.createdAt - a.createdAt);
      const last = all.find(
        (i) => i.content && i.type !== ClipboardItemType.IMAGE,
      );
      await writeClipboardViaOffscreen(last?.content ?? "", undefined);
      return { success: true };
    }

    default:
      return { success: false };
  }
}

async function writeClipboardViaOffscreen(
  text: string,
  html?: string,
): Promise<boolean> {
  try {
    const contexts = await (chrome.runtime as any).getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });

    if (!contexts || contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL("offscreen/offscreen.html"),
        reasons: ["CLIPBOARD"],
        justification: "Write clipboard for snippet expander",
      });
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (e) {
    console.warn("[Snippets] offscreen setup:", e);
  }

  const port = chrome.runtime.connect({ name: "offscreen-channel" });
  const requestId = crypto.randomUUID();

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      port.disconnect();
      resolve(false);
    }, 3000);

    port.onDisconnect.addListener(() => {
      clearTimeout(timeout);
      resolve(false);
    });

    port.onMessage.addListener((msg) => {
      if (msg.id === requestId) {
        clearTimeout(timeout);
        port.disconnect();
        resolve(msg.success === true);
      }
    });

    port.postMessage({
      id: requestId,
      type: "WRITE_TO_CLIPBOARD_SYNC",
      data: { text, html },
    });
  });
}
