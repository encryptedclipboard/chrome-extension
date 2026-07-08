import { thumbnailService } from "../services";

/**
 * Handle thumbnail generation requests from UI
 */
export async function handleThumbnailMessage(
  message: any,
): Promise<{ success: boolean; thumbnail?: string; error?: string }> {
  try {
    const { content, type } = message.data || message.payload || {};

    // Validate content
    if (!content) {
      return { success: false, error: "No content provided" };
    }

    // Determine if it's an image based on content or explicit type
    const isImage =
      type === "image" ||
      (typeof content === "string" && content.startsWith("data:image"));

    if (!isImage) {
      return { success: false, error: "Content is not an image" };
    }

    // Generate thumbnail
    const thumbnail =
      await thumbnailService.generateThumbnailForContent(content);

    if (thumbnail) {
      return { success: true, thumbnail };
    } else {
      // Return undefined - UI should use original image as fallback
      return { success: false, error: "Thumbnail generation failed" };
    }
  } catch (error: any) {
    console.error("[ThumbnailMessageHandler] Error:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}
