/**
 * 配置服务
 * 功能：从数据库加载配置，提供缓存机制，替代硬编码常量
 * 
 * 三层架构职责边界：
 *   Layer 1 wrangler.toml  → 部署级基础设施参数
 *   Layer 2 constants.ts   → 代码枚举/正则/固定业务逻辑
 *   Layer 3 DB system_config → 运行期业务参数（本服务负责读取）
 * 
 * 后备值说明：
 *   后备值直接写在方法调用的第二个参数中，如 configService.getInt(DB_CONFIG_KEYS.XXX, 1000)
 *   仅当 DB 中无该配置时使用后备值
 */
import { Env } from '@/types';

interface ConfigCache {
  data: Record<string, string>;
  loadedAt: number;
}

let configCache: ConfigCache | null = null;
const CACHE_TTL = 60000;

export class ConfigService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  private async loadConfig(): Promise<Record<string, string>> {
    const now = Date.now();
    
    if (configCache && (now - configCache.loadedAt) < CACHE_TTL) {
      return configCache.data;
    }

    try {
      const results = await this.env.DB.prepare(
        'SELECT key, value FROM system_config'
      ).all<{ key: string; value: string }>();

      const data: Record<string, string> = {};
      for (const row of results.results || []) {
        data[row.key] = row.value;
      }

      configCache = { data, loadedAt: now };
      return data;
    } catch (error) {
      console.error('Load config error:', error);
      return configCache?.data || {};
    }
  }

  async get(key: string, defaultValue: string): Promise<string> {
    const config = await this.loadConfig();
    return config[key] ?? defaultValue;
  }

  async getInt(key: string, defaultValue: number): Promise<number> {
    const value = await this.get(key, String(defaultValue));
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  async getFloat(key: string, defaultValue: number): Promise<number> {
    const value = await this.get(key, String(defaultValue));
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  async getBoolean(key: string, defaultValue: boolean): Promise<boolean> {
    const value = await this.get(key, defaultValue ? '1' : '0');
    return value === '1' || value === 'true';
  }

  async getJson<T>(key: string, defaultValue: T): Promise<T> {
    const value = await this.get(key, '');
    if (!value) return defaultValue;
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }

  static clearCache(): void {
    configCache = null;
  }

  async getAll(): Promise<Record<string, string>> {
    return this.loadConfig();
  }

  async getGroup(groupName: string): Promise<Record<string, string>> {
    try {
      const results = await this.env.DB.prepare(
        'SELECT key, value FROM system_config WHERE config_group = ?'
      ).bind(groupName).all<{ key: string; value: string }>();

      const data: Record<string, string> = {};
      for (const row of results.results || []) {
        data[row.key] = row.value;
      }
      return data;
    } catch (error) {
      console.error('Get config group error:', error);
      return {};
    }
  }
}

export async function getConfigService(env: Env): Promise<ConfigService> {
  return new ConfigService(env);
}
