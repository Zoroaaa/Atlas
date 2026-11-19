/**
 * 数据存储 · 封面管理
 *
 * - R2 封面缓存覆盖率（本地库 data_records.cover）
 * - 回填两条通道（分钟加速 / 小时日常）开关与共用批次大小
 * - 最近失败与按类型分布
 *
 * 迁移不修改 data_records.cover，只把封面复制到 R2 并记录账本；
 * 未回填的封面仍由代理在首次访问时懒加载缓存。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  HardDrive,
  Image as ImageIcon,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dataStorageApi } from '@/services/api';
import { Button } from '@/components/ui';
import { useToast } from '@/hooks/useNotification';
import { formatRelativeTime, StatCard, StatsGrid } from '../shared';
import type { CoverStats } from '@/types';
import { StoragePageHeader, TYPE_META, formatBytes } from './shared';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export const CoversPage: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const toast = useToast();

  const [stats, setStats] = useState<CoverStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [batchSize, setBatchSize] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await dataStorageApi.getCoverStats();
      setStats(next);
      setBatchSize(next.batchSize);
    } catch {
      toast.error(t('admin:dataStorage.cover.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  // 只有分钟通道开启时才轮询：它每分钟推进，2 分钟看一次进度才有意义。
  // hourly 是每小时 :05 的兜底通道，开关默认就开着，不能拿它当「正在推进」的依据，
  // 否则关掉分钟推进后页面仍会反复查全库统计。它的进度由页面打开时和手动刷新获取。
  // 120 秒短于后端 /covers/stats 的 5 分钟缓存 TTL，避免每轮轮询都撞上过期边界。
  useEffect(() => {
    if (!stats?.enabled) return;
    const timer = setInterval(async () => {
      try {
        setStats(await dataStorageApi.getCoverStats());
      } catch {
        /* 静默轮询失败不提示，手动刷新可恢复 */
      }
    }, 120000);
    return () => clearInterval(timer);
  }, [stats?.enabled]);

  const handleToggle = async (channel: 'minutely' | 'hourly') => {
    if (!stats) return;
    setSaving(true);
    try {
      const next =
        channel === 'hourly'
          ? await dataStorageApi.updateCoverBackfill({ hourlyEnabled: !stats.hourlyEnabled })
          : await dataStorageApi.updateCoverBackfill({ enabled: !stats.enabled });
      setStats(next);
      setBatchSize(next.batchSize);
      const on = channel === 'hourly' ? next.hourlyEnabled : next.enabled;
      if (channel === 'hourly') {
        toast.success(
          on
            ? t('admin:dataStorage.cover.hourlyEnabledToast')
            : t('admin:dataStorage.cover.hourlyDisabledToast')
        );
      } else {
        toast.success(
          on
            ? t('admin:dataStorage.cover.enabledToast')
            : t('admin:dataStorage.cover.disabledToast')
        );
      }
    } catch {
      toast.error(t('admin:dataStorage.cover.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBatchSize = async () => {
    setSaving(true);
    try {
      const next = await dataStorageApi.updateCoverBackfill({ batchSize });
      setStats(next);
      setBatchSize(next.batchSize);
      toast.success(t('admin:dataStorage.cover.batchSavedToast'));
    } catch {
      toast.error(t('admin:dataStorage.cover.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRequeue = async () => {
    if (!window.confirm(t('admin:dataStorage.cover.requeueConfirm'))) return;
    setSaving(true);
    try {
      const next = await dataStorageApi.requeueCoverFailures();
      setStats(next);
      toast.success(t('admin:dataStorage.cover.requeueSuccess'));
    } catch {
      toast.error(t('admin:dataStorage.cover.requeueFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !stats) {
    return <div className="text-center py-16 text-surface-500">{t('admin:dataStorage.loading')}</div>;
  }

  if (!stats) {
    return <div className="text-center py-16 text-surface-500">{t('admin:dataStorage.cover.loadFailed')}</div>;
  }

  const total = stats.totalWithCover || 0;
  const coverage = total > 0 ? Math.round((stats.ready / total) * 1000) / 10 : 0;
  const problem = stats.failed + stats.missing;

  return (
    <div className="space-y-5">
      <StoragePageHeader
        title={t('admin:dataStorage.page.coversTitle')}
        description={t('admin:dataStorage.page.coversDesc')}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
            <span className="ml-1">{t('admin:dataStorage.refresh')}</span>
          </Button>
        }
      />

      {!stats.r2Ready && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20 p-4 text-sm text-amber-700 dark:text-amber-300">
          {t('admin:dataStorage.cover.r2Missing')}
        </div>
      )}

      <StatsGrid>
        <StatCard icon={Database} label={t('admin:dataStorage.cover.statTotal')} value={total} color="blue" subLabel={t('admin:dataStorage.cover.statTotalSub')} />
        <StatCard icon={CheckCircle2} label={t('admin:dataStorage.cover.statReady')} value={stats.ready} color="green" subLabel={`${coverage}%`} />
        <StatCard icon={Cloud} label={t('admin:dataStorage.cover.statPending')} value={stats.pending} color="purple" subLabel={t('admin:dataStorage.cover.statPendingSub')} />
        <StatCard icon={AlertTriangle} label={t('admin:dataStorage.cover.statProblem')} value={problem} color="orange" subLabel={t('admin:dataStorage.cover.statProblemSub', { count: stats.retryExhausted ?? 0 })} />
        <StatCard icon={HardDrive} label={t('admin:dataStorage.cover.statBytes')} value={formatBytes(stats.readyBytes)} color="teal" />
      </StatsGrid>

      {/* 覆盖率 + 回填开关 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-surface-900 dark:text-surface-100">{t('admin:dataStorage.cover.coverageTitle')}</h3>
            <span className="text-sm font-semibold text-rose-500">{coverage}%</span>
          </div>
          <div className="h-3 rounded-full bg-surface-100 dark:bg-surface-700 overflow-hidden">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-rose-400 to-pink-500 transition-all"
              style={{ width: `${Math.min(100, coverage)}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500">
            <span>{t('admin:dataStorage.cover.readyCount', { count: stats.ready })}</span>
            <span>{t('admin:dataStorage.cover.pendingCount', { count: stats.pending })}</span>
            <span>{t('admin:dataStorage.cover.missingCount', { count: stats.missing })}</span>
            <span>{t('admin:dataStorage.cover.failedCount', { count: stats.failed })}</span>
          </div>
          <p className="text-xs text-surface-400 leading-relaxed">
            {t('admin:dataStorage.cover.lazyHint')}
          </p>
        </div>

        <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5 space-y-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-surface-900 dark:text-surface-100">{t('admin:dataStorage.cover.backfillTitle')}</h3>
            <p className="text-xs text-surface-500 mt-1">{t('admin:dataStorage.cover.backfillDesc')}</p>
          </div>

          {/* 分钟通道：批量导入时手动打开，避免日常每分钟全表扫描候选集 */}
          <div className="rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  {t('admin:dataStorage.cover.channelAccelTitle')}
                </span>
                <span className={clsx(
                  'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                  stats.enabled
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
                )}>
                  {stats.enabled
                    ? t('admin:dataStorage.cover.channelOn')
                    : t('admin:dataStorage.cover.channelOff')}
                </span>
              </div>
              <Button
                size="sm"
                variant={stats.enabled ? 'secondary' : 'outline'}
                onClick={() => handleToggle('minutely')}
                disabled={saving || !stats.r2Ready}
              >
                {stats.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span className="ml-1">
                  {stats.enabled
                    ? t('admin:dataStorage.cover.channelPause')
                    : t('admin:dataStorage.cover.channelEnable')}
                </span>
              </Button>
            </div>
            <p className="text-xs text-surface-400 leading-relaxed mt-1.5">
              {t('admin:dataStorage.cover.channelAccelDesc')}
            </p>
          </div>

          {/* 小时通道：每小时 :05 跟详情补全一起跑，日常兜底 */}
          <div className="rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  {t('admin:dataStorage.cover.channelDailyTitle')}
                </span>
                <span className={clsx(
                  'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                  stats.hourlyEnabled
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
                )}>
                  {stats.hourlyEnabled
                    ? t('admin:dataStorage.cover.channelOn')
                    : t('admin:dataStorage.cover.channelOff')}
                </span>
              </div>
              <Button
                size="sm"
                variant={stats.hourlyEnabled ? 'secondary' : 'outline'}
                onClick={() => handleToggle('hourly')}
                disabled={saving || !stats.r2Ready}
              >
                {stats.hourlyEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span className="ml-1">
                  {stats.hourlyEnabled
                    ? t('admin:dataStorage.cover.channelPause')
                    : t('admin:dataStorage.cover.channelEnable')}
                </span>
              </Button>
            </div>
            <p className="text-xs text-surface-400 leading-relaxed mt-1.5">
              {t('admin:dataStorage.cover.channelDailyDesc')}
            </p>
          </div>

          <p className="text-xs text-surface-400 leading-relaxed">
            {t('admin:dataStorage.cover.channelNote')}
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-surface-400">
              {t('admin:dataStorage.cover.publicBase', { base: stats.publicBase || '—' })}
            </span>
          </div>

          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-xs text-surface-500">
              {t('admin:dataStorage.cover.batchSize')}
              <input
                type="number"
                min={1}
                max={100}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                className="mt-1 block w-24 px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveBatchSize}
              disabled={saving || batchSize === stats.batchSize}
            >
              {t('admin:dataStorage.cover.saveBatch')}
            </Button>
            <span className="text-xs text-surface-400 pb-2">
              {t('admin:dataStorage.cover.batchSizeHint')}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-surface-400 leading-relaxed">{t('admin:dataStorage.cover.requeueHint')}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRequeue}
              disabled={saving || problem === 0}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="ml-1">{t('admin:dataStorage.cover.requeueFailures')}</span>
            </Button>
          </div>

          <details className="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-900/40 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-surface-600 dark:text-surface-300 select-none">
              {t('admin:dataStorage.cover.rulesTitle')}
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-surface-500 leading-relaxed list-disc pl-4">
              <li>{t('admin:dataStorage.cover.ruleKey')}</li>
              <li>{t('admin:dataStorage.cover.ruleNoRewrite')}</li>
              <li>{t('admin:dataStorage.cover.ruleLazy')}</li>
            </ul>
          </details>
        </div>
      </div>

      {/* 按类型分布 */}
      <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
        <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">{t('admin:dataStorage.cover.byTypeTitle')}</h3>
        {stats.byType.length === 0 ? (
          <p className="text-sm text-surface-400 py-4 text-center">{t('admin:dataStorage.empty')}</p>
        ) : (
          <div className="space-y-3">
            {stats.byType.map((item) => {
              const meta = TYPE_META[item.type];
              const rowCoverage = item.total > 0 ? Math.round((item.ready / item.total) * 1000) / 10 : 0;
              return (
                <div key={item.type} className="flex items-center gap-3">
                  <div className="w-24 flex items-center gap-1.5 text-xs text-surface-600 dark:text-surface-400">
                    {meta?.icon}
                    <span>{meta ? t(meta.label) : item.type}</span>
                  </div>
                  <div className="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2.5">
                    <div
                      className="bg-gradient-to-r from-emerald-400 to-teal-500 h-2.5 rounded-full transition-all"
                      style={{ width: `${Math.min(100, rowCoverage)}%` }}
                    />
                  </div>
                  <div className="w-32 text-right text-xs text-surface-500">
                    {item.ready.toLocaleString()} / {item.total.toLocaleString()}（{rowCoverage}%）
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 最近失败 */}
      <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
        <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-3">{t('admin:dataStorage.cover.failuresTitle')}</h3>
        {stats.recentFailures.length === 0 ? (
          <p className="text-xs text-surface-400">{t('admin:dataStorage.cover.noFailures')}</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {stats.recentFailures.map((item, index) => (
              <div key={`${item.url}-${index}`} className="flex items-start justify-between gap-3 p-2 rounded-lg bg-surface-50 dark:bg-surface-900/50 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-surface-700 dark:text-surface-300">{hostOf(item.url)}</span>
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded text-[10px] font-medium',
                      item.status === 'missing'
                        ? 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    )}>
                      {item.status === 'missing'
                        ? t('admin:dataStorage.cover.statusMissing')
                        : t('admin:dataStorage.cover.statusFailed')}
                    </span>
                    <span className="text-surface-400">#{item.attempts}</span>
                  </div>
                  <div className="text-surface-400 truncate mt-0.5">{item.url}</div>
                  {item.lastError && (
                    <div className="text-surface-400 mt-0.5 truncate">{item.lastError}</div>
                  )}
                </div>
                {item.nextRetryAt > 0 && (
                  <span className="text-[10px] text-surface-400 shrink-0">
                    {t('admin:dataStorage.cover.nextRetry', { time: formatRelativeTime(item.nextRetryAt) })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-900/40 p-4 text-xs text-surface-500 leading-relaxed">
        <div className="flex items-center gap-1.5 font-medium text-surface-600 dark:text-surface-300 mb-1">
          <ImageIcon className="w-3.5 h-3.5" />
          {t('admin:dataStorage.cover.noteTitle')}
        </div>
        {t('admin:dataStorage.cover.noteBody')}
      </div>
    </div>
  );
};
