/**
 * 代理服务：维护开关状态、连通性检查与健康轮询，并把开关持久化到 localStorage。
 *
 * 约束：状态变更通过 document 事件广播；清理时必须停掉轮询定时器。
 */

import {
  proxyConfig,
  testProxyConnectivity,
  type ProxyStatus,
  type ProxyStatusInfo,
} from './proxy-config';
import i18next from '@/i18n';

/** 代理状态机：负责启用/停用、健康检查与状态持久化。 */
class ProxyService {
  private currentStatus: ProxyStatus = proxyConfig.status.DISABLED;
  private lastHealthCheck: number | null = null;
  private isHealthy: boolean | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  async init(): Promise<{ success: boolean; error?: string }> {
    try {
      const enabled = this.loadProxyState();

      if (enabled) {
        await this.enableProxy();
      }

      return { success: true };
    } catch (error) {
      console.error('代理服务初始化失败:', error);
      this.currentStatus = proxyConfig.status.ERROR;
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  isProxyEnabled(): boolean {
    return this.currentStatus === proxyConfig.status.ENABLED;
  }

  async toggleProxy(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.isProxyEnabled()) {
        return await this.disableProxy();
      } else {
        return await this.enableProxy();
      }
    } catch (error) {
      console.error('切换代理状态失败:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async enableProxy(): Promise<{ success: boolean; error?: string }> {
    try {
      this.currentStatus = proxyConfig.status.CHECKING;

      const result = await testProxyConnectivity();

      if (!result.success) {
        this.currentStatus = proxyConfig.status.ERROR;
        return { success: false, error: result.error || i18next.t('errors:proxy.serverConnectionFailed') };
      }

      this.currentStatus = proxyConfig.status.ENABLED;
      this.isHealthy = true;
      this.lastHealthCheck = Date.now();
      this.saveProxyState(true);
      this.startHealthCheck();

      this.dispatchStatusChange();

      return { success: true };
    } catch (error) {
      this.currentStatus = proxyConfig.status.ERROR;
      console.error('启用代理失败:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async disableProxy(): Promise<{ success: boolean; error?: string }> {
    try {
      this.currentStatus = proxyConfig.status.DISABLED;
      this.saveProxyState(false);
      this.stopHealthCheck();

      this.dispatchStatusChange();

      return { success: true };
    } catch (error) {
      console.error('禁用代理失败:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async checkProxyHealth(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await testProxyConnectivity();
      this.lastHealthCheck = Date.now();
      this.isHealthy = result.success;

      if (!result.success) {
        this.dispatchHealthCheckFailed(result.error || 'Unknown error');
      }

      return result;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = Date.now();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.dispatchHealthCheckFailed(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  getProxyStatus(): ProxyStatusInfo {
    return {
      enabled: this.isProxyEnabled(),
      status: this.currentStatus,
      server: proxyConfig.proxyServer,
      lastHealthCheck: this.lastHealthCheck,
      isHealthy: this.isHealthy,
      version: proxyConfig.version,
    };
  }

  shouldProxy(url: string): boolean {
    if (!url) return false;

    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  cleanup(): void {
    this.stopHealthCheck();
  }

  private startHealthCheck(): void {
    this.checkProxyHealth();
    // 每 5 分钟轮询一次；仅代理开启时才真正发请求
    this.healthCheckTimer = setInterval(() => {
      if (this.isProxyEnabled()) {
        this.checkProxyHealth().then(result => {
          if (!result.success) {
            console.warn('代理健康检查失败:', result.error);
          }
        });
      }
    }, 5 * 60 * 1000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private saveProxyState(enabled: boolean): void {
    try {
      localStorage.setItem(proxyConfig.storageKeys.proxyEnabled, enabled.toString());
    } catch {
      console.warn('保存代理状态失败');
    }
  }

  private loadProxyState(): boolean {
    try {
      const stored = localStorage.getItem(proxyConfig.storageKeys.proxyEnabled);
      return stored === 'true';
    } catch {
      console.warn('加载代理状态失败');
      return proxyConfig.defaultEnabled;
    }
  }

  private dispatchStatusChange(): void {
    // 事件名是跨组件契约，改名需同步所有 document 监听方
    document.dispatchEvent(new CustomEvent('proxyStatusChanged', {
      detail: {
        enabled: this.isProxyEnabled(),
        status: this.currentStatus,
        timestamp: Date.now(),
      },
    }));
  }

  private dispatchHealthCheckFailed(error: string): void {
    document.dispatchEvent(new CustomEvent('proxyHealthCheckFailed', {
      detail: {
        error,
        timestamp: Date.now(),
      },
    }));
  }
}

/** 全局单例；应用启动时调用 init() 恢复上次开关状态。 */
export const proxyService = new ProxyService();

export { convertToProxyUrl, getOriginalUrl } from './proxy-config';

export type { ProxyStatus, ProxyStatusInfo } from './proxy-config';

export default proxyService;
