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