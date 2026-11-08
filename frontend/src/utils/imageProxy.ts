import { getBackendBaseUrl } from '@/constants';

/**
 * 获取代理后的图片 URL
 *
 * 用于处理跨域图片资源，统一走后端 /api/jav/proxy-image 代理
 *
 * @param url - 原始图片 URL
 * @returns 代理后的图片 URL
 */
export function getProxyImageUrl(url: string): string {
  const baseUrl = getBackendBaseUrl();
  return `${baseUrl}/api/jav/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * 规范化并重新代理图片 URL
 *
 * 数据库中可能存有旧域名/旧形态的代理 URL，这里统一提取原始地址后按当前后端域名重新代理。
 */
export function normalizeImageUrl(url: string): string {
  if (!url) return '';

  // 已是代理 URL：提取原始 URL 后重新代理
  const proxyMatch = url.match(/[?&]url=([^&]+)/);
  if (proxyMatch) {
    const originalUrl = decodeURIComponent(proxyMatch[1]);
    return getProxyImageUrl(originalUrl);
  }

  // 相对路径直接返回
  if (url.startsWith('/')) return url;

  // 原始外链：添加代理
  if (url.startsWith('http')) {
    return getProxyImageUrl(url);
  }

  return url;
}