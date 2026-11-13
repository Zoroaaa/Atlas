import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, ExternalLink, Search, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { Button, Card, Checkbox, EmptyState, Input, Loading, ProxyImage } from '@/components/ui';
import { Chip } from '@/components/workbench';
import { useToast } from '@/hooks/useNotification';
import { useFollows, useFollowActions, followKeys } from '@/hooks';
import { followApi } from '@/services/api';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { formatRelativeTime } from '@/utils/relativeTime';

/** 控制台 · 关注管理：搜索、添加、逐个或批量取消关注 / 静音 */
export const FollowsManager: React.FC = () => {
  const { t, i18n } = useTranslation(['follow']);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useFollows();
  const { follow, unfollow, setNotify } = useFollowActions();

  const [search, setSearch] = useState('');
  const [addName, setAddName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchPending, setBatchPending] = useState(false);

  const follows = useMemo(() => data?.follows ?? [], [data]);
  const limit = data?.limit ?? 100;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? follows.filter((f) => f.name.toLowerCase().includes(q)) : follows;
  }, [follows, search]);

  const allSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.key));

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleAdd = () => {
    const name = addName.trim();
    if (!name) return;
    follow.mutate({ name }, { onSuccess: () => setAddName('') });
  };

  const runBatch = async (action: (key: string) => Promise<unknown>) => {
    setBatchPending(true);
    try {
      const results = await Promise.allSettled(Array.from(selected).map(action));
      if (results.some((r) => r.status === 'rejected')) toast.error(t('follow:operationFailed'));
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: followKeys.all });
    } finally {
      setBatchPending(false);
    }
  };

  const handleBatchUnfollow = () => {
    if (!confirm(t('follow:mgr.confirmUnfollow', { count: selected.size }))) return;
    void runBatch((key) => followApi.unfollow(key));
  };

  const openActress = (name: string) => navigate(`/?q=${encodeURIComponent(name)}&tab=jav&sub=actress`);

  const openEntity = (name: string) => navigate(`/?q=${encodeURIComponent(name)}&tab=jav`);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loading size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-amber-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
          <UserCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">{t('follow:mgr.title')}</h2>
          <p className="text-surface-500 dark:text-surface-400">
            {t('follow:mgr.subtitle', { count: follows.length, limit })}
          </p>
        </div>
      </div>

      <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder={t('follow:mgr.addPlaceholder')}
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              leftIcon={<UserPlus className="w-5 h-5" />}
              fullWidth
            />
          </div>
          <Button onClick={handleAdd} isLoading={follow.isPending} disabled={!addName.trim() || follows.length >= limit}>
            {t('follow:follow')}
          </Button>
        </div>
        {follows.length >= limit ? (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">{t('follow:followLimit')}</p>
        ) : (
          <p className="mt-2 text-xs text-surface-500">{t('follow:mgr.addHint')}</p>
        )}
      </Card>

      {follows.length > 0 ? (
        <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <Input
            placeholder={t('follow:mgr.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-5 h-5" />}
            fullWidth
          />
        </Card>
      ) : null}

      {selected.size > 0 ? (
        <Card className="p-4 border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-900/20 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
              {t('follow:mgr.selected', { count: selected.size })}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline" size="sm" disabled={batchPending}
                leftIcon={<BellOff className="w-4 h-4" />}
                onClick={() => void runBatch((key) => followApi.setNotify(key, false))}
              >
                {t('follow:mgr.batchMute')}
              </Button>
              <Button
                variant="outline" size="sm" disabled={batchPending}
                leftIcon={<Bell className="w-4 h-4" />}
                onClick={() => void runBatch((key) => followApi.setNotify(key, true))}
              >
                {t('follow:mgr.batchUnmute')}
              </Button>
              <Button
                variant="danger" size="sm" disabled={batchPending}
                leftIcon={<Trash2 className="w-4 h-4" />}
                onClick={handleBatchUnfollow}
              >
                {t('follow:mgr.batchUnfollow')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                {t('follow:mgr.cancelSelection')}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {follows.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="w-12 h-12" />}
          title={t('follow:emptyTitle')}
          description={t('follow:emptyHint')}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="w-12 h-12" />} title={t('follow:mgr.noMatch')} />
      ) : (
        <div className="space-y-3">
          <Checkbox
            label={t('follow:mgr.selectAll')}
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((f) => f.key)))}
          />
          {filtered.map((item) => (
            <Card key={item.key} className="p-3 sm:p-4 border-surface-200/50 dark:border-surface-700/50 shadow-md">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(item.key)}
                  onChange={() => toggleSelect(item.key)}
                  aria-label={item.name}
                  className="h-4 w-4 shrink-0 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                />
                {item.avatar ? (
                  <ProxyImage
                    src={getProxyImageUrl(item.avatar)}
                    alt={item.name}
                    className="h-14 w-14 shrink-0 rounded-full object-cover bg-surface-100 dark:bg-surface-800"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-100 text-lg font-semibold text-surface-400 dark:bg-surface-800">
                    {item.name.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => (item.entityType === 'actress' ? openActress(item.name) : openEntity(item.name))}
                      className="block max-w-full truncate text-left text-base font-semibold text-surface-900 hover:text-primary-600 dark:text-surface-100 dark:hover:text-primary-400"
                    >
                      {item.name}
                    </button>
                    {item.entityType !== 'actress' ? (
                      <Chip tone="neutral" size="xs">{t(`follow:entityTypes.${item.entityType}`)}</Chip>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-500">
                    <span>{t('follow:mgr.followedAt', { time: formatRelativeTime(item.createdAt, i18n.language) })}</span>
                    <span>
                      {item.lastCheckedAt
                        ? t('follow:mgr.lastChecked', { time: formatRelativeTime(item.lastCheckedAt, i18n.language) })
                        : t('follow:mgr.neverChecked')}
                    </span>
                    {item.unread > 0 ? (
                      <span className="font-medium text-rose-500">{t('follow:mgr.unread', { count: item.unread })}</span>
                    ) : null}
                    {item.checkFailing ? (
                      <span className="text-amber-600 dark:text-amber-400">{t('follow:checkFailing')}</span>
                    ) : null}
                    {!item.notifyInApp ? <span className="text-surface-400">{t('follow:mgr.muted')}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => (item.entityType === 'actress' ? openActress(item.name) : openEntity(item.name))}
                    className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800"
                    title={t('follow:mgr.viewWorks')}
                    aria-label={t('follow:mgr.viewWorks')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotify.mutate({ key: item.key, notifyInApp: !item.notifyInApp })}
                    className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
                    title={item.notifyInApp ? t('follow:notifyOn') : t('follow:notifyOff')}
                    aria-label={item.notifyInApp ? t('follow:notifyOn') : t('follow:notifyOff')}
                  >
                    {item.notifyInApp ? <Bell className="h-4 w-4 text-primary-500" /> : <BellOff className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => unfollow.mutate(item.key)}
                    className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                    title={t('follow:unfollow')}
                    aria-label={t('follow:unfollow')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
