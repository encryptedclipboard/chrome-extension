/**
 * Simple HTML sanitizer - strips dangerous elements while preserving formatting
 * For more comprehensive sanitization, consider using DOMPurify
 */

export function sanitizeHtml(html: string): string {
  if (!html) return "";

  let sanitized = html;

  // Remove script tags and their content
  sanitized = sanitized.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );

  // Remove inline event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*(["'])[^"']*\1/gi, "");

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, "");

  // Remove data: URLs but allow data:image/* (base64 encoded images)
  // Prevents XSS via data:text/html while preserving embedded images in rich content
  sanitized = sanitized.replace(/data:(?!image\/)/gi, "");

  // Allow safe tags: b, i, strong, em, u, ul, ol, li, a, p, br, span, div, h1-h6, pre, code, blockquote
  // This is a simple approach - we keep all HTML tags since we're targeting formatted text
  // For full production, use DOMPurify

  return sanitized;
}

/**
 * Strip all HTML tags and return plain text
 */
export function stripHtml(html: string): string {
  if (!html) return "";

  // Create a temporary element to parse HTML
  const temp = document.createElement("div");
  temp.innerHTML = html;

  return temp.textContent || temp.innerText || "";
}
