import type { FollowEntityType } from '@/types';

/**
 * 生成后端使用的关注对象 key。
 *
 * - 女优：直接使用 JavBus star slug（不含冒号）
 * - 实体：`<类型>:<JavBus 列表页路径去掉开头斜杠>`，如 director:director/o7、tag:genre/2a
 *
 * 后端 backend/src/services/follow-service.ts 的 entityTypeFromKey / entityPathFromKey
 * 使用完全相同的约定；改动时必须两边同步。
 */
export function buildWatchKey(
  entityType: FollowEntityType,
  followKey?: string,
  entityPath?: string
): string | undefined {
  if (entityType === 'actress') return followKey?.trim() || undefined;
  const path = entityPath?.trim().replace(/^\/+/, '');
  return path ? `${entityType}:${path}` : undefined;
}
