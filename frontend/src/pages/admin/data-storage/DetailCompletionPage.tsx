/**
 * 数据存储 · 详情补全
 *
 * 从原「统计概览」中拆出的 JAV 详情批量补全面板：
 * - 四个字段入口（导演/制作商/发行商/磁力）
 * - 三个状态入口（待补全/暂时失败/源站缺失）
 * - 暂停/继续/停止、进度、最近失败
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Clock, Loader2, Pause, Play, RefreshCw, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dataStorageApi } from '@/services/api';
import { Button } from '@/components/ui';
import { useToast } from '@/hooks/useNotification';
import { formatRelativeTime } from '../shared';
import type {
  JavDetailFailure,
  JavDetailFieldName,
  JavDetailJobFilter,
  JavDetailJobView,
  JavDetailStatus,
} from '@/types';
import {
  DETAIL_FIELD_KEYS,
  DETAIL_STATUS_STYLE,
  SCOPE_FILTERS,
  StoragePageHeader,
  detailStatusLabel,
  errorCodeLabel,
  isFieldFilter,
  mergeJobView,
  normalizeJobView,
  toArray,
  toNumber,
} from './shared';

export const DetailCompletionPage: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const toast = useToast();

  const [jobView, setJobView] = useState<JavDetailJobView | null>(null);
  const [jobStartingFilter, setJobStartingFilter] = useState<JavDetailJobFilter | null>(null);
  const [jobStopping, setJobStopping] = useState(false);
  const [jobPausing, setJobPausing] = useState(false);
  const jobStatusRef = useRef<JavDetailJobView['job']>(null);

  const loadJob = useCallback(async () => {
    try {
      const patch = normalizeJobView(await dataStorageApi.getDetailJob());
      if (!patch) return;
      jobStatusRef.current = patch.job;
      setJobView((prev) => mergeJobView(prev, patch));
    } catch {
      // 轮询失败不打断页面，手动刷新可恢复
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // 运行中每 15 秒只取进度（任务行 + 开关）；完整统计/失败列表在页面打开
    // 与任务结束时各取一次，避免把全表聚合塞进轮询
    const tick = async (full = false) => {
      try {
        const patch = normalizeJobView(
          await dataStorageApi.getDetailJob(full ? {} : { scope: 'progress' })
        );
        if (cancelled || !patch) return;
        const prevStatus = jobStatusRef.current?.status;
        jobStatusRef.current = patch.job;
        setJobView((prev) => mergeJobView(prev, patch));
        if (prevStatus === 'running' && patch.job?.status !== 'running') {
          tick(true);
        }
      } catch {
        /* 忽略轮询错误 */
      }
    };
    tick(true);
    const timer = setInterval(() => {
      if (jobStatusRef.current?.status === 'running') tick();
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const handleStartJob = async (filter: JavDetailJobFilter) => {
    setJobStartingFilter(filter);
    try {
      const patch = normalizeJobView(await dataStorageApi.startDetailJob({ missing: filter }));
      if (!patch) throw new Error('empty response');
      jobStatusRef.current = patch.job;
      setJobView((prev) => mergeJobView(prev, patch));
      toast.success(
        t(
          filter === 'transient'
            ? 'admin:dataStorage.batch.retryTransientStarted'
            : filter === 'absent'
              ? 'admin:dataStorage.batch.retryAbsentStarted'
              : 'admin:dataStorage.batch.startedToast'
        )
      );
    } catch {
      toast.error(t('admin:dataStorage.batch.startFailed'));
    } finally {
      setJobStartingFilter(null);
    }
  };

  const handleStopJob = async () => {
    setJobStopping(true);
    try {
      const patch = normalizeJobView(await dataStorageApi.stopDetailJob());
      if (!patch) throw new Error('empty response');
      jobStatusRef.current = patch.job;
      setJobView((prev) => mergeJobView(prev, patch));
      toast.success(t('admin:dataStorage.batch.stoppedToast'));
    } catch {
      toast.error(t('admin:dataStorage.batch.stopFailed'));
    } finally {
      setJobStopping(false);
    }
  };

  const handlePauseJob = async (paused: boolean) => {
    setJobPausing(true);
    try {
      const patch = normalizeJobView(
        paused ? await dataStorageApi.pauseDetailJob() : await dataStorageApi.resumeDetailJob()
      );
      if (!patch) throw new Error('empty response');
      jobStatusRef.current = patch.job;
      setJobView((prev) => mergeJobView(prev, patch));
      toast.success(
        t(paused ? 'admin:dataStorage.batch.pausedToast' : 'admin:dataStorage.batch.resumedToast')
      );
    } catch {
      toast.error(
        t(paused ? 'admin:dataStorage.batch.pauseFailed' : 'admin:dataStorage.batch.resumeFailed')
      );
    } finally {
      setJobPausing(false);
    }
  };

  return (
    <div className="space-y-5">
      <StoragePageHeader
        title={t('admin:dataStorage.page.detailTitle')}
        description={t('admin:dataStorage.page.detailDesc')}
        actions={
          <Button variant="outline" size="sm" onClick={loadJob}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="ml-1">{t('admin:dataStorage.refresh')}</span>
          </Button>
        }
      />

      <DetailJobPanel
        view={jobView}
        startingFilter={jobStartingFilter}
        stopping={jobStopping}
        pausing={jobPausing}
        onStart={handleStartJob}
        onStop={handleStopJob}
        onPause={handlePauseJob}
      />
    </div>
  );
};

// ─── 子组件：JAV 详情完整度与批量补全 ────────────────────────────────

const DetailJobPanel: React.FC<{
  view: JavDetailJobView | null;
  startingFilter: JavDetailJobFilter | null;
  stopping: boolean;
  pausing: boolean;
  onStart: (filter: JavDetailJobFilter) => void;
  onStop: () => void;
  onPause: (paused: boolean) => void;
}> = ({ view, startingFilter, stopping, pausing, onStart, onStop, onPause }) => {
  const { t } = useTranslation(['admin']);
  const job = view?.job ?? null;
  const stats = view?.stats;
  const failures = toArray<JavDetailFailure>(view?.recentFailures);
  const enabled = view?.enabled !== false;
  const running = job?.status === 'running';
  const starting = startingFilter !== null;

  const jobFilter = job?.filter_missing ?? null;
  const jobFilterLabel = jobFilter
    ? isFieldFilter(jobFilter)
      ? t(`admin:dataStorage.detailField.${jobFilter}`)
      : t(`admin:dataStorage.batch.scope.${jobFilter}`)
    : '';

  // 三态互斥：运行中 / 已暂停 / 已停止
  const paused = running && !enabled;
  const statusText = running
    ? paused
      ? t('admin:dataStorage.batch.paused')
      : t('admin:dataStorage.batch.running')
    : job?.status === 'done'
      ? t('admin:dataStorage.batch.stopped')
      : t('admin:dataStorage.batch.idle');
  const statusClass = running
    ? paused
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400'
    : 'text-surface-500';
  const progress = job && job.total > 0 ? Math.min(100, (job.processed / job.total) * 100) : 0;

  const statItems: Array<{ key: JavDetailStatus; value: number; className: string }> = stats
    ? [
        { key: 'complete', value: toNumber(stats.complete), className: DETAIL_STATUS_STYLE.complete },
        { key: 'partial', value: toNumber(stats.partial), className: DETAIL_STATUS_STYLE.partial },
        { key: 'absent', value: toNumber(stats.absent), className: DETAIL_STATUS_STYLE.absent },
        { key: 'error', value: toNumber(stats.error), className: DETAIL_STATUS_STYLE.error },
        { key: 'pending', value: toNumber(stats.pending), className: DETAIL_STATUS_STYLE.pending },
      ]
    : [];

  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-semibold text-surface-900 dark:text-surface-100">{t('admin:dataStorage.batch.title')}</h3>
          <p className="text-xs text-surface-500 mt-1">{t('admin:dataStorage.batch.desc')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {running && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onPause(!paused)}
                disabled={pausing || stopping}
              >
                {pausing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : paused ? (
                  <Play className="w-3.5 h-3.5" />
                ) : (
                  <Pause className="w-3.5 h-3.5" />
                )}
                <span className="ml-1">
                  {paused ? t('admin:dataStorage.batch.resume') : t('admin:dataStorage.batch.pause')}
                </span>
              </Button>
              <Button size="sm" variant="secondary" onClick={onStop} disabled={stopping || pausing}>
                {stopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                <span className="ml-1">
                  {stopping ? t('admin:dataStorage.batch.stopping') : t('admin:dataStorage.batch.stop')}
                </span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 四个入口：每类缺失各自启动。筛选只决定选哪些记录，抓到后仍然写完整详情 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        {DETAIL_FIELD_KEYS.map((field) => {
          const isStarting = startingFilter === field;
          return (
            <div
              key={field}
              className="rounded-lg border border-surface-200 dark:border-surface-700 p-2.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-surface-700 dark:text-surface-200">
                  {t(`admin:dataStorage.detailField.${field}`)}
                </div>
                <div className="text-[10px] text-surface-400">
                  {t('admin:dataStorage.batch.fieldMissingCount', {
                    count: toNumber(stats?.missing?.[field]),
                  })}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onStart(field)}
                disabled={starting || stopping || running || !enabled}
                title={
                  !enabled
                    ? t('admin:dataStorage.batch.disabledHint')
                    : running
                      ? t('admin:dataStorage.batch.runningHint')
                      : t('admin:dataStorage.batch.fillThisHint')
                }
              >
                {isStarting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span className="ml-1">
                  {isStarting
                    ? t('admin:dataStorage.batch.starting')
                    : t('admin:dataStorage.batch.fillThis')}
                </span>
              </Button>
            </div>
          );
        })}
      </div>

      {/* 状态范围入口：字段入口排除自动重试中的记录，这两类与待补全在这里单独启动 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {SCOPE_FILTERS.map((filter) => {
          const isStarting = startingFilter === filter;
          const count =
            filter === 'pending'
              ? stats?.pending
              : filter === 'transient'
                ? stats?.error
                : stats?.absent;
          return (
            <div
              key={filter}
              className="rounded-lg border border-surface-200 dark:border-surface-700 p-2.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-surface-700 dark:text-surface-200">
                  {t(`admin:dataStorage.batch.scope.${filter}`)}
                </div>
                <div className="text-[10px] text-surface-400">
                  {t('admin:dataStorage.batch.scopeCount', { count: toNumber(count) })}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onStart(filter)}
                disabled={starting || stopping || running || !enabled}
                title={
                  !enabled
                    ? t('admin:dataStorage.batch.disabledHint')
                    : running
                      ? t('admin:dataStorage.batch.runningHint')
                      : t(`admin:dataStorage.batch.scopeHint.${filter}`)
                }
              >
                {isStarting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span className="ml-1">
                  {isStarting
                    ? t('admin:dataStorage.batch.starting')
                    : t('admin:dataStorage.batch.startScope')}
                </span>
              </Button>
            </div>
          );
        })}
      </div>

      <details className="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-900/40 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-surface-600 dark:text-surface-300 select-none">
          {t('admin:dataStorage.batch.explainTitle')}
        </summary>
        <ul className="mt-2 space-y-1.5 text-xs text-surface-500 leading-relaxed list-disc pl-4">
          <li>{t('admin:dataStorage.batch.explainAuto')}</li>
          <li>{t('admin:dataStorage.batch.explainManual')}</li>
          <li>{t('admin:dataStorage.batch.explainWrite')}</li>
          <li>{t('admin:dataStorage.batch.explainBackoff')}</li>
        </ul>
      </details>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {statItems.map((item) => (
          <div key={item.key} className="rounded-lg border border-surface-200 dark:border-surface-700 p-2.5">
            <div className={clsx('inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium', item.className)}>
              {detailStatusLabel(t, item.key)}
            </div>
            <div className="mt-1 text-lg font-semibold text-surface-900 dark:text-surface-100">{toNumber(item.value).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {stats && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500">
          <span>{t('admin:dataStorage.missingFieldsLabel')}</span>
          {DETAIL_FIELD_KEYS.map((field) => (
            <span key={field}>
              {t(`admin:dataStorage.detailField.${field}`)}
              <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">{toNumber(stats.missing?.[field])}</span>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-lg bg-surface-50 dark:bg-surface-900/50 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className={clsx('flex items-center gap-1.5 font-medium', statusClass)}>
            <Clock className="w-3.5 h-3.5" />
            {statusText}
          </span>
          <span className="text-surface-500">
            {job ? t('admin:dataStorage.batch.progress', { processed: job.processed, total: job.total }) : ''}
          </span>
        </div>
        {jobFilter && (
          <div className="text-[11px] text-surface-500">
            {t('admin:dataStorage.batch.runningScope', { field: jobFilterLabel })}
          </div>
        )}
        <div className="h-2 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-rose-400 to-pink-500 transition-all"
            style={{ width: `${job ? Math.max(progress, job.processed > 0 ? 2 : 0) : 0}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            { label: t('admin:dataStorage.batch.completed'), value: job?.completed ?? 0 },
            { label: t('admin:dataStorage.batch.partial'), value: job?.partial ?? 0 },
            { label: t('admin:dataStorage.batch.absent'), value: job?.absent ?? 0 },
            { label: t('admin:dataStorage.batch.transientFailed'), value: job?.transient_failed ?? 0 },
            { label: t('admin:dataStorage.batch.pending'), value: view?.pending ?? 0 },
            { label: t('admin:dataStorage.batch.due'), value: view?.due ?? 0 },
            { label: t('admin:dataStorage.batch.scheduled'), value: view?.scheduled ?? 0 },
            { label: t('admin:dataStorage.batch.skipped'), value: job?.skipped ?? 0 },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-surface-400">{item.label}</span>
              <span className="font-semibold text-surface-700 dark:text-surface-300">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-surface-600 dark:text-surface-300 mb-1.5">
          {t('admin:dataStorage.batch.recentFailures')}
        </h4>
        {failures.length === 0 ? (
          <p className="text-xs text-surface-400">{t('admin:dataStorage.batch.noFailures')}</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {failures.map((item) => {
              const missing = toArray<JavDetailFieldName>(item.missing);
              return (
                <div key={item.id} className="flex items-start justify-between gap-2 p-2 rounded bg-surface-50 dark:bg-surface-900/50 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-surface-700 dark:text-surface-300">{item.code || item.id}</span>
                      <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', DETAIL_STATUS_STYLE[item.status] ?? DETAIL_STATUS_STYLE.pending)}>
                        {detailStatusLabel(t, item.status)}
                      </span>
                      {item.retryExhausted && (
                        <span className="text-[10px] text-surface-400">{t('admin:dataStorage.detailNoRetry')}</span>
                      )}
                    </div>
                    <div className="text-surface-400 mt-0.5 truncate">
                      {missing.length > 0 && `${t('admin:dataStorage.missingFieldsLabel')}${missing.map((f) => t(`admin:dataStorage.detailField.${f}`)).join(' / ')}`}
                      {item.lastError && ` · ${errorCodeLabel(t, item.lastError)}`}
                    </div>
                  </div>
                  {item.nextRetryAt > 0 && (
                    <span className="text-[10px] text-surface-400 shrink-0">
                      {t('admin:dataStorage.batch.nextRetry', { time: formatRelativeTime(item.nextRetryAt) })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
