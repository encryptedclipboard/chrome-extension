import { MessageType } from "@shared/types/message.types";

export const clipboardService = {
  async getRecentItems(limit = 20) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: MessageType.GET_CLIPBOARD_ITEMS,
          limit,
          excludeTypes: ["image"], // Disable fetching images by default
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response?.success) {
            resolve(response.items);
          } else {
            reject(new Error("Failed to fetch items"));
          }
        },
      );
    });
  },

  async getImages(limit = 10) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: MessageType.GET_CLIPBOARD_ITEMS,
          limit,
          onlyType: "image",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response?.success) {
            resolve(response.items);
          } else {
            console.error("[cbPalette] Failed to fetch images:", response);
            reject(new Error("Failed to fetch images"));
          }
        },
      );
    });
  },

  async searchItems(
    keyword: string,
    typeFilter?: string | null,
    limit?: number,
    offset?: number,
  ) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: MessageType.SEARCH_CLIPBOARD_ITEMS,
          payload: {
            query: keyword,
            typeFilter: typeFilter || undefined,
            limit: limit || 50,
            offset: offset || 0,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response?.success) {
            resolve(response.items);
          } else {
            reject(new Error("Failed to search items"));
          }
        },
      );
    });
  },
  async getItem(id: string) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: MessageType.GET_CLIPBOARD_ITEM, payload: { id } },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response?.success) {
            resolve(response.item);
          } else {
            reject(new Error("Failed to fetch item"));
          }
        },
      );
    });
  },
};
