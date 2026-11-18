/**
 * 站点公开配置：内存缓存 5 分钟，请求失败时回退到上次成功值或内置默认值。
 *
 * 约束：字段同时兼容 camelCase 与后端历史 snake_case 命名。
 */

import { configApi } from '@/services/api';

export interface PublicConfig {
  appVersion: string;
  siteName: string;
  siteDescription: string;
  allowRegistration: boolean;
  communityEnabled: boolean;
}

// 仅用于清理旧版本残留的 localStorage 键，当前配置只缓存在内存
const CONFIG_CACHE_KEY = 'app_config_cache';
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

let cachedConfig: PublicConfig | null = null;
let lastFetchTime = 0;

function getDefaultConfig(): PublicConfig {
  return {
    appVersion: '1.9.0',
    siteName: 'Atlas',
    siteDescription: '搜索全网资源，一步直达',
    allowRegistration: true,
    communityEnabled: true,
  };
}

function parseConfig(data: Record<string, unknown>): PublicConfig {
  const defaults = getDefaultConfig();
  
  const allowReg = data.allowRegistration ?? data.enable_registration;
  const communityEn = data.communityEnabled ?? data.community_enabled;
  const siteNameVal = data.siteName ?? data.site_name;
  const siteDescVal = data.siteDescription ?? data.site_description;
  
  return {
    appVersion: String(data.appVersion ?? defaults.appVersion),
    siteName: String(siteNameVal ?? defaults.siteName),
    siteDescription: String(siteDescVal ?? defaults.siteDescription),
    allowRegistration: allowReg === true || allowReg === 1 || allowReg === '1' || allowReg === 'true',
    communityEnabled: communityEn === true || communityEn === 1 || communityEn === '1' || communityEn === 'true',
  };
}

/** 公开配置服务：供 ConfigContext 读取站点名、注册开关等全局信息。 */
export const configService = {
  async getPublicConfig(): Promise<PublicConfig> {
    const now = Date.now();
    
    if (cachedConfig && (now - lastFetchTime) < CONFIG_CACHE_TTL) {
      return cachedConfig;
    }

    try {
      const response = await configApi.getPublicConfig();
      if (response.success && response.data) {
        cachedConfig = parseConfig(response.data);
        lastFetchTime = now;
        return cachedConfig;
      }
    } catch (error) {
      console.error('Failed to fetch public config:', error);
      if (cachedConfig) {
        return cachedConfig;
      }
    }

    return getDefaultConfig();
  },

  async getConfigValue<K extends keyof PublicConfig>(key: K): Promise<PublicConfig[K]> {
    const config = await this.getPublicConfig();
    return config[key];
  },

  clearCache(): void {
    cachedConfig = null;
    lastFetchTime = 0;
    try {
      localStorage.removeItem(CONFIG_CACHE_KEY);
    } catch (_e) {
      // ignore
    }
  },

  getDefaultConfig,
};
