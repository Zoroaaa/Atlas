/**
 * 体积字符串换算：把 "1.4 GB" / "900 MB" 转成字节数，用于排序。
 *
 * 为什么需要：直接 parseFloat 只会取到数字部分，"1.4 GB" 得到 1.4、"900 MB" 得到 900，
 * 排序结果会把 900MB 排在 1.4GB 前面。单位必须参与计算。
 */

const UNIT_FACTOR: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
};

/** 无法解析时返回 -1，让这类条目稳定排在末尾 */
export function sizeToBytes(size: string | undefined): number {
  if (!size) return -1;
  const match = /([\d.]+)\s*(TB|GB|MB|KB|B)?/i.exec(size.trim());
  if (!match) return -1;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return -1;
  const unit = (match[2] || 'B').toUpperCase();
  return value * (UNIT_FACTOR[unit] ?? 1);
}
