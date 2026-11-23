import type { TFunction } from 'i18next';
import type { NotificationItem } from '@/types';

export interface NotificationView {
  title: string;
  body: string;
  /** 关注对象 key：新作/发售类通知跳关注动态并筛选到该对象 */
  followKey?: string;
  /** 点击后跳转搜索的番号 */
  code?: string;
  /** 社区互动通知对应的帖子 ID（供跳转帖子详情使用） */
  postId?: string;
  /** 反馈回复通知对应的反馈 ID（供跳转「我的反馈」使用） */
  feedbackId?: string;
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
      followKey: item.payload.key,
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
  if (item.type === 'feedback.reply') {
    const statusText = item.payload.status
      ? t(`feedback:my.status.${item.payload.status}`)
      : item.body;
    return {
      title: item.payload.hasReply ? t('notify:feedbackReply') : t('notify:feedbackStatus'),
      body: item.payload.hasReply ? (item.body || '') : statusText,
      feedbackId: item.payload.feedbackId,
    };
  }
  // 发售提醒等后续关注类通知复用同一落地页；带 key 才跳，避免旧数据跳到空筛选
  if (item.type.startsWith('follow.') && item.payload.key) {
    return { title: item.title, body: item.body, followKey: item.payload.key };
  }
  return { title: item.title, body: item.body };
}

/** 番号搜索落地页：必须走 `/main`，`/` 是落地介绍页，不解析 q/tab 参数。 */
export function searchPathForCode(code: string): string {
  return `/main?tab=jav&q=${encodeURIComponent(code)}&sub=code`;
}

/**
 * 通知点击后的落地页。优先级按「最具体 → 最宽泛」：
 * 帖子详情 → 反馈中心 → 关注动态（筛到该关注对象）→ 番号搜索。
 * 公告没有独立页面，返回 null 由调用方留在通知中心看详情。
 */
export function notificationTargetPath(view: NotificationView): string | null {
  if (view.postId) return `/community/post/${encodeURIComponent(view.postId)}`;
  if (view.feedbackId) return '/dashboard/feedback';
  if (view.followKey) return `/dashboard/follow-feed?entity=${encodeURIComponent(view.followKey)}`;
  if (view.code) return searchPathForCode(view.code);
  return null;
}
