import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, ExternalLink, Mail, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, Card, EmptyState, Input, Loading, Switch, Tabs } from '@/components/ui';
import { Pagination } from '@/components/workbench';
import {
  useNotificationInbox, useMarkNotificationsRead, useRemoveNotifications,
  useNotificationPreferences, useNotificationPreferenceActions, useToast,
} from '@/hooks';
import { describeNotification } from '@/components/notifications/notificationView';
import { NotificationDetailModal } from '@/components/notifications/NotificationDetailModal';
import { formatRelativeTime } from '@/utils/relativeTime';
import type { NotificationItem } from '@/types';

const PAGE_SIZE = 20;
/** 设置页里展示的通知类型（follow.release_soon 等发售提醒上线后再加入） */
const PREF_GROUPS = [
  { id: 'follow', types: ['follow.new_work'] },
  { id: 'community', types: ['community.like', 'community.comment', 'community.favorite', 'community.report_resolved'] },
  { id: 'site', types: ['site.announcement'] },
] as const;
const PREF_TYPES = PREF_GROUPS.flatMap((group) => group.types);
const PREF_KEYS: Record<string, { label: string; desc: string }> = {
  'follow.new_work': { label: 'typeNewWork', desc: 'typeNewWorkDesc' },
  'community.like': { label: 'typeCommunityLike', desc: 'typeCommunityLikeDesc' },
  'community.comment': { label: 'typeCommunityComment', desc: 'typeCommunityCommentDesc' },
  'community.favorite': { label: 'typeCommunityFavorite', desc: 'typeCommunityFavoriteDesc' },
  'community.report_resolved': { label: 'typeCommunityReport', desc: 'typeCommunityReportDesc' },
  'site.announcement': { label: 'typeSiteAnnouncement', desc: 'typeSiteAnnouncementDesc' },
};

const Inbox: React.FC = () => {
  const { t, i18n } = useTranslation(['notify', 'search']);
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null);

  const { data, isLoading } = useNotificationInbox(page, PAGE_SIZE, true, unreadOnly);
  const markRead = useMarkNotificationsRead();
  const { remove, clearRead } = useRemoveNotifications();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unread = data?.unread ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => { setPage(1); }, [unreadOnly]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <div className="space-y-4">
      <Card className="p-4 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Tabs
            tabs={[
              { id: 'all', label: t('notify:page.filterAll') },
              { id: 'unread', label: `${t('notify:page.filterUnread')}${unread > 0 ? ` (${unread})` : ''}` },
            ]}
            activeTab={unreadOnly ? 'unread' : 'all'}
            onChange={(id) => setUnreadOnly(id === 'unread')}
          />
          <div className="flex gap-2 sm:ml-auto">
            <Button
              variant="outline" size="sm" leftIcon={<CheckCheck className="w-4 h-4" />}
              disabled={unread === 0} isLoading={markRead.isPending}
              onClick={() => markRead.mutate(undefined)}
            >
              {t('notify:markAllRead')}
            </Button>
            <Button
              variant="outline" size="sm" leftIcon={<Trash2 className="w-4 h-4" />}
              isLoading={clearRead.isPending}
              onClick={() => { if (confirm(t('notify:page.confirmClearRead'))) clearRead.mutate(); }}
            >
              {t('notify:page.clearRead')}
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loading size="lg" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell className="w-12 h-12" />} title={unreadOnly ? t('notify:page.emptyUnread') : t('notify:empty')} />
      ) : (
        <Card className="p-2 sm:p-4 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <ul className="divide-y divide-surface-100 dark:divide-surface-800">
            {items.map((item) => {
              const view = describeNotification(item, t);
              return (
                <li key={item.id} className="flex items-start gap-3 px-2 py-3">
                  <span className={clsx('mt-2 h-2 w-2 shrink-0 rounded-full', item.isRead ? 'bg-transparent' : 'bg-rose-500')} />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setDetailItem(item)}
                      className="block w-full text-left"
                      title={t('notify:detail.open')}
                      aria-label={t('notify:detail.open')}
                    >
                      <p className={clsx('text-sm leading-snug', item.isRead ? 'text-surface-600 dark:text-surface-400' : 'font-semibold text-surface-900 dark:text-surface-100')}>
                        {view.title}
                      </p>
                      {view.body ? <p className="mt-0.5 truncate text-xs text-surface-500">{view.body}</p> : null}
                      <p className="mt-0.5 text-xs text-surface-400">{formatRelativeTime(item.createdAt, i18n.language)}</p>
                    </button>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {view.code ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.isRead) markRead.mutate([item.id]);
                          navigate(`/?q=${encodeURIComponent(view.code!)}&tab=jav&sub=code`);
                        }}
                        className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800"
                        title={t('notify:page.open')} aria-label={t('notify:page.open')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    ) : null}
                    {!item.isRead ? (
                      <button
                        type="button"
                        onClick={() => markRead.mutate([item.id])}
                        className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800"
                        title={t('notify:page.markRead')} aria-label={t('notify:page.markRead')}
                      >
                        <CheckCheck className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => remove.mutate(item.id)}
                      className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      title={t('notify:page.delete')} aria-label={t('notify:page.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={page} totalPages={totalPages} onChange={setPage}
            prevLabel={t('search:favorites.prevPage')} nextLabel={t('search:favorites.nextPage')}
            className="pt-3"
          />
        </Card>
      )}

      <NotificationDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onOpenPost={(postId) => {
          setDetailItem(null);
          navigate(`/community/post/${postId}`);
        }}
        onSearchCode={(code) => {
          setDetailItem(null);
          navigate(`/?q=${encodeURIComponent(code)}&tab=jav&sub=code`);
        }}
      />
    </div>
  );
};

const Preferences: React.FC = () => {
  const { t } = useTranslation(['notify']);
  const toast = useToast();
  const { data, isLoading } = useNotificationPreferences();
  const { setPreference, setSettings, sendTestEmail, sendVerifyCode, verifyEmail } = useNotificationPreferenceActions();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyMaskedEmail, setVerifyMaskedEmail] = useState('');

  if (isLoading || !data) {
    return <div className="flex items-center justify-center py-16"><Loading size="lg" /></div>;
  }

  const { email, settings } = data;
  const prefOf = (type: string) => data.preferences.find((p) => p.type === type);
  const anyEmailOn = PREF_TYPES.some((type) => prefOf(type)?.email);

  const handleSendVerifyCode = async () => {
    const response = await sendVerifyCode.mutateAsync().catch(() => null);
    if (response?.success) {
      setVerifyMaskedEmail(response.data?.maskedEmail ?? '');
      setVerifyOpen(true);
    }
  };

  const handleVerifyEmail = () => {
    if (verifyCode.length !== 6) {
      toast.error(t('notify:prefs.verifyCodePlaceholder'));
      return;
    }
    verifyEmail.mutate(verifyCode, {
      onSuccess: () => {
        setVerifyOpen(false);
        setVerifyCode('');
      },
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-surface-400" />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{t('notify:prefs.emailAddress')}</h3>
            <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">
              {email.address || t('notify:prefs.noEmail')}
              <span className={clsx('ml-2 rounded px-1.5 py-0.5 text-xs font-medium', email.verified
                ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400')}
              >
                {email.verified ? t('notify:prefs.verified') : t('notify:prefs.unverified')}
              </span>
            </p>
            {!email.verified ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-amber-600 dark:text-amber-400">{t('notify:prefs.verifyHint')}</p>
                {!verifyOpen ? (
                  <Button
                    size="sm" variant="outline"
                    isLoading={sendVerifyCode.isPending}
                    onClick={handleSendVerifyCode}
                  >
                    {t('notify:prefs.verifyEmail')}
                  </Button>
                ) : (
                  <div className="max-w-sm space-y-2">
                    <p className="text-xs text-surface-500">
                      {t('notify:prefs.verifyCodeSentTo', { email: verifyMaskedEmail })}
                    </p>
                    <div className="flex items-start gap-2">
                      <Input
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder={t('notify:prefs.verifyCodePlaceholder')}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        isLoading={verifyEmail.isPending}
                        disabled={verifyCode.length !== 6}
                        onClick={handleVerifyEmail}
                      >
                        {t('notify:prefs.verifySubmit')}
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        className="text-primary-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={sendVerifyCode.isPending}
                        onClick={handleSendVerifyCode}
                      >
                        {t('notify:prefs.verifyResend')}
                      </button>
                      <button
                        type="button"
                        className="text-surface-500 hover:underline"
                        onClick={() => { setVerifyOpen(false); setVerifyCode(''); }}
                      >
                        {t('notify:prefs.verifyCancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{t('notify:prefs.channels')}</h3>
        <div className="mt-1 hidden sm:grid grid-cols-[1fr_auto_auto] gap-x-8 text-xs text-surface-500">
          <span />
          <span className="w-11 text-center">{t('notify:prefs.inApp')}</span>
          <span className="w-11 text-center">{t('notify:prefs.email')}</span>
        </div>
        <div className="mt-2 space-y-4">
          {PREF_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
                {t(`notify:prefs.groups.${group.id}`)}
              </p>
              <ul className="divide-y divide-surface-100 dark:divide-surface-800">
                {group.types.map((type) => {
                  const pref = prefOf(type);
                  const meta = PREF_KEYS[type];
                  const label = meta ? t(`notify:prefs.${meta.label}`) : type;
                  const desc = meta ? t(`notify:prefs.${meta.desc}`) : '';
                  return (
                    <li key={type} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] items-center gap-x-8 gap-y-3 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{label}</p>
                        {desc ? <p className="mt-0.5 text-xs text-surface-500">{desc}</p> : null}
                      </div>
                      <div className="flex items-center justify-between sm:justify-center gap-3">
                        <span className="text-xs text-surface-500 sm:hidden">{t('notify:prefs.inApp')}</span>
                        <Switch
                          aria-label={`${label} · ${t('notify:prefs.inApp')}`}
                          checked={pref?.inApp ?? true}
                          disabled={setPreference.isPending}
                          onChange={(value) => setPreference.mutate({ type, inApp: value })}
                        />
                      </div>
                      <div className="flex items-center justify-between sm:justify-center gap-3">
                        <span className="text-xs text-surface-500 sm:hidden">{t('notify:prefs.email')}</span>
                        <Switch
                          aria-label={`${label} · ${t('notify:prefs.email')}`}
                          checked={pref?.email ?? false}
                          disabled={!email.verified || setPreference.isPending}
                          onChange={(value) => setPreference.mutate({ type, email: value })}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-surface-500">{t('notify:prefs.muteHint')}</p>
      </Card>

      <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-surface-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{t('notify:prefs.hideDetails')}</h3>
                <p className="mt-0.5 text-xs text-surface-500">{t('notify:prefs.hideDetailsDesc')}</p>
              </div>
              <Switch
                aria-label={t('notify:prefs.hideDetails')}
                checked={settings.emailHideDetails}
                disabled={setSettings.isPending}
                onChange={(value) => setSettings.mutate(value)}
              />
            </div>
            <p className="mt-3 text-xs text-surface-500">{t('notify:prefs.digestHint')}</p>
            <div className="mt-4">
              <Button
                variant="outline" size="sm" leftIcon={<Send className="w-4 h-4" />}
                disabled={!email.verified || !anyEmailOn}
                isLoading={sendTestEmail.isPending}
                onClick={() => sendTestEmail.mutate()}
              >
                {t('notify:prefs.testEmail')}
              </Button>
              {email.verified && !anyEmailOn ? (
                <span className="ml-3 text-xs text-surface-500">{t('notify:prefs.testNeedsEmailOn')}</span>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

/** 控制台 · 通知：完整收件箱 + 通知设置（站内/邮件、隐私） */
export const NotificationsManager: React.FC = () => {
  const { t } = useTranslation(['notify']);
  const [tab, setTab] = useState<'inbox' | 'prefs'>('inbox');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-amber-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
          <Bell className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">{t('notify:title')}</h2>
          <p className="text-surface-500 dark:text-surface-400">{t('notify:page.subtitle')}</p>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'inbox', label: t('notify:page.tabInbox') },
          { id: 'prefs', label: t('notify:page.tabPrefs') },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as 'inbox' | 'prefs')}
      />

      {tab === 'inbox' ? <Inbox /> : <Preferences />}
    </div>
  );
};
