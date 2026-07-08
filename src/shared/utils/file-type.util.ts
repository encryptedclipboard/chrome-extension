import { ClipboardItemType } from "@shared/enums/clipboard-item-type.enum";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const EXTENSION_MAP: Record<string, ClipboardItemType> = {
  json: ClipboardItemType.JSON,
  html: ClipboardItemType.HTML,
  htm: ClipboardItemType.HTML,
  md: ClipboardItemType.MARKDOWN,
  markdown: ClipboardItemType.MARKDOWN,
  env: ClipboardItemType.ENV,
};

const TEXT_EXTENSIONS = new Set([
  "txt",
  "text",
  "csv",
  "tsv",
  "js",
  "ts",
  "jsx",
  "tsx",
  "py",
  "rb",
  "php",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "scala",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "css",
  "scss",
  "sass",
  "less",
  "styl",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "sql",
  "r",
  "lua",
  "pl",
  "pm",
  "vue",
  "svelte",
  "log",
  "out",
  "err",
  "gradle",
  "lock",
  "gitignore",
  "dockerfile",
  "makefile",
]);

export function getFileTypeFromExtension(filename: string): ClipboardItemType {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return ClipboardItemType.TEXT;
  return EXTENSION_MAP[ext] ?? ClipboardItemType.TEXT;
}

export async function readFileContent(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`File too large (${sizeMB} MB). Maximum size is 5 MB.`);
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });
}
