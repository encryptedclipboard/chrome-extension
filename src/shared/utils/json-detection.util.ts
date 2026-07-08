/**
 * Utility to detect if a string value is valid JSON
 */

/**
 * Check if a value is valid JSON that can be parsed
 * @param value - The string value to check
 * @returns true if the value is valid JSON, false otherwise
 */
export function isValidJson(value: string): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }

  // Trim whitespace
  const trimmed = value.trim();

  // Empty strings are not valid JSON
  if (!trimmed) {
    return false;
  }

  // Must start with { or [ to be an object or array
  // Strings, numbers, booleans are valid JSON but we only want complex objects
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    // Must be an object or array (not primitive)
    return typeof parsed === "object" && parsed !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Try to parse JSON and return the parsed object if successful
 * @param value - The string value to parse
 * @returns Parsed object or null if invalid JSON
 */
export function tryParseJson(value: string): any | null {
  try {
    if (isValidJson(value)) {
      return JSON.parse(value.trim());
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Format JSON string with proper indentation
 * @param value - The JSON string to format
 * @param spaces - Number of spaces for indentation (default: 2)
 * @returns Formatted JSON string or original value if not valid JSON
 */
export function formatJson(value: string, spaces: number = 2): string {
  const parsed = tryParseJson(value);
  if (parsed !== null) {
    return JSON.stringify(parsed, null, spaces);
  }
  return value;
}
