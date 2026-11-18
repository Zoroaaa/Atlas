/**
 * 图片代理 URL 工具：跨域图片统一走后端 /api/jav/proxy-image 代理。
 */

import { getBackendBaseUrl } from '@/constants';

/** 把原始图片 URL 包装成后端代理地址。 */
export function getProxyImageUrl(url: string): string {
  const baseUrl = getBackendBaseUrl();
  return `${baseUrl}/api/jav/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * 规范化并重新代理图片 URL。
 *
 * 库里可能存有旧后端域名的代理地址，这里先提取原始 URL，再按当前后端域名重写。
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