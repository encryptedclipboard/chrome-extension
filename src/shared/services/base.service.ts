import type { AxiosInstance } from "axios";

/**
 * Base Service Class
 * Provides common functionality for all service classes
 */
export class BaseService {
  protected http: AxiosInstance;

  constructor(http: AxiosInstance) {
    this.http = http;
  }
}
