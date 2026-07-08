export interface IApiResponse<T> {
  data?: T;
  message?: string;
  code?: string; // Optional machine-readable error code
}
