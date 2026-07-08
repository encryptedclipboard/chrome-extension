/**
 * Confidential Information Detector
 * Uses strict patterns to identify secrets - high precision, minimal false positives.
 */

const PATTERNS = {
  // JWT Tokens - header.payload.signature, very specific
  JWT: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,

  // AWS Access Keys
  AWS_KEY: /(?:AKIA|ASIA|AROA|AIDA)[A-Z0-9]{16}/,

  // PEM Private Keys - all formats (OpenSSH, RSA, EC, DSA, encrypted, PuTTY)
  PRIVATE_KEY:
    /-----BEGIN (?:OPENSSH|RSA|EC|DSA|ENCRYPTED)? ?PRIVATE KEY-----|-----BEGIN PUTTY PRIVATE KEY-----/i,

  // SSH Public Keys (ssh-rsa, ssh-ed25519, ecdsa-sha2-*, ssh-dss)
  SSH_PUBLIC_KEY:
    /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp\d+|ssh-dss)\s+[A-Za-z0-9+\/=]+/i,

  // Hex hashes: MD5 (32), SHA-1 (40), SHA-256 (64)
  // These are often standalone and unlabeled.
  HEX_HASH: /\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/,

  // Common API Key Prefixes (OpenAI, GitHub, Square, etc.)
  // Detects standalone keys starting with these prefixes
  TOKEN_PREFIX:
    /\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{30,}|sq0p-[a-zA-Z0-9]{20,}|sq0i-[a-zA-Z0-9]{20,})\b/,

  // Key-value credential pairs (api_key=xxx, TOKEN: "xxx", secret=xxx)
  KEY_VALUE:
    /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret|bearer)\s*[:=]\s*["']?[a-zA-Z0-9/+_\-.]{16,}["']?/i,

  // Password assignments - password=xxx, passwd: xxx
  PASSWORD_ASSIGN: /\b(?:password|passwd|pwd)\s*[:=]\s*["']?\S{6,}["']?/i,

  // Credit Cards - 4×4 digit groupings
  CREDIT_CARD: /\b(?:\d{4}[- ]){3}\d{4}\b/,

  // SSN
  SSN: /\b\d{3}-\d{2}-\d{4}\b/,

  // Environment Variable patterns (KEY=value)
  ENV_VAR: /^[A-Z_][A-Z_0-9]*=.+$/m,
};

/**
 * Heuristic: detects a raw password-like string.
 * A password has: no spaces, 8-128 chars, high entropy,
 * and is not a URL, file path, or email address.
 */
function looksLikePassword(text: string): boolean {
  if (text.includes(" ") || text.length < 8 || text.length > 128) return false;

  // Exclude obvious non-passwords
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

  // Case 1: Has special characters + digits + letters (e.g. P@ssw0rd123)
  if (hasSpecial && hasDigit && (hasLower || hasUpper)) return true;

  // Case 2: Alphanumeric only but has lower + upper + digits (e.g. crG5b7ndVgxRMwq8Z1H9)
  if (!hasSpecial && hasLower && hasUpper && hasDigit) return true;

  // Case 3: Special characters + letters (no digits, e.g. "secret#pass")
  if (hasSpecial && (hasLower || hasUpper) && text.length >= 10) return true;

  // Case 4: Long entropy strings (Hash-like or Token-like)
  // If it's long and has digits + letters, even if single-case
  if (text.length >= 24 && hasDigit && (hasLower || hasUpper)) return true;

  return false;
}

/**
 * Checks if the given text is a confidential credential or secret.
 * Returns false for normal prose, paragraphs, or regular text.
 */
export function isConfidential(text: string): boolean {
  if (!text || typeof text !== "string") return false;

  const trimmed = text.trim();

  // Skip paragraphs - credentials are never multi-line prose or long sentences
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 8) return false;

  // Check against all named patterns
  for (const pattern of Object.values(PATTERNS)) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  // Password heuristic - catches raw passwords
  if (looksLikePassword(trimmed)) {
    return true;
  }

  // Raw token heuristic - long single-token with high entropy
  if (
    trimmed.length >= 24 &&
    !trimmed.includes(" ") &&
    /^[a-zA-Z0-9+/=_.\-]+$/.test(trimmed)
  ) {
    // If it has mixed case, it's a strong indicator
    const hasMixedCase = /[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed);
    const hasDigits = /[0-9]/.test(trimmed);

    // Mixed case + digits is definitely a token
    if (hasMixedCase && hasDigits) return true;

    // Even if single case, if it's long enough (32+), treat as secret (Hash, Token, etc.)
    if (trimmed.length >= 32 && hasDigits) return true;
  }

  return false;
}
