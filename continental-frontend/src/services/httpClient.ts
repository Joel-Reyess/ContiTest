/**
 * HTTP Client
 * Centralized HTTP client with interceptors, error handling, and authentication
 */

import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import type { ApiResponse, ApiError, RequestConfig } from '@/interfaces/Api.interface';

export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  skipRetry?: boolean; // Skip automatic retry for this request
}

interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  request: () => Promise<any>;
}

class HttpClient {
  private baseURL: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;
  private isRefreshing = false;
  private failedQueue: QueuedRequest[] = [];

  constructor() {
    this.baseURL = env.API_BASE_URL;
    this.timeout = env.API_TIMEOUT;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private getAuthToken(): string | null {
    try {
      // Primero intentar obtener el token directamente
      const token = localStorage.getItem('auth_token');
      if (token) {
        return token;
      }
      
      // Fallback: obtener desde el objeto user
      const user = localStorage.getItem('user');
      if (user) {
        const userData = JSON.parse(user);
        return userData.token || null;
      }
    } catch (error) {
      logger.error('Error getting auth token', error, 'HTTP_CLIENT');
    }
    return null;
  }

  private buildHeaders(config: RequestConfig): Record<string, string> {
    const headers = { ...this.defaultHeaders, ...config.headers };

    if (config.requiresAuth !== false) {
      const token = this.getAuthToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private buildURL(url: string, params?: Record<string, any>): string {
    const fullURL = url.startsWith('http') ? url : `${this.baseURL}${url}`;
    
    if (!params || Object.keys(params).length === 0) {
      return fullURL;
    }

    const urlParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        urlParams.append(key, String(value));
      }
    });

    return `${fullURL}?${urlParams.toString()}`;
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    let data: any;
    try {
      data = isJson ? await response.json() : await response.text();
    } catch (error) {
      logger.error('Error parsing response', error, 'HTTP_CLIENT');
      throw new Error('Invalid response format');
    }

    if (!response.ok) {
      const apiError: ApiError = {
        message: data.message || `HTTP Error ${response.status}`,
        status: response.status,
        code: data.code,
        details: data,
      };
      throw apiError;
    }

    return data;
  }



  private processQueue(error: any): void {
    this.failedQueue.forEach(({ resolve, reject, request }) => {
      if (error) {
        reject(error);
      } else {
        resolve(request());
      }
    });
    
    this.failedQueue = [];
  }

  private async makeRequest<T>(config: RequestConfig): Promise<ApiResponse<T>> {
    const { method, url, data, params, timeout = this.timeout } = config;
    
    const fullURL = this.buildURL(url, params);
    const headers = this.buildHeaders(config);

    logger.apiRequest(method, fullURL, data);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchConfig: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchConfig.body = JSON.stringify(data);
      }

      const response = await fetch(fullURL, fetchConfig);
      clearTimeout(timeoutId);

      const result = await this.handleResponse<T>(response);
      logger.apiResponse(method, fullURL, response.status, result);

      return result;
    } catch (error: any) {
      logger.apiError(method, fullURL, error);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      // Handle 401 errors with automatic token refresh
      // Skip refresh for login endpoints since 401 there means invalid credentials, not expired session
      if (error.status === 401 && !config.skipRetry && !url.includes('/Auth/refresh-token') && !url.includes('/Auth/login')) {
        return this.handle401Error(config);
      }

      if (error.status) {
        throw error; // API error
      }

      throw new Error('Error en la conexión con el servidor'); // Network or unknown error
    }
  }

  private async handle401Error<T>(originalConfig: RequestConfig): Promise<ApiResponse<T>> {
    if (this.isRefreshing) {
      // If already refreshing, queue this request
      return new Promise((resolve, reject) => {
        this.failedQueue.push({
          resolve: () => resolve(this.makeRequest<T>({ ...originalConfig, skipRetry: true })),
          reject,
          request: () => this.makeRequest<T>({ ...originalConfig, skipRetry: true })
        });
      });
    }

    this.isRefreshing = true;

    try {
      logger.authAction('401 error detected, attempting token refresh');
      
      // Process queued requests with new token
      this.processQueue(null);
      
      // Retry original request with new token
      return this.makeRequest<T>({ ...originalConfig, skipRetry: true });
    } catch (refreshError) {
      logger.error('Token refresh failed, clearing auth', refreshError, 'HTTP_CLIENT');
      
      // Process queued requests with error
      this.processQueue(refreshError);
      
      // Clear auth and redirect to login
      const { authService } = await import('./authService');
      authService.logout();
      
      // Emit session expired event
      window.dispatchEvent(new CustomEvent('session-expired'));
      
      throw refreshError;
    } finally {
      this.isRefreshing = false;
    }
  }

  // Public methods
  async get<T>(url: string, params?: Record<string, any>, config?: Partial<RequestConfig>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>({
      method: 'GET',
      url,
      params,
      ...config,
    });
  }

  async post<T>(url: string, data?: any, config?: Partial<RequestConfig>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>({
      method: 'POST',
      url,
      data,
      ...config,
    });
  }

  async put<T>(url: string, data?: any, config?: Partial<RequestConfig>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>({
      method: 'PUT',
      url,
      data,
      ...config,
    });
  }

  async patch<T>(url: string, data?: any, config?: Partial<RequestConfig>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>({
      method: 'PATCH',
      url,
      data,
      ...config,
    });
  }

  async delete<T>(url: string, config?: Partial<RequestConfig>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>({
      method: 'DELETE',
      url,
      ...config,
    });
  }
}

export const httpClient = new HttpClient();
export default httpClient;