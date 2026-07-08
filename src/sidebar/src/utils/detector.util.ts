/**
 * Detection Utilities for Sidebar
 * Handles color code detection and confidential information identification.
 */

// SSH key regex patterns - exported for smart blur logic
const SSH_PRIVATE_KEY_REGEX =
  /-----BEGIN (?:OPENSSH|RSA|EC|DSA|ENCRYPTED)? ?PRIVATE KEY-----|-----BEGIN PUTTY PRIVATE KEY-----/i;
const SSH_PUBLIC_KEY_REGEX =
  /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp\d+|ssh-dss)\s+[A-Za-z0-9+\/=]+/i;

export { SSH_PRIVATE_KEY_REGEX, SSH_PUBLIC_KEY_REGEX };

const CONFIDENTIAL_PATTERNS = {
  // JWT Tokens - header.payload.signature, very specific
  JWT: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,

  // AWS Access Keys
  AWS_KEY: /(?:AKIA|ASIA|AROA|AIDA)[A-Z0-9]{16}/,

  // PEM Private Keys - all formats (OpenSSH, RSA, EC, DSA, encrypted, PuTTY)
  PRIVATE_KEY: SSH_PRIVATE_KEY_REGEX,

  // SSH Public Keys (ssh-rsa, ssh-ed25519, ecdsa-sha2-*, ssh-dss)
  SSH_PUBLIC_KEY: SSH_PUBLIC_KEY_REGEX,

  // Hex hashes: MD5 (32), SHA-1 (40), SHA-256 (64)
  HEX_HASH: /\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/,

  // Common API Key Prefixes
  TOKEN_PREFIX:
    /\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{30,}|sq0p-[a-zA-Z0-9]{20,}|sq0i-[a-zA-Z0-9]{20,})\b/,

  // Key-value credential pairs
  KEY_VALUE:
    /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret|bearer)\s*[:=]\s*["']?[a-zA-Z0-9/+_\-.]{16,}["']?/i,

  // Password assignments
  PASSWORD_ASSIGN: /\b(?:password|passwd|pwd)\s*[:=]\s*["']?\S{6,}["']?/i,

  // Credit Cards
  CREDIT_CARD: /\b(?:\d{4}[- ]){3}\d{4}\b/,

  // SSN
  SSN: /\b\d{3}-\d{2}-\d{4}\b/,
};

function looksLikePassword(text: string): boolean {
  if (
    typeof text !== "string" ||
    text.includes(" ") ||
    text.length < 8 ||
    text.length > 128
  )
    return false;

  if (/^https?:\/\//i.test(text)) return false;
  if (/^[./~\\]/.test(text)) return false;
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(text))
    return false;
  if (/^\d+$/.test(text)) return false;
  if (/^[a-zA-Z]+$/.test(text)) return false;

  const hasLower = /[a-z]/.test(text);
  const hasUpper = /[A-Z]/.test(text);
  const hasDigit = /[0-9]/.test(text);
  const hasSpecial = /[!@#$%^&*().\-_+=\[\]{};:'"<>?/\\|~`]/.test(text);

  if (hasSpecial && hasDigit && (hasLower || hasUpper)) return true;
  if (!hasSpecial && hasLower && hasUpper && hasDigit) return true;
  if (hasSpecial && (hasLower || hasUpper) && text.length >= 10) return true;
  if (text.length >= 24 && hasDigit && (hasLower || hasUpper)) return true;

  return false;
}

/**
 * Checks if the given text is a confidential credential or secret.
 */
export function isConfidential(text: string): boolean {
  if (!text || typeof text !== "string") return false;

  const trimmed = text.trim();

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 8) return false;

  for (const pattern of Object.values(CONFIDENTIAL_PATTERNS)) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  if (looksLikePassword(trimmed)) {
    return true;
  }

  if (
    trimmed.length >= 24 &&
    !trimmed.includes(" ") &&
    /^[a-zA-Z0-9+/=_.\-]+$/.test(trimmed)
  ) {
    const hasMixedCase = /[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed);
    const hasDigits = /[0-9]/.test(trimmed);

    if (hasMixedCase && hasDigits) return true;
    if (trimmed.length >= 32 && hasDigits) return true;
  }

  return false;
}

/**
 * Detects if a string is a valid Hex or RGB/RGBA color code.
 * Handles optional quotes wrapping the color code.
 */
export function detectColor(str: string): string | null {
  if (!str || typeof str !== "string") return null;

  // Trim and remove optional wrapping quotes (single or double)
  let trimmed = str.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }

  // Strict Hex Regex: # followed by 3, 4, 6, or 8 hex digits
  const hexRegex = /^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6,8})$/;

  // RGB/RGBA Regex
  const rgbRegex =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i;

  if (hexRegex.test(trimmed)) return trimmed;
  if (rgbRegex.test(trimmed)) return trimmed;

  return null;
}
