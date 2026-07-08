import { ClipboardItemType } from "../enums/clipboard-item-type.enum";

export interface SharedItem {
  id: string; // MongoDB _id
  shortId: string; // The public ID used in URL
  user: string; // User ID
  originalItemId?: string; // Reference to original item if still exists
  type: ClipboardItemType;
  content: string; // Encrypted or plaintext content
  isEncrypted: boolean;
  encryptionData?: {
    iv: string;
    salt: string;
    authTag: string;
    richAuthTag?: string;
    iterations?: number;
  };
  expiresAt?: number; // Timestamp
  viewCount: number;
  storageId?: string; // For images
  metadata: {
    sourceUrl?: string;
    hostname?: string;
    size?: number;
  };
  createdAt: number;
  updatedAt: number;
  isExpired?: boolean; // Flag for expired items
}
