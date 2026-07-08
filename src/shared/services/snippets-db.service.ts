import { openDB, type IDBPDatabase } from "idb";
import { v4 as uuidv4 } from "uuid";
import type { SnippetItem } from "../types/snippets.types";

const DB_NAME = "snippets-db";
const DB_VERSION = 1;
const STORE_NAME = "snippets";

export class SnippetsDBService {
  private db: IDBPDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by-keyword", "keyword", { unique: true });
        store.createIndex("by-type-keyword", ["type", "keyword"], {
          unique: false,
        });
      },
    });
  }

  private async getDb(): Promise<IDBPDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error("Failed to initialize database");
    }
    return this.db;
  }

  async addItem(
    keyword: string,
    snippet: string,
    type: "text" | "code" = "text",
    codeLanguage?: string,
  ): Promise<SnippetItem> {
    const db = await this.getDb();

    const existing = await this.getItemByKeyword(keyword);
    if (existing) {
      throw new Error(`Keyword '${keyword}' already exists.`);
    }

    const item: SnippetItem = {
      id: uuidv4(),
      keyword: keyword.trim(),
      snippet,
      type,
      ...(codeLanguage ? { codeLanguage } : {}),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.put(STORE_NAME, item);
    return item;
  }

  async updateItem(id: string, updates: Partial<SnippetItem>): Promise<void> {
    const db = await this.getDb();
    const item = await db.get(STORE_NAME, id);
    if (!item) throw new Error("Item not found");

    if (updates.keyword && updates.keyword !== item.keyword) {
      const existing = await this.getItemByKeyword(updates.keyword);
      if (existing) {
        throw new Error(`Keyword '${updates.keyword}' already exists.`);
      }
    }

    const updatedItem = { ...item, ...updates, updatedAt: Date.now() };
    await db.put(STORE_NAME, updatedItem);
  }

  async deleteItem(id: string): Promise<void> {
    const db = await this.getDb();
    await db.delete(STORE_NAME, id);
  }

  async getAllItems(): Promise<SnippetItem[]> {
    const db = await this.getDb();
    return db.getAll(STORE_NAME);
  }

  async getItemsPaginated(
    limit: number,
    offset: number,
    type?: "text" | "code",
  ): Promise<SnippetItem[]> {
    const db = await this.getDb();
    const items: SnippetItem[] = [];
    let cursor;

    if (type) {
      cursor = await db
        .transaction(STORE_NAME)
        .store.index("by-type-keyword")
        .openCursor(IDBKeyRange.bound([type, ""], [type, "\uffff"]));
    } else {
      cursor = await db
        .transaction(STORE_NAME)
        .store.index("by-keyword")
        .openCursor();
    }

    let skipped = 0;
    while (cursor && items.length < limit) {
      if (skipped < offset) {
        skipped++;
      } else {
        items.push(cursor.value);
      }
      cursor = await cursor.continue();
    }
    return items;
  }

  async searchItemsPaginated(
    limit: number,
    offset: number,
    filters: {
      type?: "text" | "code";
      codeLanguage?: string;
      keyword?: string;
    },
  ): Promise<SnippetItem[]> {
    const db = await this.getDb();
    const items: SnippetItem[] = [];

    let cursor;
    if (filters.type) {
      cursor = await db
        .transaction(STORE_NAME)
        .store.index("by-type-keyword")
        .openCursor(
          IDBKeyRange.bound([filters.type, ""], [filters.type, "\uffff"]),
        );
    } else {
      cursor = await db
        .transaction(STORE_NAME)
        .store.index("by-keyword")
        .openCursor();
    }

    let skipped = 0;
    while (cursor && items.length < limit) {
      let matches = true;

      if (
        filters.codeLanguage &&
        cursor.value.codeLanguage !== filters.codeLanguage
      ) {
        matches = false;
      }

      if (matches && filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        const keywordMatch = cursor.value.keyword.toLowerCase().includes(kw);
        const snippetMatch = cursor.value.snippet.toLowerCase().includes(kw);
        if (!keywordMatch && !snippetMatch) {
          matches = false;
        }
      }

      if (matches) {
        if (skipped < offset) {
          skipped++;
        } else {
          items.push(cursor.value);
        }
      }

      cursor = await cursor.continue();
    }
    return items;
  }

  async searchCount(filters: {
    type?: "text" | "code";
    codeLanguage?: string;
    keyword?: string;
  }): Promise<number> {
    const db = await this.getDb();
    let count = 0;

    let cursor;
    if (filters.type) {
      cursor = await db
        .transaction(STORE_NAME)
        .store.index("by-type-keyword")
        .openCursor(
          IDBKeyRange.bound([filters.type, ""], [filters.type, "\uffff"]),
        );
    } else {
      cursor = await db
        .transaction(STORE_NAME)
        .store.index("by-keyword")
        .openCursor();
    }

    while (cursor) {
      let matches = true;

      if (
        filters.codeLanguage &&
        cursor.value.codeLanguage !== filters.codeLanguage
      ) {
        matches = false;
      }

      if (matches && filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        const keywordMatch = cursor.value.keyword.toLowerCase().includes(kw);
        const snippetMatch = cursor.value.snippet.toLowerCase().includes(kw);
        if (!keywordMatch && !snippetMatch) {
          matches = false;
        }
      }

      if (matches) {
        count++;
      }

      cursor = await cursor.continue();
    }
    return count;
  }

  async getAllKeywordKeys(): Promise<string[]> {
    const items = await this.getAllItems();
    return items.map((i) => i.keyword);
  }

  async getItemByKeyword(keyword: string): Promise<SnippetItem | undefined> {
    const db = await this.getDb();
    return db.getFromIndex(STORE_NAME, "by-keyword", keyword);
  }

  async getCount(): Promise<number> {
    const db = await this.getDb();
    return db.count(STORE_NAME);
  }
}

export const snippetsDBService = new SnippetsDBService();
