import React from 'react';
import { ShareToCommunityButton } from '@/components/community/ShareToCommunityButton';
import { getProxyImageUrl } from '@/utils/imageProxy';
import type { FollowFeedItem } from '@/types';

/**
 * 关注动态里的作品 → 分享到社区。
 * 关注表只存列表级信息（番号、标题、封面、发售日、女优），不存磁力等详情，
 * 所以这里分享的是精简信息；需要完整信息请从详情页或收藏分享。
 */
export const FollowWorkShareButton: React.FC<{ item: FollowFeedItem }> = ({ item }) => (
  <ShareToCommunityButton
    variant="icon"
    postData={{
      postType: 'jav',
      title: item.title || item.code,
      coverImage: item.cover ? getProxyImageUrl(item.cover) : '',
      contentData: JSON.stringify({
        code: item.code,
        title: item.title,
        cover: item.cover,
        releaseDate: item.releaseDate,
        actresses: [item.actressName],
        tags: [],
        magnets: [],
        detailUrl: `https://www.javbus.com/${item.code}`,
      }),
    }}
  />
);
