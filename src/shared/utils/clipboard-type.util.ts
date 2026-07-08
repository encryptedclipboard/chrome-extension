import { ClipboardItemType } from "@shared/enums/clipboard-item-type.enum";

/**
 * Detects the type of content in the clipboard
 * @param content The clipboard text content
 * @returns The detected ClipboardItemType
 */
export function detectClipboardItemType(content: string): ClipboardItemType {
  if (!content) return ClipboardItemType.TEXT;

  const trimmed = content.trim();

  // 0. Check for HTML
  if (trimmed.startsWith("<")) {
    const htmlRegex = /<([a-z][\s\S]*?)(\s+[\s\S]*?)?>(.*?)<\/\1>/i;
    const selfClosingRegex = /<[a-z][\s\S]*?\/>/i;
    const styleTagRegex = /<style[\s\S]*?>[\s\S]*?<\/style>/i;

    if (
      htmlRegex.test(trimmed) ||
      selfClosingRegex.test(trimmed) ||
      styleTagRegex.test(trimmed)
    ) {
      return ClipboardItemType.HTML;
    }
  }

  // 1. Check for JSON
  // Simple check first to avoid expensive parsing
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return ClipboardItemType.JSON;
    } catch (e) {
      // Not valid JSON, continue
    }
  }

  // 2. Check for SSH Private Keys (MUST check BEFORE ENV)
  // Explicit PEM header + footer pattern - no character threshold
  // Matches: OpenSSH, RSA, EC, DSA, Encrypted, PuTTY formats
  const sshPrivateKeyRegex =
    /^-----BEGIN [A-Z]+ PRIVATE KEY-----\r?\n[\s\S]+?\r?\n-----END [A-Z]+ PRIVATE KEY-----$/i;
  if (sshPrivateKeyRegex.test(trimmed)) {
    return ClipboardItemType.SSH_KEY;
  }

  // 3. Check for SSH Public Keys (MUST check BEFORE ENV)
  // Explicit algorithm prefix - no character threshold
  // Matches: ssh-rsa, ssh-ed25519, ecdsa-sha2-nistp*, ssh-dss
  const sshPublicKeyRegex =
    /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp\d+|ssh-dss)\s+[A-Za-z0-9+/=]+(?:\s+[\w@:.-]+)?$/i;
  if (sshPublicKeyRegex.test(trimmed)) {
    return ClipboardItemType.SSH_KEY;
  }

  // 4. Check for Environment Variables (KEY=value patterns)
  // Must exclude JS/TS code AND SSH key content
  // Rejects: var X=Y, const X=Y, X=>Y, X={...}, content with -----BEGIN/END
  // Accepts: KEY=value, KEY=123, KEY="value", KEY='value', export KEY=value
  // BUT: Allows SSH public keys AS VALUES (e.g., KEY=ssh-rsa AAAA...)
  // Only excludes full SSH key content (private keys with headers)
  const containsFullSSHKey = /^-----BEGIN .+ PRIVATE KEY-----\r?\n/m;
  if (!containsFullSSHKey.test(trimmed)) {
    const envLineRegex =
      /^(?:export\s+)?[A-Z_-][A-Z_0-9-]*=(?![\w]*\s*=>|[\w]*\s*[\[{]|(?:var|const|let|function)\s).*$/m;
    if (envLineRegex.test(trimmed)) {
      return ClipboardItemType.ENV;
    }
  }

  // 5. Check for Email
  // Simple but effective email regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (emailRegex.test(trimmed)) {
    return ClipboardItemType.EMAIL; // Note: Ensure EMAIL is in ClipboardItemType enum
  }

  // 5b. Check for API Keys / Tokens (before URL check)
  // Many API keys look like URLs due to dots but are actually tokens
  // Common API key prefixes
  const apiKeyPrefixes = [
    /^sk_live_/i, // Stripe
    /^sk_test_/i, // Stripe test
    /^rk_live_/i, // Stripe restricted
    /^AIza[azy]/i, // Google API
    /^ya29\./i, // Google OAuth
    /^SG\./i, // SendGrid
    /^sk_/i, // General (many services use sk_ prefix)
    /^pk_/i, // Stripe public key
    /^EAA[az0-9]/i, // Facebook/Meta
    /^ghp_/i, // GitHub Personal Access Token
    /^gho_[a-zA-Z0-9]/i, // GitHub OAuth
    /^github_pat_/i, // GitHub token
    /^xox[baprs]/i, // Slack tokens
    /^AV6xYP6TQ7g7y_\w+/i, // Zoom
    /^[\w-]{20,}\..{10,}\.[\w-]{27,}$/i, // Generic JWT-like (has dots, long)
  ];

  for (const pattern of apiKeyPrefixes) {
    if (pattern.test(trimmed)) {
      return ClipboardItemType.TEXT;
    }
  }

  // Check for Base64 encoded strings (common in API keys like "Bs1ivz84.wA/gAvVwCXk4jyu0NcTnQkzENrVLwL/vGz5Hxa2D9OY=")
  // Base64 strings typically:
  // - End with = or == (padding)
  // - Contain only base64 chars (A-Za-z0-9+/)
  // - Are reasonably long (20+ chars)
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  if (trimmed.length >= 20 && base64Regex.test(trimmed)) {
    // Check if it has high entropy (variety of characters) typical of tokens
    const uniqueChars = new Set(trimmed.replace(/=/g, "")).size;
    if (uniqueChars >= 10) {
      return ClipboardItemType.TEXT;
    }
  }

  // Check for "domain/path" patterns that look like URLs but are actually API keys
  // E.g., "Bs1ivz84.wA/gAvVwCXk4jyu0NcTnQkzENrVLwL/vGz5Hxa2D9OY"
  // These have: base64-looking prefix + "/" + base64-looking suffix
  const likelyTokenPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;
  if (likelyTokenPattern.test(trimmed) && trimmed.length > 20) {
    // Additional check: if it looks like base64 (has / and no real TLD structure)
    // Treat as text
    return ClipboardItemType.TEXT;
  }

  // 3. Check for IP Address (IPv4)
  // Check BEFORE URL - because IPs can match URL regex
  const ipRegex =
    /^(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (ipRegex.test(trimmed)) {
    return ClipboardItemType.IP;
  }

  // 4. Check for URL
  // Priority check: If it starts with a protocol, it's definitely a URL (unless it has spaces)
  // Supports: http, https, ftp, brave, chrome, edge, mongodb, postgres, redis, etc.
  // RFC 3986 scheme: alpha *( alpha / digit / "+" / "-" / "." )
  if (/^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(trimmed)) {
    return ClipboardItemType.URL;
  }

  // Comprehensive regex for URLs without protocol or specific formats:
  // - Optional user:pass auth
  // - Hostname:
  //    - Domain names (example.com, sub.domain.co.uk)
  //    - Localhost
  //    - IPv4 addresses
  // - Optional Port
  // - Optional Path, Query, Hash
  const urlRegex =
    /^(?:(?:https?|ftp):\/\/)?(?:(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?$/i;

  // Simpler regex for localhost specifically
  const localhostRegex =
    /^(?:(?:https?|ftp):\/\/)?localhost(?::\d{2,5})?(?:[/?#]\S*)?$/i;

  if (urlRegex.test(trimmed) || localhostRegex.test(trimmed)) {
    // If it starts with a protocol, it's definitely a URL
    if (trimmed.match(/^(?:https?|ftp):\/\//i)) {
      return ClipboardItemType.URL;
    }

    // If no protocol...
    // 1. Must NOT have spaces (unless encoded, but simple copy usually implies separate words)
    if (/\s/.test(trimmed)) {
      return ClipboardItemType.TEXT;
    }

    // 1b. Additional filter: Exclude high-entropy strings with slashes
    // These are likely API keys/tokens like "Bs1ivz84.wA/gAvVwCXk4jyu0NcTnQkzENrVLwL/vGz5Hxa2D9OY="
    // Token patterns: base64 chars + slash + more base64 chars
    const tokenWithSlashRegex =
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/;
    if (tokenWithSlashRegex.test(trimmed)) {
      // Further check: if it ends with base64 padding (= or ==), treat as token
      if (/=$/.test(trimmed) || trimmed.length > 30) {
        return ClipboardItemType.TEXT;
      }
    }

    // 2. Must look like a domain (at least one dot) or be "localhost"
    if (trimmed.includes(".") || trimmed.toLowerCase() === "localhost") {
      // Heuristic: Filter out common file extensions to differentiate "google.com" from "notes.txt"
      // If NO protocol is present, these common extensions usually mean it's a file, not a website.
      const commonFileExtensions = [
        // Images
        "png",
        "jpg",
        "jpeg",
        "gif",
        "bmp",
        "svg",
        "webp",
        "tif",
        "tiff",
        "ico",
        // Documents
        "txt",
        "pdf",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "ppt",
        "pptx",
        "odt",
        "rtf",
        "md",
        // Archives
        "zip",
        "rar",
        "7z",
        "tar",
        "gz",
        "bz2",
        // Code
        "js",
        "ts",
        "css",
        "scss",
        "html",
        "htm",
        "xml",
        "json",
        "java",
        "py",
        "c",
        "cpp",
        "h",
        "cs",
        "php",
        "sql",
        "sh",
        "bat",
        // Executables / System
        "exe",
        "dll",
        "bin",
        "iso",
        "msi",
        "dmg",
        "pkg",
        "deb",
        "rpm",
        "apk",
      ];

      // Get extension (substring after last dot)
      const parts = trimmed.split(".");
      const ext = (parts[parts.length - 1] || "").toLowerCase();

      // If it ends with a common file extension, treat as TEXT unless it has a protocol (handled above)
      // Note: Some of these COULD be valid TLDs in weird cases (like .sh), but contextually users usually copy filenames.
      if (commonFileExtensions.includes(ext)) {
        return ClipboardItemType.TEXT;
      }

      return ClipboardItemType.URL;
    }
  }

  // 5. Check for OTP (4-8 digits)
  // Usually short, numeric.
  const otpRegex = /^\d{4,8}$/;
  if (otpRegex.test(trimmed)) {
    return ClipboardItemType.OTP;
  }

  // 6. Check for Phone Number causes false positives easily.
  // E.164 or common formats: +1-555-555-5555, (555) 555-5555, 555-555-5555
  // Must be somewhat strict - requires exactly 10 or 11 digits with separators
  const phoneRegex =
    /^(?:\+?1[-.\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/;
  if (phoneRegex.test(trimmed)) {
    return ClipboardItemType.PHONE;
  }

  // 7. Check for Emojis
  // Check if the string is composed ENTIRELY of emojis (and optional whitespace).
  try {
    // Keycap check (e.g. 1️⃣, #️⃣)
    const keycapRegex = /^[0-9#*]\uFE0F?\u20E3$/;
    if (keycapRegex.test(trimmed)) return ClipboardItemType.EMOJI;

    let temp = trimmed;

    // Remove basic emojis and pictographs
    temp = temp.replace(
      /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu,
      "",
    );

    // Remove ZWJ and Variation Selectors
    temp = temp.replace(/[\u200d\ufe0f]/g, "");

    // Remove Combining Enclosing Keycap
    temp = temp.replace(/\u20e3/g, "");

    // Remove Flag sequences (Regional Indicator Symbols)
    // Regional Indicator Symbol Letter A (U+1F1E6) to Z (U+1F1FF)
    temp = temp.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "");

    // Remove whitespace
    temp = temp.replace(/\s/g, "");

    if (temp.length === 0) {
      return ClipboardItemType.EMOJI;
    }
  } catch (e) {
    console.error("Emoji detection error", e);
  }

  // Default to Text
  return ClipboardItemType.TEXT;
}

/**
 * Detects if text has rich HTML formatting (but is NOT a full HTML document)
 * Used to determine if we should store richContent alongside content
 * @param text The text to check
 * @returns true if text has formatting tags but is not a full HTML document
 */
export function hasRichFormatting(text: string): boolean {
  if (!text) return false;

  // Check if it contains any HTML tags.
  // OS clipboards often wrap text/html in full document tags (e.g. <html><body>...)
  // so we should not reject it just because it looks like a full document.
  return /<[a-z][\s\S]*>/i.test(text);
}
