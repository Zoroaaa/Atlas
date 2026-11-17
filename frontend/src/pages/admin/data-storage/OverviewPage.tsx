/**
 * 数据存储 · 统计概览
 *
 * 只保留全局统计：总量、时间窗、分类分布、标签/来源贡献。
 * JAV 详情补全已拆到独立页面，不在这里渲染。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Database, EyeOff, RefreshCw, Tags, Trash2, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dataStorageApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui';
import { useToast } from '@/hooks/useNotification';
import { StatCard, StatsGrid } from '../shared';
import type { DataStorageStats } from '@/types';
import {
  StoragePageHeader,
  TYPE_META,
  TrendBarChart,
  normalizeStats,
  toNumber,
} from './shared';

export const OverviewPage: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const toast = useToast();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const [stats, setStats] = useState<DataStorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [genreSyncing, setGenreSyncing] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      setStats(normalizeStats(await dataStorageApi.getStats()));
    } catch {
      toast.error(t('admin:dataStorage.loadStatsFailed'));
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleCleanup = async () => {
    if (!confirm(t('admin:dataStorage.cleanupConfirm'))) return;
    try {
      const r = await dataStorageApi.cleanup();
      toast.success(t('admin:dataStorage.cleanupToast', { count: r.deleted }));
      loadStats();
    } catch {
      toast.error(t('admin:dataStorage.cleanupFailedToast'));
    }
  };

  const handleGenreSync = async () => {
    setGenreSyncing(true);
    try {
      const r = await dataStorageApi.syncGenreDictionary();
      const detailText = Object.entries(r.sections)
        .map(([section, status]) => `${section}: ${status}`)
        .join(' / ');
      toast.success(t('admin:dataStorage.genreSyncToast', { updated: r.updated, detail: detailText }));
    } catch {
      toast.error(t('admin:dataStorage.genreSyncFailed'));
    } finally {
      setGenreSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <StoragePageHeader
        title={t('admin:dataStorage.page.overviewTitle')}
        description={t('admin:dataStorage.page.overviewDesc')}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleGenreSync} disabled={genreSyncing}>
              <Tags className="w-3.5 h-3.5" />
              <span className="ml-1">{t('admin:dataStorage.genreSync')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
              <RefreshCw className={loading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
              <span className="ml-1">{t('admin:dataStorage.refresh')}</span>
            </Button>
            {isSuperAdmin && stats && stats.hiddenCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleCleanup} className="text-orange-600 dark:text-orange-400">
                <Trash2 className="w-3.5 h-3.5" />
                <span className="ml-1">{t('admin:dataStorage.cleanupHidden')}</span>
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <div className="text-center py-16 text-surface-500">{t('admin:dataStorage.loading')}</div>
      ) : stats ? (
        <div className="space-y-5">
          <StatsGrid>
            <StatCard icon={Database} label={t('admin:dataStorage.stat.total')} value={stats.totalRecords} color="blue" subLabel={t('admin:dataStorage.stat.totalSub', { count: stats.hiddenCount })} />
            <StatCard icon={TrendingUp} label={t('admin:dataStorage.stat.addedToday')} value={stats.addedToday} color="green" subLabel={t('admin:dataStorage.stat.addedTodaySub', { count: stats.addedThisWeek })} />
            <StatCard icon={TrendingUp} label={t('admin:dataStorage.stat.addedThisMonth')} value={stats.addedThisMonth} color="teal" />
            <StatCard icon={CheckCircle2} label={t('admin:dataStorage.stat.detailRate')} value={`${stats.detailCompletionRate}%`} color="purple" subLabel={t('admin:dataStorage.stat.detailRateSub')} />
            <StatCard icon={EyeOff} label={t('admin:dataStorage.stat.hidden')} value={stats.hiddenCount} color="orange" />
          </StatsGrid>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
              <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">{t('admin:dataStorage.trend30d')}</h3>
              <TrendBarChart data={stats.recordsOverTime} />
            </div>

            <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
              <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">{t('admin:dataStorage.distribution')}</h3>
              <div className="space-y-2.5">
                {(stats.byType || []).length === 0 ? (
                  <p className="text-sm text-surface-400 py-4 text-center">{t('admin:dataStorage.empty')}</p>
                ) : (
                  stats.byType.map((item) => {
                    const maxCount = Math.max(...stats.byType.map((b) => b.count), 1);
                    const meta = TYPE_META[item.type];
                    return (
                      <div key={item.type} className="flex items-center gap-3">
                        <div className="w-20 flex items-center gap-1.5 text-xs text-surface-600 dark:text-surface-400">
                          {meta?.icon}
                          <span>{meta ? t(meta.label) : item.type}</span>
                        </div>
                        <div className="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2.5">
                          <div
                            className="bg-gradient-to-r from-rose-400 to-pink-500 h-2.5 rounded-full transition-all"
                            style={{ width: `${(item.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <div className="w-12 text-right text-xs font-semibold text-surface-700 dark:text-surface-300">
                          {toNumber(item.count).toLocaleString()}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
              <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">{t('admin:dataStorage.topTags')}</h3>
              <div className="flex flex-wrap gap-2">
                {(stats.topTags || []).length === 0 ? (
                  <p className="text-sm text-surface-400 py-4 text-center w-full">{t('admin:dataStorage.emptyTags')}</p>
                ) : (
                  stats.topTags.map((tag) => (
                    <span
                      key={tag.tag}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-300"
                      title={t('admin:dataStorage.tagCountTitle', { count: tag.count })}
                    >
                      {tag.tag}
                      <span className="text-surface-400">{tag.count}</span>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
              <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">{t('admin:dataStorage.topSources')}</h3>
              <div className="space-y-2">
                {(stats.topSources || []).length === 0 ? (
                  <p className="text-sm text-surface-400 py-4 text-center">{t('admin:dataStorage.emptySources')}</p>
                ) : (
                  stats.topSources.map((s) => (
                    <div key={s.source_name} className="flex items-center gap-3">
                      <div className="w-28 truncate text-xs text-surface-600 dark:text-surface-400" title={s.source_name}>
                        {s.source_name}
                      </div>
                      <div className="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-blue-400 to-indigo-500 h-2 rounded-full"
                          style={{
                            width: `${(s.count / Math.max(...stats.topSources.map((x) => x.count), 1)) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="w-12 text-right text-xs font-semibold text-surface-700 dark:text-surface-300">
                        {s.count.toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-surface-500">{t('admin:dataStorage.page.loadFailed')}</div>
      )}
    </div>
  );
};
