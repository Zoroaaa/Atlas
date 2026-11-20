import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import type { NotificationItem } from '@/types';
import { describeNotification, notificationTargetPath } from '../notificationView';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}|${JSON.stringify(options)}` : key) as unknown as TFunction;

const base: NotificationItem = {
  id: 'n1',
  type: 'follow.new_work',
  title: '标题',
  body: '正文',
  payload: {},
  createdAt: 0,
  isRead: false,
};

describe('describeNotification', () => {
  it('新作通知带出关注对象 key，用于跳关注动态', () => {
    const view = describeNotification({
      ...base,
      payload: { key: 'actress:abc', name: '葵', count: 2, works: [{ code: 'ABC-001' }, { code: 'ABC-002' }] },
    }, t);

    expect(view.followKey).toBe('actress:abc');
    expect(view.code).toBe('ABC-001');
    expect(view.body).toBe('ABC-001、ABC-002');
  });

  it('社区通知带帖子 ID', () => {
    const view = describeNotification({
      ...base,
      type: 'community.comment',
      payload: { postId: 'p1', actorName: '甲', comment: '不错' },
    }, t);

    expect(view.postId).toBe('p1');
    expect(view.code).toBeUndefined();
  });
});

describe('notificationTargetPath', () => {
  it('新作通知优先跳关注动态而不是搜番号', () => {
    expect(notificationTargetPath({ title: '', body: '', followKey: 'actress:abc', code: 'ABC-001' }))
      .toBe('/dashboard/follow-feed?entity=actress%3Aabc');
  });

  it('社区通知跳帖子详情', () => {
    expect(notificationTargetPath({ title: '', body: '', postId: 'p 1' })).toBe('/community/post/p%201');
  });

  it('番号搜索走 /main（/ 不解析 q 参数）', () => {
    expect(notificationTargetPath({ title: '', body: '', code: 'ABC-001' }))
      .toBe('/main?tab=jav&q=ABC-001&sub=code');
  });

  it('公告无独立页面时返回 null', () => {
    expect(notificationTargetPath({ title: '', body: '' })).toBeNull();
  });
});
