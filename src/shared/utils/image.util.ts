/**
 * Generates a thumbnail from a base64 string
 * @param base64Data Base64 string of the image
 * @param maxWidth Maximum width of the thumbnail
 * @returns Promise resolving to base64 string of the thumbnail
 */
export async function generateThumbnail(
  base64Data: string,
  maxWidth: number = 200,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Check if we are in an environment that supports Image and Canvas
    if (typeof Image === "undefined" || typeof document === "undefined") {
      reject(new Error("Environment does not support Image/Canvas operations"));
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = (e) =>
      reject(new Error("Failed to load image for thumbnail"));
    img.src = base64Data;
  });
}
