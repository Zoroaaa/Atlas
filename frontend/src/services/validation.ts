import type { ZodTypeAny } from 'zod';
import { ApiError } from './api/client';

/**
 * 用共享 zod schema 校验请求体。
 *
 * 失败时抛出与后端 validateBody 完全一致的文案（同一个 schema 产出的 issue.message，
 * 使用相同的 "; " 连接规则），保证前端拦截提示与后端返回一致。
 */
export async function parseRequest<T>(schema: ZodTypeAny, data: unknown): Promise<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => issue.message);
    throw new ApiError(
      errors.join('; '),
      400,
      { code: 'VALIDATION_ERROR', details: result.error.issues },
      'VALIDATION_ERROR',
    );
  }
  return result.data as T;
}
