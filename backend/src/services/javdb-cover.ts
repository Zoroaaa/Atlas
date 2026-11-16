/**
 * JavDB 封面地址归一化
 *
 * JavDB App API 返回的 cover_url 是带账号令牌的私有 CDN：
 *   https://tp.spfcas.com/<token>/covers/ve/xxxx.jpg
 * 该地址响应 Content-Type: application/octet-stream，配合全局 nosniff 会导致 <img> 无法显示。
 * 网页端同一张图使用公网 CDN：
 *   https://c0.jdbstatic.com/covers/ve/xxxx.jpg
 * 这里在入库前统一改写（small_covers 不在 c0 上，保持原样）。
 */
export function normalizeJavdbCover(raw?: string | null): string | null {
  if (!raw) return null;
  let cover = String(raw).trim();
  if (!cover) return null;
  if (cover.startsWith('//')) cover = `https:${cover}`;
  else if (cover.startsWith('/')) cover = `https://javdb.com${cover}`;

  try {
    const parsed = new URL(cover);
    if (parsed.hostname === 'tp.spfcas.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length > 1 && segments[1] === 'covers') {
        parsed.hostname = 'c0.jdbstatic.com';
        parsed.pathname = `/${segments.slice(1).join('/')}`;
        cover = parsed.toString();
      }
    }
  } catch {
    // 非法 URL 保持原样，交由前端兜底
  }

  return cover;
}
