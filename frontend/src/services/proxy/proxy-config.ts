/**
 * 代理配置与底层工具：代理地址、状态常量、URL 改写与健康检查请求。
 *
 * 约束：只改写合法绝对 URL；代理地址不参与编码，拼接后原样发起请求。
 */

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

/** 代理健康检查地址。 */
export function getProxyHealthCheckUrl(): string {
  return `${proxyConfig.proxyServer}${proxyConfig.api.health}`;
}

/** 代理状态查询地址。 */
export function getProxyStatusUrl(): string {
  return `${proxyConfig.proxyServer}${proxyConfig.api.status}`;
}

/** 把绝对 URL 改写成代理 URL；非法或空输入原样返回，避免产生坏链接。 */
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

/** 从代理 URL 还原原始地址；不以代理前缀开头时视为原始地址直接返回。 */
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

/** 请求代理健康检查接口；超时或网络错误都归为 success=false，由调用方决定提示。 */
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
