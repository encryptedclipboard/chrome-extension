export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
  authTag: string;
  richAuthTag?: string;
  iterations?: number;
  version?: number;
}

export interface PasswordStrength {
  score: number; // 0-4
  feedback: string[];
  isStrong: boolean;
}
