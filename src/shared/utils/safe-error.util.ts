/**
 * Safely extract error message from any error type
 * This prevents "Permission denied to access property 'constructor'" errors
 * when error objects cross browser extension context boundaries
 */
export function getSafeErrorMessage(
  error: unknown,
  fallback = "An unknown error occurred",
): string {
  // If it's already a string, return it
  if (typeof error === "string") {
    return error;
  }

  // Try to extract message safely with multiple fallbacks
  try {
    // Try the most common patterns without triggering property access errors
    if (error && typeof error === "object") {
      // Use Object.prototype methods to safely check properties
      if ("message" in error) {
        const msg = (error as any).message;
        if (typeof msg === "string" && msg.length > 0) {
          return msg;
        }
      }

      // Try response.data.message (Axios error pattern)
      if ("response" in error) {
        const response = (error as any).response;
        if (response && typeof response === "object" && "data" in response) {
          const data = response.data;
          if (data && typeof data === "object" && "message" in data) {
            const msg = data.message;
            if (typeof msg === "string" && msg.length > 0) {
              return msg;
            }
          }
        }
      }
    }
  } catch {
    // If any property access fails, fall through to the fallback
  }

  return fallback;
}
