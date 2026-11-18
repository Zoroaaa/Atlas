/**
 * 请求校验入口：复用 @codeseek/shared 的 zod schema 做前端预校验。
 *
 * 约束：错误文案必须与后端 validateBody 保持一致，避免同一规则两套提示。
 */

import type { ZodTypeAny } from 'zod';
import { ApiError } from './api/client';

/**
 * 用共享 zod schema 校验请求体，返回收窄后的数据。
 *
 * @throws {ApiError} 400，message 为各 issue.message 用 "; " 拼接，与后端 validateBody 一致
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
