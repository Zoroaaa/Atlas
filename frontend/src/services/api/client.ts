import { API_BASE_URL, API_CONFIG } from '@/constants';
import { useAuthStore } from '@/stores/authStore';
import i18next from '@/i18n';

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return API_BASE_URL.LOCAL;
    }
    return API_BASE_URL.PRODUCTION;
  }
  return API_BASE_URL.LOCAL;
};

const BASE_URL = getApiBaseUrl();

// 登录/注册/刷新等接口本身返回 401 时不再尝试刷新，避免循环
const SKIP_REFRESH_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/send-registration-code',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-code',
];

const shouldRefresh = (endpoint: string): boolean =>
  !SKIP_REFRESH_ENDPOINTS.some((path) => endpoint.startsWith(path));

// 并发 401 共享同一个刷新请求，避免重复轮换 token
let refreshPromise: Promise<string | null> | null = null;

/**
 * 在途 API 请求计数。
 * 用于 PWA 更新提示：用户确认更新时若仍有请求在执行，
 * 先把新 SW 的接管与页面刷新推迟到请求结束，避免打断后端操作。
 */
let inflightRequests = 0;

export const getInflightRequestCount = (): number => inflightRequests;

/** 等待在途请求清零；超过 maxWaitMs 仍未结束则放行，避免无限等待 */
export const waitForInflightRequests = (maxWaitMs = 60_000, pollMs = 250): Promise<void> =>
  new Promise((resolve) => {
    if (inflightRequests === 0) {
      resolve();
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (inflightRequests === 0 || Date.now() - startedAt >= maxWaitMs) {
        clearInterval(timer);
        resolve();
      }
    }, pollMs);
  });

async function refreshAccessToken(baseUrl: string): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const token = useAuthStore.getState().token;
      if (!token) return null;

      try {
        const response = await fetch(`${baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'omit',
        });
        if (!response.ok) return null;

        const payload = await response.json().catch(() => null);
        const nextToken = payload?.data?.token || payload?.token;
        if (typeof nextToken !== 'string' || !nextToken) return null;

        // 刷新期间用户可能已登出/切换账号，丢弃过期结果
        if (useAuthStore.getState().token !== token) return null;

        useAuthStore.getState().setToken(nextToken);
        return nextToken;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
}

export class ApiClient {
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
    inflightRequests += 1;
    try {
      return await this.executeRequest<T>(endpoint, options);
    } finally {
      inflightRequests = Math.max(0, inflightRequests - 1);
    }
  }

  private async executeRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', headers: customHeaders, body, signal, timeout } = options;

    const url = `${this.baseUrl}${endpoint}`;

    const config: RequestInit = {
      method,
      headers: this.getHeaders(customHeaders),
      signal,
      credentials: 'omit',
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    let lastError: Error | null = null;
    let didRefresh = false;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          throw new Error(i18next.t('errors:offline'));
        }

        const controller = timeout ? new AbortController() : null;
        const timeoutTimer = controller && timeout ? setTimeout(() => controller.abort(), timeout) : null;

        let response: Response;
        try {
          // 刷新后重试时重新读取最新 token
          config.headers = this.getHeaders(customHeaders);
          response = await fetch(url, controller ? { ...config, signal: controller.signal } : config);
        } finally {
          if (timeoutTimer) clearTimeout(timeoutTimer);
        }

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return response.json();
          }
          return response.text() as unknown as T;
        }

        if (response.status === 401) {
          const errorData = await response.json().catch(() => ({}));
          const message = errorData?.message || errorData?.error?.message;
          const code = errorData?.error?.code || errorData?.code;

          // 持有 token 时先尝试静默刷新一次，刷新失败才登出
          // 匿名请求（如分析埋点）不触发刷新/登出
          if (this.getToken() && !didRefresh && shouldRefresh(endpoint)) {
            didRefresh = true;
            const nextToken = await refreshAccessToken(this.baseUrl);
            if (nextToken) {
              continue;
            }
          }

          if (this.getToken()) {
            useAuthStore.getState().logout();
          }
          throw new ApiError(message || i18next.t('errors:authFailed'), 401, errorData, code || 'AUTH_FAILED');
        }

        if (response.status === 403) {
          const errorData = await response.json().catch(() => ({}));
          const message = errorData?.message || errorData?.error?.message;
          const code = errorData?.error?.code || errorData?.code;
          throw new ApiError(
            message || i18next.t('errors:permissionDenied'),
            403,
            errorData,
            code || 'PERMISSION_DENIED'
          );
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
          if (attempt < this.maxRetries - 1) {
            await this.delay(waitTime);
            continue;
          }
          const errorData = await response.json().catch(() => ({}));
          const code = errorData?.error?.code || errorData?.code || 'RATE_LIMITED';
          throw new ApiError(
            errorData?.message || errorData?.error?.message || i18next.t('errors:rateLimited'),
            429,
            errorData,
            code
          );
        }

        // 仅对幂等的 GET 请求做 5xx 重试，避免重复写入
        if (method === 'GET' && response.status >= 500 && attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelay * (attempt + 1));
          continue;
        }

        const errorData = await response.json().catch(() => ({}));
        // 后端返回的 errorData.message 原样透传给用户（不翻译）
        const errorMessage = errorData.message || errorData.error?.message || `HTTP error! status: ${response.status}`;
        throw new ApiError(errorMessage, response.status, errorData);

      } catch (error) {
        lastError = error as Error;

        if ((error as Error).name === 'AbortError') {
          throw new ApiError(i18next.t('errors:timeout'), 408, { timeout: true });
        }

        if (method === 'GET' &&
            ((error as Error).name === 'TypeError' || (error as Error).message?.includes('fetch')) &&
            attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelay * (attempt + 1));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error(i18next.t('errors:requestFailed'));
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
  code?: string;

  constructor(message: string, status: number, data?: unknown, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

export const apiClient = new ApiClient(BASE_URL);
