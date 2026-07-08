import { StorageType, UsageEventType } from "../enums";

export interface IUsageEventRecord {
  _id: string;
  eventType: UsageEventType;
  storageType: StorageType;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface IAdminUsageEventRecord extends IUsageEventRecord {
  userId: string;
}
