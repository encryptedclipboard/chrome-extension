export interface AxiosErrorResponse {
  status?: number | string;
  statusText?: string;
  data?: {
    message?: string;
    error?: string;
  };
}

export interface AxiosError extends Error {
  response?: AxiosErrorResponse;
}

export interface ErrorLike {
  message?: unknown;
  error?: unknown;
}
