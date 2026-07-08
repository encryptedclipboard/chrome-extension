import { ClipboardItemType } from "../enums/clipboard-item-type.enum";

export interface ServerClipboardItem {
  _id: string;
  type: ClipboardItemType;
  content: string;
  richContent?: string;
  encryptionData?: {
    iv: string;
    salt: string;
    authTag: string;
    richAuthTag?: string;
    iterations?: number;
    version?: number;
  };
  metadata?: {
    sourceUrl?: string;
    hostname?: string;
    size?: number;
  };
  tags?: string[];
  isFavorite?: boolean;
  isEncrypted?: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  isDeleted?: boolean;
  localId?: string; // For tracking during batch uploads
  thumbnail?: string; // Cloud thumbnail if available
}

export interface ClipboardPushPayload {
  type: string;
  content: string;
  richContent?: string;
  metadata?: any;
  tags?: string[];
  isFavorite?: boolean | number;
  isEncrypted: boolean;
  encryptionData?: {
    iv: string;
    salt: string;
    authTag: string;
    richAuthTag?: string;
    iterations?: number;
  };
}

export interface ClipboardBatchItem extends ClipboardPushPayload {
  localId: string;
}

export interface CheckUpdatesResponse {
  changes: {
    _id: string;
    updatedAt: string | number;
    isDeleted: boolean;
    deletedAt?: string | number;
  }[];
  count: number;
  timestamp: number;
}

export interface FetchAllItemsParams {
  limit?: number;
  updatedAt__gt?: number;
}

export interface CapturedItem {
  type: string;
  content: string;
  richContent?: string;
  metadata: {
    source: string;
    [key: string]: any;
  };
}
