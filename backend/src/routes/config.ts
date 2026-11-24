/**
 * 系统配置路由：公开配置、配置字典读写、变更日志、分析与邮件日志。
 *
 * 约束：写操作需管理员，导入 / 删除 / 重置需超级管理员；每次变更必须写 config_change_logs。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env, SystemConfig, EmailSendLog, ConfigChangeLog, ConfigGroup } from '@/types';
import { success, error, generateId } from '@/utils';
import { authMiddleware, checkIsAdmin, checkIsSuperAdmin } from '@/middleware/auth';
import { ConfigService } from '@/services';
import { getEmailProviderStatuses, sendEmailWithProvider, logEmailSend, type EmailProvider } from '@/services/email-sender';
import { validateBody, schemas } from '@/validation';

export const configRoutes = new Hono<{ Bindings: Env }>();

// /public 端点无需认证（首页未登录用户也要能拿到站点名/描述/功能开关）
configRoutes.get('/public', async (c) => {
  try {
    const configs = await c.env.DB.prepare(
      `SELECT key, value, config_type FROM system_config WHERE is_public = 1 AND is_sensitive = 0`
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

configRoutes.use('*', authMiddleware);

// ── 配置默认值 ─────────────────────────────────────────
// 兼两个用途：重置接口的默认值来源，以及库中 validation_rules 缺失时的兜底
const DEFAULT_CONFIG_VALUES: Record<string, { value: string; description: string; configType: string; configGroup: string; isPublic: number; isSensitive: number; validationRules?: string; options?: string }> = {
  'site_name': { value: 'Atlas', description: '网站名称', configType: 'string', configGroup: 'basic', isPublic: 1, isSensitive: 0 },
  'site_description': { value: '搜索全网资源，一步直达', description: '网站描述', configType: 'string', configGroup: 'basic', isPublic: 1, isSensitive: 0 },
  'enable_registration': { value: '1', description: '是否开放注册', configType: 'boolean', configGroup: 'basic', isPublic: 1, isSensitive: 0 },
  'community_enabled': { value: '1', description: '启用搜索源共享社区功能', configType: 'boolean', configGroup: 'features', isPublic: 1, isSensitive: 0 },
  'cover_backfill_enabled': { value: '0', description: '封面回填分钟通道（加速用，日常关闭）', configType: 'boolean', configGroup: 'features', isPublic: 0, isSensitive: 0 },
  'cover_backfill_hourly_enabled': { value: '1', description: '封面回填小时通道（每小时 :05 日常补齐）', configType: 'boolean', configGroup: 'features', isPublic: 0, isSensitive: 0 },
  'cover_backfill_batch_size': { value: '50', description: '封面回填每轮处理条数（两个通道共用）', configType: 'integer', configGroup: 'features', isPublic: 0, isSensitive: 0, validationRules: '{"min": 1, "max": 100}' },
  'max_login_attempts': { value: '5', description: '最大登录尝试次数', configType: 'integer', configGroup: 'security', isPublic: 0, isSensitive: 0, validationRules: '{"min": 3, "max": 10}' },
  'lockout_duration_ms': { value: '900000', description: '账户锁定时长（毫秒，默认15分钟）', configType: 'integer', configGroup: 'security', isPublic: 0, isSensitive: 0, validationRules: '{"min": 60000, "max": 3600000}' },
  'max_verification_attempts': { value: '5', description: '最大验证尝试次数', configType: 'integer', configGroup: 'security', isPublic: 0, isSensitive: 0, validationRules: '{"min": 1, "max": 10}' },
  'password_reset_max_attempts': { value: '5', description: '密码重置最大尝试次数', configType: 'integer', configGroup: 'security', isPublic: 0, isSensitive: 0, validationRules: '{"min": 1, "max": 10}' },
  'password_reset_lockout_duration': { value: '3600000', description: '密码重置锁定持续时间（毫秒，默认1小时）', configType: 'integer', configGroup: 'security', isPublic: 0, isSensitive: 0, validationRules: '{"min": 300000, "max": 86400000}' },
  'email_rate_limit_per_hour': { value: '5', description: '每小时最大发送邮件数', configType: 'integer', configGroup: 'email', isPublic: 0, isSensitive: 0, validationRules: '{"min": 1, "max": 20}' },
  'email_rate_limit_per_day': { value: '20', description: '每天最大发送邮件数', configType: 'integer', configGroup: 'email', isPublic: 0, isSensitive: 0, validationRules: '{"min": 1, "max": 100}' },
  'email_from_cloudflare': {
    value: '',
    description: 'Cloudflare 发件地址；留空使用全局 DEFAULT_FROM_EMAIL',
    configType: 'string',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"maxLength": 254}',
  },
  'email_from_resend': {
    value: 'noreply@resend.wort.uk',
    description: 'Resend 发件地址；需与 Resend 已验证域名一致，留空回退 DEFAULT_FROM_EMAIL',
    configType: 'string',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"maxLength": 254}',
  },
  'email_from_mailtrap': {
    value: 'noreply@mailtrap.wort.uk',
    description: 'Mailtrap 发件地址；需与 Mailtrap 已验证域名一致，留空回退 DEFAULT_FROM_EMAIL',
    configType: 'string',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"maxLength": 254}',
  },
  'email_from_brevo': {
    value: 'noreply@brevo.wort.uk',
    description: 'Brevo 发件地址；需与 Brevo 已验证域名一致，留空回退 DEFAULT_FROM_EMAIL',
    configType: 'string',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"maxLength": 254}',
  },
  'email_priority_cloudflare': {
    value: '0',
    description: 'Cloudflare 邮件优先级（数值越小越优先；-1 表示停用）',
    configType: 'integer',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"min": -1, "max": 99}',
  },
  'email_priority_resend': {
    value: '-1',
    description: 'Resend 邮件优先级（数值越小越优先；-1 表示停用）',
    configType: 'integer',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"min": -1, "max": 99}',
  },
  'email_priority_mailtrap': {
    value: '-1',
    description: 'Mailtrap 邮件优先级（数值越小越优先；-1 表示停用）',
    configType: 'integer',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"min": -1, "max": 99}',
  },
  'email_priority_brevo': {
    value: '-1',
    description: 'Brevo 邮件优先级（数值越小越优先；-1 表示停用）',
    configType: 'integer',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"min": -1, "max": 99}',
  },
  'email_daily_limit_cloudflare': {
    value: '100',
    description: 'Cloudflare 每日发送上限（0 表示不限额，达到后自动使用下一优先级）',
    configType: 'integer',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"min": 0, "max": 1000000}',
  },
  'email_daily_limit_resend': {
    value: '100',
    description: 'Resend 每日发送上限（0 表示不限额，达到后自动使用下一优先级）',
    configType: 'integer',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"min": 0, "max": 1000000}',
  },
  'email_daily_limit_mailtrap': {
    value: '100',
    description: 'Mailtrap 每日发送上限（0 表示不限额，达到后自动使用下一优先级）',
    configType: 'integer',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"min": 0, "max": 1000000}',
  },
  'email_daily_limit_brevo': {
    value: '100',
    description: 'Brevo 每日发送上限（0 表示不限额，达到后自动使用下一优先级）',
    configType: 'integer',
    configGroup: 'email',
    isPublic: 0,
    isSensitive: 0,
    validationRules: '{"min": 0, "max": 1000000}',
  },
  'verification_code_expiry': { value: '900000', description: '验证码过期时间（毫秒，默认15分钟）', configType: 'integer', configGroup: 'email', isPublic: 0, isSensitive: 0, validationRules: '{"min": 60000, "max": 3600000}' },
  'reset_password_code_expiry': { value: '1800000', description: '重置密码验证码过期时间（毫秒，默认30分钟）', configType: 'integer', configGroup: 'email', isPublic: 0, isSensitive: 0, validationRules: '{"min": 600000, "max": 7200000}' },
  'password_reset_log_retention_days': { value: '30', description: '密码重置日志保留天数', configType: 'integer', configGroup: 'cleanup', isPublic: 0, isSensitive: 0, validationRules: '{"min": 7, "max": 90}' },
  'user_actions_retention_days': { value: '90', description: '用户行为日志保留天数', configType: 'integer', configGroup: 'cleanup', isPublic: 0, isSensitive: 0, validationRules: '{"min": 30, "max": 365}' },
  'security_event_retention_days': { value: '90', description: '安全事件保留天数', configType: 'integer', configGroup: 'cleanup', isPublic: 0, isSensitive: 0, validationRules: '{"min": 30, "max": 365}' },
};

/** 写配置变更审计日志；审计失败只打日志，不能反过来让配置写入失败。 */
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

/** 按 config_type 校验配置值；rules 解析失败时放行，避免历史脏规则把配置锁死。 */
function validateConfigValue(
  value: string,
  configType: string,
  validationRules?: string | null,
  options?: string | null
): { valid: boolean; error?: string } {
  if (configType === 'select') {
    const allowed = parseSelectOptions(options);
    if (allowed.length > 0 && !allowed.includes(value)) {
      return { valid: false, error: `值必须是以下之一：${allowed.join(' / ')}` };
    }
    return { valid: true };
  }
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

/** 解析 system_config.options：既支持 ["a","b"]，也支持 [{value,label}] */
function parseSelectOptions(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'value' in item) return String(item.value);
        return '';
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

configRoutes.get('/all', async (c) => {
  
  if (!await checkIsAdmin(c)) {
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
  
  if (!await checkIsAdmin(c)) {
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
  
  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  // page 必须 ≥1：负数 OFFSET 会让 SQLite 直接报错
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(c.req.query('pageSize') || '50', 10) || 50), 200);
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
  
  if (!await checkIsAdmin(c)) {
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
      // 敏感配置导出时打码；导入侧遇到 ****** 会跳过，避免把掩码写回数据库
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

configRoutes.get('/email/logs', async (c) => {
  
  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(c.req.query('pageSize') || '50', 10) || 50), 200);
  const emailType = c.req.query('type');
  const status = c.req.query('status');
  const provider = c.req.query('provider');

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

    if (provider) {
      whereClause += ' AND provider = ?';
      params.push(provider);
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

configRoutes.get('/email/queue', async (c) => {
  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  const page = Math.max(parseInt(c.req.query('page') || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(1, parseInt(c.req.query('pageSize') || '50', 10) || 50), 200);
  const status = c.req.query('status');
  const type = c.req.query('type');

  try {
    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (status) {
      whereClause += ' AND q.status = ?';
      params.push(status);
    }
    if (type) {
      whereClause += ' AND q.type = ?';
      params.push(type);
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM email_queue q ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    // 队列项的 last_error：skipped 直接给原因，否则取该用户最近一次失败的发送日志
    const rows = await c.env.DB.prepare(`
      SELECT q.*, u.username, u.email AS user_email,
        CASE
          WHEN q.status = 'skipped' THEN '邮箱未验证或通知偏好已关闭'
          ELSE (
            SELECT l.error FROM email_log l
            WHERE l.user_id = q.user_id AND l.status = 'failed'
            ORDER BY l.sent_at DESC LIMIT 1
          )
        END AS last_error
      FROM email_queue q
      LEFT JOIN users u ON q.user_id = u.id
      ${whereClause}
      ORDER BY q.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, (page - 1) * pageSize).all();

    return c.json(success({
      items: rows.results || [],
      total: countResult?.total || 0,
      page,
      pageSize,
    }));
  } catch (err) {
    console.error('Get email queue error:', err);
    return c.json(error('SERVER_ERROR', '获取邮件队列失败'), 500);
  }
});

// ── 管理端邮件测试 ─────────────────────────────────────
const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  cloudflare: 'Cloudflare',
  resend: 'Resend',
  mailtrap: 'Mailtrap',
  brevo: 'Brevo',
};

configRoutes.get('/email/providers', async (c) => {
  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const providers = await getEmailProviderStatuses(c.env);
    return c.json(success({ providers }));
  } catch (err) {
    console.error('Get email providers error:', err);
    return c.json(error('SERVER_ERROR', '获取邮件服务商失败'), 500);
  }
});

configRoutes.post('/email/test', validateBody(schemas.config.testEmail), async (c) => {
  const user = c.get('user');

  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  const { to, provider } = c.get('validatedBody') as z.infer<typeof schemas.config.testEmail>;

  try {
    const target = (await getEmailProviderStatuses(c.env)).find((item) => item.provider === provider);
    if (!target?.configured) {
      return c.json(error('PROVIDER_NOT_CONFIGURED', `${EMAIL_PROVIDER_LABELS[provider]} 未配置凭据，无法发送`), 400);
    }

    const now = Date.now();
    const siteName = c.env.DEFAULT_FROM_NAME || 'Atlas';
    const label = EMAIL_PROVIDER_LABELS[provider];
    const subject = `[${siteName}] 邮件通道测试 - ${label}`;
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:28px 36px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${siteName} 邮件通道测试</h1>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">这是一封来自管理端的测试邮件，收到即表示该服务商通道可用。</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:0;">
            <tr><td style="padding:12px 16px;font-size:14px;color:#6b7280;width:96px;">服务商</td><td style="padding:12px 16px;font-size:14px;color:#111827;font-weight:600;">${label}</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#6b7280;">发件地址</td><td style="padding:12px 16px;font-size:14px;color:#111827;">${target.fromEmail}</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#6b7280;">发送时间</td><td style="padding:12px 16px;font-size:14px;color:#111827;">${new Date(now).toISOString()}</td></tr>
          </table>
          <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">此邮件由管理员手动触发，请勿直接回复。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

    const result = await sendEmailWithProvider(c.env, provider, {
      to,
      subject,
      html,
      text: `这是一封来自管理端的测试邮件，收到即表示 ${label} 通道可用。\n发件地址：${target.fromEmail}\n发送时间：${new Date(now).toISOString()}`,
      tags: [{ name: 'source', value: 'admin-test' }],
    });

    await logEmailSend(c.env.DB, {
      userId: user.userId,
      recipientEmail: to,
      emailType: 'admin_test',
      status: result.ok ? 'sent' : 'failed',
      provider,
      messageId: result.messageId ?? null,
      templateName: 'admin_test',
      subject,
      error: result.ok ? null : (result.error || '测试邮件发送失败'),
      ipAddress: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null,
      createdAt: now,
    });

    if (!result.ok) {
      return c.json(error('EMAIL_SEND_FAILED', result.error || '测试邮件发送失败'), 502);
    }

    return c.json(
      success({ provider, fromEmail: target.fromEmail, to, messageId: result.messageId ?? null }, '测试邮件已发送'),
      200
    );
  } catch (err) {
    console.error('Send test email error:', err);
    return c.json(error('SERVER_ERROR', (err as Error).message || '测试邮件发送失败'), 500);
  }
});

configRoutes.post('/import', validateBody(schemas.config.importConfig), async (c) => {
  const user = c.get('user');
  
  if (!await checkIsSuperAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要超级管理员权限'), 403);
  }

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.config.importConfig>;
    const { configs, overwrite = false } = body;

    const now = Date.now();
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    const userAgent = c.req.header('User-Agent') || null;
    const results: { key: string; success: boolean; action: string; error?: string }[] = [];

    for (const config of configs) {
      const { key, value, description, configType, configGroup, isPublic, isSensitive } = config;

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

    // 进程内配置缓存不清理会继续返回旧值，因此任何写操作成功后都要显式清一次
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

configRoutes.post('/analytics/events', validateBody(schemas.config.recordAnalyticsEvent), async (c) => {
  const user = c.get('user');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.config.recordAnalyticsEvent>;
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

configRoutes.put('/batch', validateBody(schemas.config.batchUpdateConfig), async (c) => {
  const user = c.get('user');
  
  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.config.batchUpdateConfig>;
    const { configs, changeReason } = body;

    const now = Date.now();
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    const userAgent = c.req.header('User-Agent') || null;
    const results: { key: string; success: boolean; error?: string }[] = [];

    for (const config of configs) {
      const { key, value } = config;

      try {
        const existing = await c.env.DB.prepare(
          'SELECT * FROM system_config WHERE key = ?'
        ).bind(key).first<SystemConfig>();

        const validation = validateConfigValue(
          value, 
          existing?.config_type || 'string', 
          existing?.validation_rules,
          existing?.options
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
  
  if (!await checkIsSuperAdmin(c)) {
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

    // 非管理员仅能读取公开且非敏感的配置，避免安全参数泄露
    if (!(await checkIsAdmin(c)) && (config.is_public !== 1 || config.is_sensitive === 1)) {
      return c.json(error('NOT_FOUND', '配置项不存在'), 404);
    }

    return c.json(success(config));
  } catch (err) {
    console.error('Get config error:', err);
    return c.json(error('SERVER_ERROR', '获取配置失败'), 500);
  }
});

configRoutes.put('/:key', validateBody(schemas.config.updateConfig), async (c) => {
  const user = c.get('user');
  
  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  const key = c.req.param('key');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.config.updateConfig>;
    const { value, description, configType, configGroup, isPublic, isSensitive, changeReason } = body;
    const existing = await c.env.DB.prepare(
      'SELECT * FROM system_config WHERE key = ?'
    ).bind(key).first<SystemConfig>();

    const configTypeToUse = configType || existing?.config_type || 'string';
    const validationRules = existing?.validation_rules || DEFAULT_CONFIG_VALUES[key]?.validationRules || null;
    const optionsToUse = existing?.options || DEFAULT_CONFIG_VALUES[key]?.options || null;

    const validation = validateConfigValue(value, configTypeToUse, validationRules, optionsToUse);
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
  
  if (!await checkIsSuperAdmin(c)) {
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
