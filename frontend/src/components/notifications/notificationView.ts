import type { TFunction } from 'i18next';
import type { NotificationItem } from '@/types';

export interface NotificationView {
  title: string;
  body: string;
  /** 点击后跳转搜索的番号 */
  code?: string;
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
  return { title: item.title, body: item.body, code: undefined };
}
