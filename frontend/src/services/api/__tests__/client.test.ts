import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, ApiError } from '../client';

// Mock authStore — must be at top level for vitest hoisting
const mockLogout = vi.fn();
vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      token: null,
      logout: mockLogout,
    }),
  },
}));

// Mock constants with short RETRY_DELAY for fast tests
vi.mock('@/constants', () => ({
  API_BASE_URL: { LOCAL: '/api', PRODUCTION: 'https://example.com/api' },
  API_CONFIG: { MAX_RETRIES: 3, RETRY_DELAY: 10, DEFAULT_TIMEOUT: 15000 },
  TOAST_CONFIG: { MAX_TOASTS: 5, DEFAULT_DURATION: 5000 },
  SIDEBAR_CONFIG: { DEFAULT_WIDTH: 280, COLLAPSED_WIDTH: 72, MOBILE_WIDTH: 288 },
  PROXY_CONFIG: { PROXY_SERVER: '', DEFAULT_ENABLED: true, VERSION: '1', BACKEND_VERSION: '1' },
  PROXY_TIMEOUTS: { HEALTH_CHECK: 10000 },
  VALIDATION_REGEX: { USERNAME: /^[a-zA-Z0-9_]+$/, EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  VALIDATION_RULES: {},
  VERIFICATION_CODE_LENGTH: 6,
  MAX_LOCAL_SEARCH_HISTORY: 100,
  APP_VERSION: '2.0.0',
}));

describe('ApiClient', () => {
  let client: ApiClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new ApiClient('/api');
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    mockLogout.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('retry logic', () => {
    it('should retry on network failure and succeed on 3rd attempt', async () => {
      const successResponse = {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: 'success' }),
      };

      fetchSpy
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(successResponse);

      const result = await client.request<{ data: string }>('/test');
      expect(result).toEqual({ data: 'success' });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should retry on 5xx error and succeed on retry', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        headers: { get: () => null },
        json: () => Promise.resolve({ message: 'Internal Server Error' }),
      };
      const successResponse = {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: 'ok' }),
      };

      fetchSpy
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await client.request<{ data: string }>('/test');
      expect(result).toEqual({ data: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should throw after exhausting all retries', async () => {
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.request('/test')).rejects.toThrow('Failed to fetch');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('401 handling', () => {
    it('should call logout on 401 when token exists', async () => {
      // Override getToken to simulate having a token
      const clientWithToken = new ApiClient('/api');
      clientWithToken.getToken = () => 'valid-token';

      const response401 = {
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      };
      fetchSpy.mockResolvedValue(response401);

      await expect(clientWithToken.request('/test')).rejects.toThrow('认证失败，请重新登录');
      expect(mockLogout).toHaveBeenCalled();
    });

    it('should not call logout on 401 when no token', async () => {
      const response401 = {
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      };
      fetchSpy.mockResolvedValue(response401);

      await expect(client.request('/test')).rejects.toThrow('认证失败，请重新登录');
      expect(mockLogout).not.toHaveBeenCalled();
    });
  });

  describe('429 backoff', () => {
    it('should respect Retry-After header and retry', async () => {
      const response429 = {
        ok: false,
        status: 429,
        headers: { get: (name: string) => name === 'Retry-After' ? '0' : null },
        json: () => Promise.resolve({}),
      };
      const successResponse = {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: 'ok' }),
      };

      fetchSpy
        .mockResolvedValueOnce(response429)
        .mockResolvedValueOnce(successResponse);

      const result = await client.request<{ data: string }>('/test');

      expect(result).toEqual({ data: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should throw RATE_LIMITED when all retries exhausted on 429', async () => {
      const response429 = {
        ok: false,
        status: 429,
        // Retry-After: 0 means no wait, allowing fast test execution
        headers: { get: (name: string) => name === 'Retry-After' ? '0' : null },
        json: () => Promise.resolve({}),
      };

      fetchSpy.mockResolvedValue(response429);

      await expect(client.request('/test')).rejects.toThrow('请求过于频繁，请稍后再试');
    });
  });

  describe('timeout', () => {
    it('should use AbortController when timeout is set', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      fetchSpy.mockRejectedValue(abortError);

      await expect(client.request('/test', { timeout: 5000 })).rejects.toThrow('请求超时');
    });
  });

  describe('convenience methods', () => {
    it('get should call request with GET method', async () => {
      const successResponse = {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ id: 1 }),
      };
      fetchSpy.mockResolvedValue(successResponse);

      await client.get('/users');
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('post should call request with POST method and body', async () => {
      const successResponse = {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ id: 1 }),
      };
      fetchSpy.mockResolvedValue(successResponse);

      await client.post('/users', { name: 'test' });
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
        })
      );
    });
  });

  describe('ApiError', () => {
    it('should throw ApiError for non-retryable HTTP errors', async () => {
      const response404 = {
        ok: false,
        status: 404,
        headers: { get: () => null },
        json: () => Promise.resolve({ message: 'Not found' }),
      };
      fetchSpy.mockResolvedValue(response404);

      try {
        await client.request('/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(404);
        expect((error as ApiError).message).toBe('Not found');
      }
    });
  });
});
