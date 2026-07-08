export interface SetupOffscreenDocumentOptions {
  force?: boolean;
}

export interface ThumbnailResponse {
  success: boolean;
  thumbnail?: string;
  error?: string;
  id?: number;
}
