/** 通知中心（站内信 / 公告）领域类型 */

export interface NotificationWork {
  code: string;
  title?: string;
  cover?: string;
  date?: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: {
    key?: string;
    name?: string;
    count?: number;
    works?: NotificationWork[];
    /** 社区互动事件 */
    postId?: string;
    postTitle?: string;
    actorName?: string;
    comment?: string;
    /** 站点公告（读时合并） */
    announcementId?: string;
    level?: 'info' | 'success' | 'warning' | 'error';
  };
  /** 收件箱来源：公告为读时合并，不落 notifications 表 */
  source?: 'notification' | 'announcement';
  createdAt: number;
  isRead: boolean;
}

export interface NotificationInboxData {
  items: NotificationItem[];
  total: number;
  unread: number;
  page: number;
  pageSize: number;
}

export interface NotificationPreferenceItem {
  type: string;
  inApp: boolean;
  email: boolean;
}

export interface NotificationPreferencesData {
  preferences: NotificationPreferenceItem[];
  /** 邮箱已脱敏；未验证时不能开启邮件通知 */
  email: { address: string; verified: boolean };
  settings: { emailHideDetails: boolean };
}
