const APP_SECRET_PART_1 = "xK9#mP2@";
const APP_SECRET_PART_2 = "nL5&qR8$";
const APP_SECRET_PART_3 = "vT7!jW3#";
const APP_SECRET_PART_4 = "yB6&zN9*";

const APP_SECRET =
  APP_SECRET_PART_1 + APP_SECRET_PART_2 + APP_SECRET_PART_3 + APP_SECRET_PART_4;

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    const char = bytes[i];
    if (char === undefined) continue;
    binary += String.fromCharCode(char);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const salt = encoder.encode("url-token-salt-v1");

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const key = await getCryptoKey(APP_SECRET);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return base64UrlEncode(combined.buffer);
}

export async function decryptToken(encryptedToken: string): Promise<string> {
  try {
    const combined = base64UrlDecode(encryptedToken);

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const key = await getCryptoKey(APP_SECRET);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error("Failed to decrypt token. Invalid or corrupted token.");
  }
}
