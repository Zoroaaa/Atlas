/** 移动端首页与发现页共享的分区标识，避免 string 字面量在路由与组件间各写一份。 */
export const DISCOVER_SECTIONS = ['recommend', 'rankings', 'top250', 'genres', 'actresses'] as const;

export type DiscoverSection = (typeof DISCOVER_SECTIONS)[number];

export const isDiscoverSection = (value: string | null): value is DiscoverSection =>
  value !== null && (DISCOVER_SECTIONS as readonly string[]).includes(value);
