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
  /** 该平台要求路径以 / 结尾（查询参数、hash 之前），生成时保证有且只有一个 */
  trailingSlash?: boolean;
}

export const JAV_PLAY_PLATFORMS: JavPlayPlatform[] = [
  { id: 'missav', name: 'MissAV', urlTemplate: 'https://missav.ws/ja/{code}' },
  { id: 'jable', name: 'Jable', urlTemplate: 'https://jable.tv/videos/{code}', trailingSlash: true },
];

/** 在查询参数/hash 之前补齐路径结尾的 /，并折叠多余的斜杠 */
function withTrailingSlash(url: string): string {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex) : '';
  const path = (queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash).replace(/\/+$/, '');
  return `${path}/${query}${hash}`;
}

/** 按番号生成播放地址；番号为空返回 null，避免生成无效链接 */
export function buildJavPlayUrl(platform: JavPlayPlatform, code: string | undefined): string | null {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) return null;
  const url = platform.urlTemplate.replace('{code}', normalized);
  return platform.trailingSlash ? withTrailingSlash(url) : url;
}
