import type { TFunction } from 'i18next';
import type { NotificationItem } from '@/types';

export interface NotificationView {
  title: string;
  body: string;
  /** 点击后跳转搜索的番号 */
  code?: string;
  /** 社区互动通知对应的帖子 ID（供跳转帖子详情使用） */
  postId?: string;
}

/** 按类型和当前语言渲染通知文案（服务端存的 title/body 只作为兜底和邮件内容） */
export function describeNotification(item: NotificationItem, t: TFunction): NotificationView {
  if (item.type === 'follow.new_work') {
    const name = item.payload.name ?? '';
    const count = item.payload.count ?? 1;
    const works = item.payload.works ?? [];
    return {
      title: t('notify:newWork', { name, count }),
      body: works.slice(0, 3).map((w) => w.code).join('、') + (count > 3 ? '…' : ''),
      code: works[0]?.code,
    };
  }
  if (item.type === 'community.like') {
    return {
      title: t('notify:communityLike', { name: item.payload.actorName ?? '' }),
      body: item.payload.postTitle ?? '',
      postId: item.payload.postId,
    };
  }
  if (item.type === 'community.comment') {
    return {
      title: t('notify:communityComment', { name: item.payload.actorName ?? '' }),
      body: item.payload.comment ?? item.payload.postTitle ?? '',
      postId: item.payload.postId,
    };
  }
  if (item.type === 'community.favorite') {
    return {
      title: t('notify:communityFavorite', { name: item.payload.actorName ?? '' }),
      body: item.payload.postTitle ?? '',
      postId: item.payload.postId,
    };
  }
  if (item.type === 'community.report_resolved') {
    return {
      title: t('notify:communityReport'),
      body: item.body || item.payload.postTitle || '',
      postId: item.payload.postId,
    };
  }
  return { title: item.title, body: item.body, code: undefined };
}
