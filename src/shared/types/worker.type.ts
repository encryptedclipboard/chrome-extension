import type { EncryptedData } from "./sync.types";

export enum WorkerAction {
  ENCRYPT = "ENCRYPT",
  DECRYPT = "DECRYPT",
  ENCRYPT_WITH_CREDENTIALS = "ENCRYPT_WITH_CREDENTIALS",
  ENCRYPT_BATCH = "ENCRYPT_BATCH",
  DECRYPT_BATCH = "DECRYPT_BATCH",
  HASH_PASSWORD = "HASH_PASSWORD",
  TRY_DECRYPT = "TRY_DECRYPT",
  VALIDATE_STRENGTH = "VALIDATE_STRENGTH",
  LOCK_ENCRYPT_BATCH = "LOCK_ENCRYPT_BATCH",
  LOCK_DECRYPT_BATCH = "LOCK_DECRYPT_BATCH",
  SEARCH_INDEX = "SEARCH_INDEX",
  SEARCH_QUERY = "SEARCH_QUERY",
}

export interface WorkerMessageRequest {
  id: string;
  action: WorkerAction;
  payload: any;
}

export interface WorkerMessageResponse {
  id: string;
  success: boolean;
  payload?: any;
  error?: string;
  progress?: {
    current: number;
    total: number;
  };
}
