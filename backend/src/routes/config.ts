/**
 * 系统配置与分析模块
 * 功能：系统配置管理、分析事件记录、缓存管理、配置变更日志
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { Env, SystemConfig, EmailSendLog, ConfigChangeLog, ConfigGroup } from '@/types';
import { success, error, generateId } from '@/utils';
import { authMiddleware, checkIsAdmin, checkIsSuperAdmin } from '@/middleware/auth';
import { ConfigService } from '@/services';

export const configRoutes = new Hono<{ Bindings: Env }>();

configRoutes.use('*', authMiddleware);

// 不再使用本地权限检查函数，改用从 middleware/auth.ts 导入的 checkIsAdmin/checkIsSuperAdmin

const DEFAULT_CONFIG_VALUES: Record<string, { value: string; description: string; configType: string; configGroup: string; isPublic: number; isSensitive: number; validationRules?: string }> = {
  'site_name': { value: 'Atlas', description: '网站名称', configType: 'string', configGroup: 'basic', isPublic: 1, isSensitive: 0 },
  'site_description': { value: '搜索全网资源，一步直达', description: '网站描述', configType: 'string', configGroup: 'basic', isPublic: 1, isSensitive: 0 },
  'enable_registration': { value: '1', description: '是否开放注册', configType: 'boolean', configGroup: 'basic', isPublic: 1, isSensitive: 0 },
  'community_enabled': { value: '1', description: '启用搜索源共享社区功能', configType: 'boolean', configGroup: 'features', isPublic: 1, isSensitive: 0 },
  'max_login_attempts': { value: '5', description: '最大登录尝试次数', configType: 'integer', configGroup: 'security', isPublic: 0, isSensitive: 0, validationRules: '{"min": 3, "max": 10}' },
  'lockout_duration_ms': { value: '900000', description: '账户锁定时长（毫秒，默认15分钟）', configType: 'integer', configGroup: 'security', isPublic: 0, isSensitive: 0, validationRules: '{"min": 60000, "max": 3600000}' },
  'max_verification_attempts': { value: '5', description: '最大验证尝试次数', configType: 'integer', configGroup: 'security', isPublic: 0, isSensitive: 0, validationRules: '{"min": 1, "max": 10}' },
  'password_reset_max_attempts': { value: '5', description: '密码重置最大尝试次数', configType: 'integer', configGroup: 'security', isPublic: 0, isSensitive: 0, validationRules: '{"min": 1, "max": 10}' },
  'password_reset_lockout_duration': { value: '3600000', description: '密码重置锁定持续时间（毫秒，默认1小时）', configType: 'integer', configGroup: 'security', isPublic: 0, isSensitive: 0, validationRules: '{"min": 300000, "max": 86400000}' },
  'email_rate_limit_per_hour': { value: '5', description: '每小时最大发送邮件数', configType: 'integer', configGroup: 'email', isPublic: 0, isSensitive: 0, validationRules: '{"min": 1, "max": 20}' },
  'email_rate_limit_per_day': { value: '20', description: '每天最大发送邮件数', configType: 'integer', configGroup: 'email', isPublic: 0, isSensitive: 0, validationRules: '{"min": 1, "max": 100}' },
  'verification_code_expiry': { value: '900000', description: '验证码过期时间（毫秒，默认15分钟）', configType: 'integer', configGroup: 'email', isPublic: 0, isSensitive: 0, validationRules: '{"min": 60000, "max": 3600000}' },
  'reset_password_code_expiry': { value: '1800000', description: '重置密码验证码过期时间（毫秒，默认30分钟）', configType: 'integer', configGroup: 'email', isPublic: 0, isSensitive: 0, validationRules: '{"min": 600000, "max": 7200000}' },
  'password_reset_log_retention_days': { value: '30', description: '密码重置日志保留天数', configType: 'integer', configGroup: 'cleanup', isPublic: 0, isSensitive: 0, validationRules: '{"min": 7, "max": 90}' },
  'user_actions_retention_days': { value: '90', description: '用户行为日志保留天数', configType: 'integer', configGroup: 'cleanup', isPublic: 0, isSensitive: 0, validationRules: '{"min": 30, "max": 365}' },
  'security_event_retention_days': { value: '90', description: '安全事件保留天数', configType: 'integer', configGroup: 'cleanup', isPublic: 0, isSensitive: 0, validationRules: '{"min": 30, "max": 365}' },
};

async function logConfigChange(
  env: Env,
  configKey: string,
  oldValue: string | null,
  newValue: string,
  changeType: 'create' | 'update' | 'delete' | 'reset',
  userId: string | null,
  username: string | null,
  reason: string | null,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  try {
    const logId = generateId();
    await env.DB.prepare(`
      INSERT INTO config_change_logs (
        id, config_key, old_value, new_value, change_type, 
        changed_by, changed_by_username, change_reason, 
        ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      logId,
      configKey,
      oldValue ?? null,
      newValue,
      changeType,
      userId ?? null,
      username ?? null,
      reason ?? null,
      ipAddress ?? null,
      userAgent ?? null,
      Date.now()
    ).run();
  } catch (err) {
    console.error('Log config change error:', String(err), JSON.stringify(err));
  }
}

function validateConfigValue(value: string, configType: string, validationRules?: string | null): { valid: boolean; error?: string } {
  if (!validationRules) return { valid: true };

  try {
    const rules = JSON.parse(validationRules);

    switch (configType) {
      case 'integer': {
        const num = parseInt(value, 10);
        if (isNaN(num)) return { valid: false, error: '值必须是整数' };
        if (rules.min !== undefined && num < rules.min) {
          return { valid: false, error: `值不能小于 ${rules.min}` };
        }
        if (rules.max !== undefined && num > rules.max) {
          return { valid: false, error: `值不能大于 ${rules.max}` };
        }
        break;
      }
      case 'float': {
        const num = parseFloat(value);
        if (isNaN(num)) return { valid: false, error: '值必须是数字' };
        if (rules.min !== undefined && num < rules.min) {
          return { valid: false, error: `值不能小于 ${rules.min}` };
        }
        if (rules.max !== undefined && num > rules.max) {
          return { valid: false, error: `值不能大于 ${rules.max}` };
        }
        break;
      }
      case 'boolean': {
        if (!['0', '1', 'true', 'false'].includes(value.toLowerCase())) {
          return { valid: false, error: '值必须是布尔值' };
        }
        break;
      }
      case 'string': {
        if (rules.minLength !== undefined && value.length < rules.minLength) {
          return { valid: false, error: `长度不能少于 ${rules.minLength} 个字符` };
        }
        if (rules.maxLength !== undefined && value.length > rules.maxLength) {
          return { valid: false, error: `长度不能超过 ${rules.maxLength} 个字符` };
        }
        if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
          return { valid: false, error: rules.patternMessage || '格式不正确' };
        }
        break;
      }
    }

    return { valid: true };
  } catch {
    return { valid: true };
  }
}

configRoutes.get('/public', async (c) => {
  try {
    const configs = await c.env.DB.prepare(
      `SELECT key, value, config_type FROM system_config WHERE is_public = 1`
    ).all<SystemConfig>();

    const result: Record<string, unknown> = {};
    for (const config of configs.results || []) {
      let parsedValue: unknown = config.value;
      if (config.config_type === 'boolean') {
        parsedValue = config.value === '1' || config.value === 'true';
      } else if (config.config_type === 'integer') {
        parsedValue = parseInt(config.value, 10);
      } else if (config.config_type === 'float') {
        parsedValue = parseFloat(config.value);
      }
      result[config.key] = parsedValue;
    }

    return c.json(success(result));
  } catch (err) {
    console.error('Get public config error:', err);
    return c.json(success({}));
  }
});

configRoutes.get('/all', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const configs = await c.env.DB.prepare(
      'SELECT * FROM system_config ORDER BY config_group, display_order, key'
    ).all<SystemConfig>();

    return c.json(success(configs.results || []));
  } catch (err) {
    console.error('Get all config error:', err);
    return c.json(error('SERVER_ERROR', '获取配置失败'), 500);
  }
});

configRoutes.get('/groups', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const configs = await c.env.DB.prepare(
      'SELECT * FROM system_config ORDER BY config_group, display_order, key'
    ).all<SystemConfig>();

    const groups = await c.env.DB.prepare(
      'SELECT * FROM config_groups ORDER BY display_order'
    ).all<ConfigGroup>();

    const groupedConfigs: Record<string, { info: ConfigGroup | null; configs: SystemConfig[] }> = {};

    for (const config of configs.results || []) {
      const group = config.config_group || 'other';
      if (!groupedConfigs[group]) {
        groupedConfigs[group] = { info: null, configs: [] };
      }
      groupedConfigs[group].configs.push(config);
    }

    for (const group of groups.results || []) {
      if (groupedConfigs[group.name]) {
        groupedConfigs[group.name].info = group;
      }
    }

    return c.json(success({ groups: groups.results || [], groupedConfigs }));
  } catch (err) {
    console.error('Get config groups error:', err);
    return c.json(error('SERVER_ERROR', '获取配置分组失败'), 500);
  }
});

configRoutes.get('/logs', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '50'), 200);
  const configKey = c.req.query('key');
  const changeType = c.req.query('type');

  try {
    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (configKey) {
      whereClause += ' AND config_key = ?';
      params.push(configKey);
    }

    if (changeType) {
      whereClause += ' AND change_type = ?';
      params.push(changeType);
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM config_change_logs ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const logs = await c.env.DB.prepare(`
      SELECT * FROM config_change_logs 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, (page - 1) * pageSize).all<ConfigChangeLog>();

    return c.json(success({
      logs: logs.results || [],
      total: countResult?.total || 0,
      page,
      pageSize,
    }));
  } catch (err) {
    console.error('Get config logs error:', err);
    return c.json(error('SERVER_ERROR', '获取配置日志失败'), 500);
  }
});

configRoutes.get('/export', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const configs = await c.env.DB.prepare(
      'SELECT key, value, description, config_type, config_group, is_public, is_sensitive FROM system_config ORDER BY config_group, key'
    ).all<SystemConfig>();

    const exportData = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      exportedBy: user.username,
      configs: (configs.results || []).map(c => ({
        key: c.key,
        value: c.is_sensitive ? '******' : c.value,
        description: c.description,
        configType: c.config_type,
        configGroup: c.config_group,
        isPublic: c.is_public === 1,
        isSensitive: c.is_sensitive === 1,
      })),
    };

    return c.json(success(exportData));
  } catch (err) {
    console.error('Export config error:', err);
    return c.json(error('SERVER_ERROR', '导出配置失败'), 500);
  }
});

configRoutes.get('/analytics/stats', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  const days = parseInt(c.req.query('days') || '7');
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    const totalEvents = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM analytics_events WHERE created_at > ?'
    ).bind(since).first<{ count: number }>();

    const eventsByType = await c.env.DB.prepare(`
      SELECT event_type, COUNT(*) as count 
      FROM analytics_events 
      WHERE created_at > ? 
      GROUP BY event_type 
      ORDER BY count DESC
    `).bind(since).all();

    const dailyEvents = await c.env.DB.prepare(`
      SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM analytics_events
      WHERE created_at > ?
      GROUP BY date
      ORDER BY date
    `).bind(since).all();

    const uniqueUsers = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM analytics_events 
      WHERE created_at > ? AND user_id IS NOT NULL
    `).bind(since).first<{ count: number }>();

    const uniqueSessions = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT session_id) as count 
      FROM analytics_events 
      WHERE created_at > ? AND session_id IS NOT NULL
    `).bind(since).first<{ count: number }>();

    return c.json(success({
      totalEvents: totalEvents?.count || 0,
      uniqueUsers: uniqueUsers?.count || 0,
      uniqueSessions: uniqueSessions?.count || 0,
      eventsByType: eventsByType.results || [],
      dailyEvents: dailyEvents.results || [],
      period: { days, since },
    }));
  } catch (err) {
    console.error('Get analytics stats error:', err);
    return c.json(error('SERVER_ERROR', '获取统计失败'), 500);
  }
});

configRoutes.get('/email/logs', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '50'), 200);
  const emailType = c.req.query('type');
  const status = c.req.query('status');

  try {
    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (emailType) {
      whereClause += ' AND email_type = ?';
      params.push(emailType);
    }

    if (status) {
      whereClause += ' AND send_status = ?';
      params.push(status);
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM email_send_logs ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const logs = await c.env.DB.prepare(`
      SELECT l.*, u.username
      FROM email_send_logs l
      LEFT JOIN users u ON l.user_id = u.id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, (page - 1) * pageSize).all<EmailSendLog & { username: string | null }>();

    return c.json(success({
      logs: logs.results || [],
      total: countResult?.total || 0,
      page,
      pageSize,
    }));
  } catch (err) {
    console.error('Get email logs error:', err);
    return c.json(error('SERVER_ERROR', '获取日志失败'), 500);
  }
});

configRoutes.post('/import', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsSuperAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要超级管理员权限'), 403);
  }

  try {
    const body = await c.req.json();
    const { configs, overwrite = false } = body;

    if (!Array.isArray(configs)) {
      return c.json(error('VALIDATION_ERROR', '配置数据格式错误'), 400);
    }

    const now = Date.now();
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    const userAgent = c.req.header('User-Agent') || null;
    const results: { key: string; success: boolean; action: string; error?: string }[] = [];

    for (const config of configs) {
      const { key, value, description, configType, configGroup, isPublic, isSensitive } = config;

      if (!key || value === undefined) {
        results.push({ key: key || 'unknown', success: false, action: 'skipped', error: '缺少必要字段' });
        continue;
      }

      if (value === '******') {
        results.push({ key, success: false, action: 'skipped', error: '敏感配置需要手动设置' });
        continue;
      }

      try {
        const existing = await c.env.DB.prepare(
          'SELECT * FROM system_config WHERE key = ?'
        ).bind(key).first<SystemConfig>();

        if (existing && !overwrite) {
          results.push({ key, success: false, action: 'skipped', error: '配置已存在' });
          continue;
        }

        if (existing) {
          await c.env.DB.prepare(`
            UPDATE system_config 
            SET value = ?, description = COALESCE(?, description),
                config_type = COALESCE(?, config_type),
                config_group = COALESCE(?, config_group),
                is_public = COALESCE(?, is_public),
                is_sensitive = COALESCE(?, is_sensitive),
                updated_at = ?
            WHERE key = ?
          `).bind(value, description, configType, configGroup, isPublic ? 1 : 0, isSensitive ? 1 : 0, now, key).run();

          await logConfigChange(
            c.env, key, existing.value, value, 'update',
            user.userId, user.username, '导入配置', ipAddress, userAgent
          );

          results.push({ key, success: true, action: 'updated' });
        } else {
          await c.env.DB.prepare(`
            INSERT INTO system_config (key, value, description, config_type, config_group, is_public, is_sensitive, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(key, value, description || null, configType || 'string', configGroup || 'other', isPublic ? 1 : 0, isSensitive ? 1 : 0, now, now).run();

          await logConfigChange(
            c.env, key, null, value, 'create',
            user.userId, user.username, '导入配置', ipAddress, userAgent
          );

          results.push({ key, success: true, action: 'created' });
        }
      } catch (err) {
        results.push({ key, success: false, action: 'error', error: String(err) });
      }
    }

    if (results.some(r => r.success)) {
      ConfigService.clearCache();
    }

    return c.json(success({
      results,
      created: results.filter(r => r.success && r.action === 'created').length,
      updated: results.filter(r => r.success && r.action === 'updated').length,
      skipped: results.filter(r => !r.success).length,
    }, '配置导入完成'));
  } catch (err) {
    console.error('Import config error:', err);
    return c.json(error('SERVER_ERROR', '导入配置失败'), 500);
  }
});

configRoutes.post('/analytics/events', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const { sessionId, eventType, eventData, referer } = body;

    const id = generateId();
    await c.env.DB.prepare(`
      INSERT INTO analytics_events (
        id, user_id, session_id, event_type, event_data, ip_address, user_agent, referer, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      user.userId,
      sessionId || null,
      eventType,
      JSON.stringify(eventData || {}),
      c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null,
      c.req.header('User-Agent') || null,
      referer || c.req.header('Referer') || null,
      Date.now()
    ).run();

    return c.json(success({ id }, '事件已记录'));
  } catch (err) {
    console.error('Record analytics event error:', err);
    return c.json(error('SERVER_ERROR', '记录事件失败'), 500);
  }
});

configRoutes.put('/batch', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const body = await c.req.json();
    const { configs, changeReason } = body;

    if (!Array.isArray(configs)) {
      return c.json(error('VALIDATION_ERROR', '配置数据格式错误'), 400);
    }

    const now = Date.now();
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    const userAgent = c.req.header('User-Agent') || null;
    const results: { key: string; success: boolean; error?: string }[] = [];

    for (const config of configs) {
      const { key, value } = config;

      if (!key) continue;

      try {
        const existing = await c.env.DB.prepare(
          'SELECT * FROM system_config WHERE key = ?'
        ).bind(key).first<SystemConfig>();

        const validation = validateConfigValue(
          value, 
          existing?.config_type || 'string', 
          existing?.validation_rules
        );

        if (!validation.valid) {
          results.push({ key, success: false, error: validation.error });
          continue;
        }

        if (existing) {
          await c.env.DB.prepare(`
            UPDATE system_config 
            SET value = ?, updated_at = ?
            WHERE key = ?
          `).bind(value, now, key).run();

          await logConfigChange(
            c.env, key, existing.value, value, 'update',
            user.userId, user.username, changeReason ?? null, ipAddress, userAgent
          );
        } else {
          results.push({ key, success: false, error: '配置项不存在' });
          continue;
        }

        results.push({ key, success: true });
      } catch (err) {
        results.push({ key, success: false, error: String(err) });
      }
    }

    if (results.some(r => r.success)) {
      ConfigService.clearCache();
    }

    return c.json(success({ results, updated: results.filter(r => r.success).length }, '配置批量更新完成'));
  } catch (err) {
    console.error('Batch update config error:', err);
    return c.json(error('SERVER_ERROR', '批量更新配置失败'), 500);
  }
});

configRoutes.post('/reset/:key', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsSuperAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要超级管理员权限'), 403);
  }

  const key = c.req.param('key');
  const defaultValue = DEFAULT_CONFIG_VALUES[key];

  if (!defaultValue) {
    return c.json(error('NOT_FOUND', '未找到该配置的默认值'), 404);
  }

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM system_config WHERE key = ?'
    ).bind(key).first<SystemConfig>();

    const now = Date.now();
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    const userAgent = c.req.header('User-Agent') || null;

    await c.env.DB.prepare(`
      UPDATE system_config 
      SET value = ?, updated_at = ?
      WHERE key = ?
    `).bind(defaultValue.value, now, key).run();

    await logConfigChange(
      c.env, key, existing?.value || null, defaultValue.value, 'reset',
      user.userId, user.username, '重置为默认值', ipAddress, userAgent
    );

    ConfigService.clearCache();

    return c.json(success({ key, value: defaultValue.value }, '配置已重置为默认值'));
  } catch (err) {
    console.error('Reset config error:', err);
    return c.json(error('SERVER_ERROR', '重置配置失败'), 500);
  }
});

configRoutes.get('/:key', async (c) => {
  const key = c.req.param('key');

  try {
    const config = await c.env.DB.prepare(
      'SELECT * FROM system_config WHERE key = ?'
    ).bind(key).first<SystemConfig>();

    if (!config) {
      return c.json(error('NOT_FOUND', '配置项不存在'), 404);
    }

    return c.json(success(config));
  } catch (err) {
    console.error('Get config error:', err);
    return c.json(error('SERVER_ERROR', '获取配置失败'), 500);
  }
});

configRoutes.put('/:key', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  const key = c.req.param('key');
  const body = await c.req.json();
  const { value, description, configType, configGroup, isPublic, isSensitive, changeReason } = body;

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM system_config WHERE key = ?'
    ).bind(key).first<SystemConfig>();

    const configTypeToUse = configType || existing?.config_type || 'string';
    const validationRules = existing?.validation_rules || DEFAULT_CONFIG_VALUES[key]?.validationRules || null;

    const validation = validateConfigValue(value, configTypeToUse, validationRules);
    if (!validation.valid) {
      return c.json(error('VALIDATION_ERROR', validation.error || '配置值验证失败'), 400);
    }

    const now = Date.now();
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    const userAgent = c.req.header('User-Agent') || null;

    if (existing) {
      await c.env.DB.prepare(`
        UPDATE system_config 
        SET value = ?, description = COALESCE(?, description), 
            config_type = COALESCE(?, config_type), 
            config_group = COALESCE(?, config_group),
            is_public = COALESCE(?, is_public),
            is_sensitive = COALESCE(?, is_sensitive),
            updated_at = ?
        WHERE key = ?
      `).bind(value, description ?? null, configType ?? null, configGroup ?? null, isPublic === undefined || isPublic === null ? null : (isPublic ? 1 : 0), isSensitive === undefined || isSensitive === null ? null : (isSensitive ? 1 : 0), now, key).run();

      await logConfigChange(
        c.env, key, existing.value, value, 'update',
        user.userId, user.username, changeReason ?? null, ipAddress, userAgent
      );
    } else {
      await c.env.DB.prepare(`
        INSERT INTO system_config (key, value, description, config_type, config_group, is_public, is_sensitive, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(key, value, description || null, configTypeToUse, configGroup || 'other', isPublic ? 1 : 0, isSensitive ? 1 : 0, now, now).run();

      await logConfigChange(
        c.env, key, null, value, 'create',
        user.userId, user.username, changeReason ?? null, ipAddress, userAgent
      );
    }

    ConfigService.clearCache();

    return c.json(success({ key, value }, '配置已更新'));
  } catch (err) {
    console.error('Update config error:', err);
    return c.json(error('SERVER_ERROR', '更新配置失败'), 500);
  }
});

configRoutes.delete('/:key', async (c) => {
  const user = c.get('user');
  
  if (!await checkIsSuperAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要超级管理员权限'), 403);
  }

  const key = c.req.param('key');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM system_config WHERE key = ?'
    ).bind(key).first<SystemConfig>();

    if (!existing) {
      return c.json(error('NOT_FOUND', '配置项不存在'), 404);
    }

    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    const userAgent = c.req.header('User-Agent') || null;

    await logConfigChange(
      c.env, key, existing.value, '', 'delete',
      user.userId, user.username, '删除配置', ipAddress, userAgent
    );

    await c.env.DB.prepare('DELETE FROM system_config WHERE key = ?').bind(key).run();

    ConfigService.clearCache();

    return c.json(success(null, '配置已删除'));
  } catch (err) {
    console.error('Delete config error:', err);
    return c.json(error('SERVER_ERROR', '删除配置失败'), 500);
  }
});
