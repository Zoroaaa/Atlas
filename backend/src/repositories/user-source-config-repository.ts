/**
 * 用户搜索源配置仓储：系统源启停与个性化展示字段的读写。
 *
 * 约束：配置只属于当前用户；无配置行表示启用，只有显式 is_enabled = 0 才是禁用。
 */
import type { UserSearchSourceConfig } from '@/types';
import { generateId } from '@/utils';

export interface UserSourceConfigPatch {
  isEnabled?: boolean;
  customPriority?: number | null;
  customName?: string | null;
  customSubtitle?: string | null;
  customIcon?: string | null;
  notes?: string | null;
}

/** 读取用户全部源配置 */
export async function listUserSourceConfigs(
  db: D1Database,
  userId: string
): Promise<UserSearchSourceConfig[]> {
  const rows = await db
    .prepare('SELECT * FROM user_search_source_configs WHERE user_id = ?')
    .bind(userId)
    .all<UserSearchSourceConfig>();
  return rows.results || [];
}

/** 读取用户对某条源的配置 */
export async function findUserSourceConfig(
  db: D1Database,
  userId: string,
  sourceId: string
): Promise<UserSearchSourceConfig | null> {
  return db
    .prepare('SELECT * FROM user_search_source_configs WHERE user_id = ? AND source_id = ?')
    .bind(userId, sourceId)
    .first<UserSearchSourceConfig>();
}

/** 局部更新或新建用户配置；未传字段保持原值 */
export async function upsertUserSourceConfig(
  db: D1Database,
  userId: string,
  sourceId: string,
  patch: UserSourceConfigPatch,
  now: number
): Promise<void> {
  const existing = await findUserSourceConfig(db, userId, sourceId);

  if (existing) {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.isEnabled !== undefined) {
      sets.push('is_enabled = ?');
      params.push(patch.isEnabled ? 1 : 0);
    }
    if (patch.customPriority !== undefined) {
      sets.push('custom_priority = ?');
      params.push(patch.customPriority);
    }
    if (patch.customName !== undefined) {
      sets.push('custom_name = ?');
      params.push(patch.customName);
    }
    if (patch.customSubtitle !== undefined) {
      sets.push('custom_subtitle = ?');
      params.push(patch.customSubtitle);
    }
    if (patch.customIcon !== undefined) {
      sets.push('custom_icon = ?');
      params.push(patch.customIcon);
    }
    if (patch.notes !== undefined) {
      sets.push('notes = ?');
      params.push(patch.notes);
    }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    params.push(now, userId, sourceId);
    await db
      .prepare(`UPDATE user_search_source_configs SET ${sets.join(', ')} WHERE user_id = ? AND source_id = ?`)
      .bind(...params)
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO user_search_source_configs (
         id, user_id, source_id, is_enabled, custom_priority,
         custom_name, custom_subtitle, custom_icon, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      generateId(),
      userId,
      sourceId,
      patch.isEnabled === false ? 0 : 1,
      patch.customPriority ?? null,
      patch.customName ?? null,
      patch.customSubtitle ?? null,
      patch.customIcon ?? null,
      patch.notes ?? null,
      now,
      now
    )
    .run();
}

/** 删除用户配置；删除后回到「无配置行 = 启用」 */
export async function deleteUserSourceConfig(
  db: D1Database,
  userId: string,
  sourceId: string
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM user_search_source_configs WHERE user_id = ? AND source_id = ?')
    .bind(userId, sourceId)
    .run();
  return Boolean(result.meta.changes);
}

/** 导出用户配置：附带源名称与 URL 模板 */
export async function listUserConfigsWithSource(
  db: D1Database,
  userId: string
): Promise<Array<UserSearchSourceConfig & { source_name: string; url_template: string }>> {
  const rows = await db
    .prepare(
      `SELECT u.*, s.name AS source_name, s.url_template
       FROM user_search_source_configs u
       LEFT JOIN search_sources s ON u.source_id = s.id
       WHERE u.user_id = ?`
    )
    .bind(userId)
    .all<UserSearchSourceConfig & { source_name: string; url_template: string }>();
  return rows.results || [];
}
