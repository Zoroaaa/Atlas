import React from 'react';
import { useTranslation } from 'react-i18next';
import { inspectJavCode } from '@codeseek/shared/utils';
import { ShareToCommunityButton, type SharePostData } from '@/components/community/ShareToCommunityButton';
import { libraryApi } from '@/services/api';
import { useToast } from '@/hooks/useNotification';
import { getBackendBaseUrl } from '@/constants';
import type { FavoriteItem } from '@/types';

const proxyImage = (url: string): string =>
  `${getBackendBaseUrl()}/api/jav/proxy-image?url=${encodeURIComponent(url)}`;

const resolveUrl = (relativePath: string, referenceUrl: string): string => {
  try {
    return new URL(relativePath, new URL(referenceUrl)).href;
  } catch {
    return relativePath;
  }
};

/** 收藏里的 actors / tags 可能是 JSON 数组，也可能是逗号分隔 */
function toList(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  } catch {
    // 非 JSON，按逗号分隔
  }
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

/** 是否可以分享到社区：目前仅 JAV 作品（需要的详情结构完整，且本地库能补磁力） */
export function isShareableFavorite(item: FavoriteItem): boolean {
  return Boolean(item.code && !item.code.startsWith('actress:') && inspectJavCode(item.code).recognized);
}

interface FavoriteShareButtonProps {
  item: FavoriteItem;
}

/**
 * 收藏 → 分享到社区。收藏表本身不存磁力等信息，所以点击时先去本地库取回已采集的详情
 * （磁力、导演、制作商、系列等），再与收藏里已有的字段合并；本地库没有时按收藏信息分享。
 */
export const FavoriteShareButton: React.FC<FavoriteShareButtonProps> = ({ item }) => {
  const { t } = useTranslation(['community']);
  const toast = useToast();

  const resolvePostData = async (): Promise<SharePostData | null> => {
    const code = inspectJavCode(item.code ?? '').code || item.code || '';

    let library: Awaited<ReturnType<typeof libraryApi.getJavDetail>> | null = null;
    try {
      library = await libraryApi.getJavDetail(code);
    } catch {
      library = null; // 本地库暂时读不到：不阻塞分享，按收藏信息分享
    }
    const lib = library?.found ? library.detail : undefined;

    const detailUrl = lib?.detailUrl || item.url;
    const cover = lib?.cover || item.cover;
    const actresses = lib?.actresses?.length ? lib.actresses : toList(item.actors);
    const tags = lib?.tags?.length ? lib.tags : toList(item.tags);

    const magnets = lib?.magnets?.length
      ? lib.magnets.map((m) => ({ title: m.name, magnet: m.magnet, size: m.size, date: m.date }))
      : item.magnetLink
        ? [{ title: code, magnet: item.magnetLink }]
        : [];

    if (magnets.length === 0) toast.info(t('community:share.noMagnetsInLibrary'));

    return {
      postType: 'jav',
      title: lib?.title || item.title || code,
      coverImage: cover ? proxyImage(resolveUrl(cover, detailUrl)) : '',
      contentData: JSON.stringify({
        code,
        title: lib?.title || item.title,
        cover,
        releaseDate: lib?.releaseDate || item.releaseDate,
        duration: lib?.duration || item.duration,
        publisher: lib?.publisher || item.publisher,
        director: lib?.director,
        maker: lib?.maker,
        series: lib?.series,
        tags,
        actresses,
        detailUrl,
        magnets,
      }),
    };
  };

  return <ShareToCommunityButton variant="icon" resolvePostData={resolvePostData} />;
};
