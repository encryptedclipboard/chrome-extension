export interface SnippetItem {
  id: string;
  keyword: string;
  snippet: string;
  richContent?: string;
  type: "text" | "code";
  codeLanguage?: string;
  createdAt: number;
  updatedAt: number;
}
