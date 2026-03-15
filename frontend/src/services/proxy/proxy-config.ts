import { PROXY_CONFIG, PROXY_TIMEOUTS } from '@/constants';

export type ProxyStatus = 'disabled' | 'enabled' | 'error' | 'checking';

export interface ProxyStatusInfo {
  enabled: boolean;
  status: ProxyStatus;
  server: string;
  lastHealthCheck: number | null;
  isHealthy: boolean | null;
  version: string;
}

export const proxyConfig = {
  proxyServer: PROXY_CONFIG.PROXY_SERVER,
  defaultEnabled: PROXY_CONFIG.DEFAULT_ENABLED,
  version: PROXY_CONFIG.VERSION,
  backendVersion: PROXY_CONFIG.BACKEND_VERSION,

  api: {
    health: '/api/health',
    status: '/api/status',
  },

  timeouts: {
    healthCheck: PROXY_TIMEOUTS.HEALTH_CHECK,
  },

  storageKeys: {
    proxyEnabled: 'codeseek_proxy_enabled',
  },

  status: {
    DISABLED: 'disabled',
    ENABLED: 'enabled',
    ERROR: 'error',
    CHECKING: 'checking',
  } as const,
};

export function getProxyHealthCheckUrl(): string {
  return `${proxyConfig.proxyServer}${proxyConfig.api.health}`;
}

export function getProxyStatusUrl(): string {
  return `${proxyConfig.proxyServer}${proxyConfig.api.status}`;
}

export function convertToProxyUrl(originalUrl: string, proxyServer?: string): string {
  const server = proxyServer || proxyConfig.proxyServer;
  if (!originalUrl || typeof originalUrl !== 'string') {
    return originalUrl;
  }

  try {
    new URL(originalUrl);
    return `${server}/${originalUrl}`;
  } catch {
    return originalUrl;
  }
}

export function getOriginalUrl(proxyUrl: string, proxyServer?: string): string {
  if (!proxyUrl || typeof proxyUrl !== 'string') {
    return proxyUrl;
  }

  const server = proxyServer || proxyConfig.proxyServer;

  try {
    const proxyPrefix = `${server}/`;
    if (!proxyUrl.startsWith(proxyPrefix)) {
      return proxyUrl;
    }
    return proxyUrl.substring(proxyPrefix.length);
  } catch {
    return proxyUrl;
  }
}

export async function testProxyConnectivity(): Promise<{
  success: boolean;
  responseTime?: number;
  error?: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), proxyConfig.timeouts.healthCheck);

  try {
    const startTime = performance.now();
    const response = await fetch(getProxyHealthCheckUrl(), {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const endTime = performance.now();

    if (response.ok) {
      return {
        success: true,
        responseTime: Math.round(endTime - startTime),
      };
    }

    return {
      success: false,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
