/**
 * 错误指纹：把「同一处代码抛出的同类错误」聚合到同一个 fp_ 标识。
 *
 * 约束：前端上报（system.ts）与 Worker onError 必须共用本实现，
 * 否则同一错误会因入口不同被拆成两组统计。
 */

/** 取 message 前 200 字 + 堆栈前 5 行 + URL 生成稳定指纹（djb2，无需加密强度） */
export function generateErrorFingerprint(
  errorType: string,
  message: string,
  stack: string | null,
  url: string | null,
): string {
  const stackLines = (stack || '')
    .split('\n')
    .slice(0, 5)
    .join('|')
    .replace(/\s+/g, ' ')
    .trim();
  const raw = `${errorType}::${message.slice(0, 200)}::${stackLines}::${url || ''}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return `fp_${(hash >>> 0).toString(36)}`;
}
