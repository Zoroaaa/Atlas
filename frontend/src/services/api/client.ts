import { API_BASE_URL, API_CONFIG } from '@/constants';
import { useAuthStore } from '@/stores/authStore';

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return API_BASE_URL.LOCAL;
    }
    if (hostname.includes('pages.dev') || hostname.includes('cloudflare')) {
      return API_BASE_URL.PRODUCTION;
    }
    return API_BASE_URL.PRODUCTION;
  }
  return API_BASE_URL.LOCAL;
};

const BASE_URL = getApiBaseUrl();

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
}

class ApiClient {
  private baseUrl: string;
  private maxRetries = API_CONFIG.MAX_RETRIES;
  private retryDelay = API_CONFIG.RETRY_DELAY;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  getToken(): string | null {
    return useAuthStore.getState().token || null;
  }

  private getHeaders(customHeaders?: Record<string, string>): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', headers: customHeaders, body, signal, timeout } = options;

    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.getHeaders(customHeaders);

    const config: RequestInit = {
      method,
      headers,
      signal,
      credentials: 'omit',
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          throw new Error('网络连接不可用');
        }

        const controller = timeout ? new AbortController() : null;
        if (controller && timeout) {
          setTimeout(() => controller.abort(), timeout);
        }

        const response = await fetch(url, controller ? { ...config, signal: controller.signal } : config);

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return response.json();
          }
          return response.text() as unknown as T;
        }

        if (response.status === 401) {
          useAuthStore.getState().logout();
          const authError = new Error('认证失败，请重新登录');
          (authError as unknown as Record<string, unknown>).code = 'AUTH_FAILED';
          throw authError;
        }

        if (response.status === 403) {
          const permError = new Error('权限不足');
          (permError as unknown as Record<string, unknown>).code = 'PERMISSION_DENIED';
          throw permError;
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
          if (attempt < this.maxRetries - 1) {
            await this.delay(waitTime);
            continue;
          }
          const rateLimitError = new Error('请求过于频繁，请稍后再试');
          (rateLimitError as unknown as Record<string, unknown>).code = 'RATE_LIMITED';
          throw rateLimitError;
        }

        if (response.status >= 500 && attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelay * (attempt + 1));
          continue;
        }

        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error?.message || `HTTP error! status: ${response.status}`;
        throw new ApiError(errorMessage, response.status, errorData);

      } catch (error) {
        lastError = error as Error;

        if ((error as Error).name === 'AbortError') {
          throw new ApiError('请求超时', 408, { timeout: true });
        }

        if (((error as Error).name === 'TypeError' || (error as Error).message?.includes('fetch')) &&
            attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelay * (attempt + 1));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('请求失败');
  }

  async get<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', signal });
  }

  async post<T>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body, signal });
  }

  async put<T>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body, signal });
  }

  async patch<T>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body, signal });
  }

  async delete<T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', body, signal });
  }
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export const apiClient = new ApiClient(BASE_URL);
