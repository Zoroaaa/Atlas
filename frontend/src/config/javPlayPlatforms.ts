/**
 * JAV 在线播放平台配置。
 * 新增平台只需在此追加一项；URL 模板中的 {code} 会被替换为小写番号（保留连字符）。
 */
export interface JavPlayPlatform {
  /** 稳定标识，用于 React key */
  id: string;
  /** 展示名称 */
  name: string;
  /** 播放地址模板，包含 {code} 占位符 */
  urlTemplate: string;
}

export const JAV_PLAY_PLATFORMS: JavPlayPlatform[] = [
  { id: 'missav', name: 'MissAV', urlTemplate: 'https://missav.ws/ja/{code}' },
  { id: 'jable', name: 'Jable', urlTemplate: 'https://jable.tv/videos/{code}' },
];

/** 按番号生成播放地址；番号为空返回 null，避免生成无效链接 */
export function buildJavPlayUrl(platform: JavPlayPlatform, code: string | undefined): string | null {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) return null;
  return platform.urlTemplate.replace('{code}', normalized);
}
