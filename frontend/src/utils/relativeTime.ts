/** 相对时间（"3 小时前"），按当前界面语言格式化；超过 30 天显示日期 */
export function formatRelativeTime(timestamp: number, locale: string): string {
  if (!timestamp) return '';
  const diffMs = timestamp - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const minute = 60 * 1000;
  if (abs < minute) return rtf.format(0, 'minute');
  if (abs < 60 * minute) return rtf.format(Math.round(diffMs / minute), 'minute');
  if (abs < 24 * 60 * minute) return rtf.format(Math.round(diffMs / (60 * minute)), 'hour');
  if (abs < 30 * 24 * 60 * minute) return rtf.format(Math.round(diffMs / (24 * 60 * minute)), 'day');
  return new Date(timestamp).toLocaleDateString(locale);
}
