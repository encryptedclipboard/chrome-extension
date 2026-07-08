import type {
  StorageItem,
  CookieItem,
  ExportOptions,
  ImportResult,
} from "../types/storage-item.type";

export interface CsvRow {
  [key: string]: string;
}

export class CsvParser {
  /**
   * Parse CSV string to objects
   */
  parseCsv(csvString: string): CsvRow[] {
    const lines = csvString.split("\n").filter((line) => line.trim());
    if (lines.length === 0) return [];

    // Parse header
    const headers = this.parseRow(lines[0]);
    const rows: CsvRow[] = [];

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseRow(lines[i]);
      if (values.length === headers.length) {
        const row: CsvRow = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || "";
        });
        rows.push(row);
      }
    }

    return rows;
  }

  /**
   * Convert objects to CSV string
   */
  toCsv(data: CsvRow[]): string {
    if (data.length === 0) return "";

    // Get headers from first object
    const headers = Object.keys(data[0]);

    // Build CSV
    const rows = [
      this.escapeRow(headers),
      ...data.map((row) =>
        this.escapeRow(headers.map((header) => row[header] || "")),
      ),
    ];

    return rows.join("\n");
  }

  /**
   * Convert StorageItems to CSV format
   */
  storageItemsToCsv(items: StorageItem[]): string {
    const csvData = items.map((item) => ({
      key: item.key,
      value: item.value,
      type: item.type || "string",
      size: item.size?.toString() || "0",
      lastModified: item.lastModified?.toISOString() || "",
    }));

    return this.toCsv(csvData);
  }

  /**
   * Convert CSV to StorageItems
   */
  csvToStorageItems(csvString: string): ImportResult {
    const errors: string[] = [];
    const items: StorageItem[] = [];
    let successCount = 0;

    try {
      const rows = this.parseCsv(csvString);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        if (!row.key) {
          errors.push(`Row ${i + 1}: Missing key`);
          continue;
        }

        if (!row.value) {
          errors.push(`Row ${i + 1}: Missing value`);
          continue;
        }

        const item: StorageItem = {
          key: row.key,
          value: row.value,
          type: (row.type as StorageItem["type"]) || "string",
          size: row.size ? parseInt(row.size) : undefined,
          lastModified: row.lastModified
            ? new Date(row.lastModified)
            : undefined,
        };

        items.push(item);
        successCount++;
      }
    } catch (error) {
      errors.push(
        `CSV parse error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    return {
      success: successCount,
      failed: errors.length,
      errors,
      items,
    };
  }

  /**
   * Convert CookieItems to CSV format
   */
  cookieItemsToCsv(items: CookieItem[]): string {
    const csvData = items.map((item) => ({
      name: item.name,
      value: item.value,
      domain: item.domain || "",
      path: item.path || "",
      expires: item.expires?.toString() || "",
      secure: item.secure ? "true" : "false",
      httpOnly: item.httpOnly ? "true" : "false",
      sameSite: item.sameSite || "",
    }));

    return this.toCsv(csvData);
  }

  /**
   * Convert CSV to CookieItems
   */
  csvToCookieItems(csvString: string): ImportResult {
    const errors: string[] = [];
    const items: CookieItem[] = [];
    let successCount = 0;

    try {
      const rows = this.parseCsv(csvString);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        if (!row.name) {
          errors.push(`Row ${i + 1}: Missing name`);
          continue;
        }

        if (!row.value) {
          errors.push(`Row ${i + 1}: Missing value`);
          continue;
        }

        const item: CookieItem = {
          name: row.name,
          value: row.value,
          domain: row.domain || undefined,
          path: row.path || undefined,
          expires: row.expires ? parseInt(row.expires) : undefined,
          secure: row.secure === "true",
          httpOnly: row.httpOnly === "true",
          sameSite: (row.sameSite as CookieItem["sameSite"]) || undefined,
        };

        items.push(item);
        successCount++;
      }
    } catch (error) {
      errors.push(
        `CSV parse error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    return {
      success: successCount,
      failed: errors.length,
      errors,
      items,
    };
  }

  /**
   * Parse a single CSV row handling quotes and commas
   */
  private parseRow(row: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        // End of field
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current);

    return result;
  }

  /**
   * Escape a row for CSV output
   */
  private escapeRow(values: string[]): string {
    return values
      .map((value) => {
        const stringValue = String(value);

        // If value contains comma, newline, or quote, wrap in quotes
        if (
          stringValue.includes(",") ||
          stringValue.includes("\n") ||
          stringValue.includes('"')
        ) {
          // Escape quotes by doubling them
          const escaped = stringValue.replace(/"/g, '""');
          return `"${escaped}"`;
        }

        return stringValue;
      })
      .join(",");
  }

  /**
   * Download data as CSV file
   */
  downloadCsv(data: string, filename: string): void {
    const blob = new Blob([data], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }
}

export const csvParser = new CsvParser();
