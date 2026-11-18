/**
 * SQL 片段辅助：LIKE 通配符转义。
 *
 * 约束：配合 `ESCAPE '\'` 使用；只处理模式字符串，不改变绑定参数方式。
 */

/**
 * 转义用户输入中的 LIKE 通配符。
 * 不转义会让 `%` / `_` 从字面量变成通配符，放大匹配范围并让索引失效。
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
