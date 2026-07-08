export enum SyncStage {
  DOWNLOADING = "downloading",
  DECRYPTING = "decrypting",
  PROCESSING = "processing",
  SYNCING = "syncing",
  THUMBNAIL_GENERATING = "thumbnail_generating",
  UPLOADING = "uploading",
  SAVING = "saving",
  COMPLETE = "complete",
  ERROR = "error",
  WAITING_FOR_CONNECTIVITY = "waiting_for_connectivity",
  PAUSED = "paused",
}
