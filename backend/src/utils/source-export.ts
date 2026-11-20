/**
 * 搜索源导出转义工具：CSV 公式注入防护与 OPML/XML 属性转义。
 *
 * 约束：导出内容包含用户输入，任何字段都必须先经过对应转义再拼入文件。
 */

/** Excel 会执行以这些字符开头的单元格，导出前必须前置单引号阻断公式 */
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** CSV 单元格：先阻断公式注入，再按 RFC 4180 转义引号 */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (CSV_FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** OPML 属性值：名称/URL 来自用户输入，必须转义 XML 实体 */
export function xmlAttr(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
