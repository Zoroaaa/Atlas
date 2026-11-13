import React, { useState, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import {
  Database,
  TrendingUp,
  CheckCircle2,
  EyeOff,
  Search,
  Trash2,
  ExternalLink,
  Film,
  Clapperboard,
  BookOpen,
  BookText,
  User,
  Magnet,
  Link2,
  RefreshCw,
  Copy,
  Check,
  Tags,
  Play,
  Square,
  Pause,
  Loader2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { dataStorageApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Button, ProxyImage } from '@/components/ui';
import { useToast } from '@/hooks/useNotification';
import { getProxyImageUrl } from '@/utils';
import { Pagination, StatCard, StatsGrid, formatRelativeTime } from './shared';
import { useTranslation } from 'react-i18next';
import type {
  DataRecord,
  DataRecordDetail,
  DataRecordSource,
  DataStorageStats,
  DataRecordType,
  JavDetailFailure,
  JavDetailFieldName,
  JavDetailJob,
  JavDetailJobView,
  JavDetailStats,
  JavDetailStatus,
} from '@/types';

// ─── 类型元数据 ──────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  jav: { label: 'admin:dataStorage.type.jav', icon: <Film className="w-3.5 h-3.5" />, color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  anime: { label: 'admin:dataStorage.type.anime', icon: <Clapperboard className="w-3.5 h-3.5" />, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  movie: { label: 'admin:dataStorage.type.movie', icon: <Film className="w-3.5 h-3.5" />, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  manga: { label: 'admin:dataStorage.type.manga', icon: <BookOpen className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  novel: { label: 'admin:dataStorage.type.novel', icon: <BookText className="w-3.5 h-3.5" />, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  actress: { label: 'admin:dataStorage.type.actress', icon: <User className="w-3.5 h-3.5" />, color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
};

const TYPE_FILTERS: Array<{ key: '' | DataRecordType; label: string }> = [
  { key: '', label: 'admin:dataStorage.filter.all' },
  { key: 'jav', label: 'admin:dataStorage.type.jav' },
  { key: 'anime', label: 'admin:dataStorage.type.anime' },
  { key: 'movie', label: 'admin:dataStorage.type.movie' },
  { key: 'manga', label: 'admin:dataStorage.type.manga' },
  { key: 'novel', label: 'admin:dataStorage.type.novel' },
  { key: 'actress', label: 'admin:dataStorage.type.actress' },
];

const DETAIL_FIELD_KEYS: JavDetailFieldName[] = ['director', 'maker', 'publisher', 'magnets'];

const DETAIL_STATUS_STYLE: Record<JavDetailStatus, string> = {
  complete: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  absent: 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

function detailStatusLabel(t: (key: string) => string, status: JavDetailStatus | null | undefined): string {
  return t(`admin:dataStorage.detailStatus.${status || 'pending'}`);
}

/** 历史版本把错误文案直接写进了 last_error，展示时兼容成稳定错误码 */
const LEGACY_ERROR_CODES: Record<string, string> = {
  '磁力接口暂时不可用': 'MAGNET_FETCH_FAILED',
};

function errorCodeLabel(t: (key: string) => string, code: string | null | undefined): string {
  if (!code) return '';
  const normalized = LEGACY_ERROR_CODES[code] ?? code;
  const key = `admin:dataStorage.errorCode.${normalized}`;
  const label = t(key);
  return label === key ? normalized : label;
}

// ─── 接口响应容错 ────────────────────────────────────────────────────
// 生产可能先部署前端、后执行迁移/部署后端，接口会返回旧结构、null 或空响应。
// 所有展示数据在进入渲染前统一归一化，避免对缺失字段直接做 .length / .map / toLocaleString。

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const EMPTY_JAV_DETAIL_STATS: JavDetailStats = {
  total: 0,
  complete: 0,
  partial: 0,
  absent: 0,
  error: 0,
  pending: 0,
  missing: { director: 0, maker: 0, publisher: 0, magnets: 0 },
};

function normalizeDetailStats(value: unknown): JavDetailStats | null {
  const raw = toObject(value);
  if (!raw) return null;
  const missing = toObject(raw.missing);
  return {
    total: toNumber(raw.total),
    complete: toNumber(raw.complete),
    partial: toNumber(raw.partial),
    absent: toNumber(raw.absent),
    error: toNumber(raw.error),
    pending: toNumber(raw.pending),
    missing: {
      director: toNumber(missing?.director),
      maker: toNumber(missing?.maker),
      publisher: toNumber(missing?.publisher),
      magnets: toNumber(missing?.magnets),
    },
  };
}

function normalizeStats(value: unknown): DataStorageStats | null {
  const raw = toObject(value);
  if (!raw) return null;
  return {
    totalRecords: toNumber(raw.totalRecords),
    hiddenCount: toNumber(raw.hiddenCount),
    addedToday: toNumber(raw.addedToday),
    addedThisWeek: toNumber(raw.addedThisWeek),
    addedThisMonth: toNumber(raw.addedThisMonth),
    detailCompletionRate: toNumber(raw.detailCompletionRate),
    byType: toArray<{ type?: unknown; count?: unknown }>(raw.byType).map((item) => ({
      type: String(item?.type ?? ''),
      count: toNumber(item?.count),
    })),
    recordsOverTime: toArray<{ date?: unknown; count?: unknown }>(raw.recordsOverTime).map((item) => ({
      date: String(item?.date ?? ''),
      count: toNumber(item?.count),
    })),
    topTags: toArray<{ tag?: unknown; count?: unknown }>(raw.topTags).map((item) => ({
      tag: String(item?.tag ?? ''),
      count: toNumber(item?.count),
    })),
    topSources: toArray<{ source_name?: unknown; count?: unknown }>(raw.topSources).map((item) => ({
      source_name: String(item?.source_name ?? ''),
      count: toNumber(item?.count),
    })),
    javDetail: normalizeDetailStats(raw.javDetail) ?? undefined,
  };
}

function normalizeJob(value: unknown): JavDetailJob | null {
  const raw = toObject(value);
  if (!raw) return null;
  return {
    id: String(raw.id ?? ''),
    status: raw.status === 'running' ? 'running' : 'done',
    batch_size: toNumber(raw.batch_size),
    total: toNumber(raw.total),
    processed: toNumber(raw.processed),
    completed: toNumber(raw.completed),
    partial: toNumber(raw.partial),
    absent: toNumber(raw.absent),
    transient_failed: toNumber(raw.transient_failed),
    skipped: toNumber(raw.skipped),
    last_error: typeof raw.last_error === 'string' ? raw.last_error : null,
    created_by: typeof raw.created_by === 'string' ? raw.created_by : null,
    // 旧后端不返回该字段，按「不限」处理
    filter_missing: DETAIL_FIELD_KEYS.includes(raw.filter_missing as JavDetailFieldName)
      ? (raw.filter_missing as JavDetailFieldName)
      : null,
    created_at: toNumber(raw.created_at),
    updated_at: toNumber(raw.updated_at),
    finished_at: raw.finished_at == null ? null : toNumber(raw.finished_at),
  };
}

function normalizeFailure(value: unknown): JavDetailFailure | null {
  const raw = toObject(value);
  if (!raw) return null;
  const status = String(raw.status ?? 'pending') as JavDetailStatus;
  return {
    id: String(raw.id ?? ''),
    code: typeof raw.code === 'string' ? raw.code : null,
    title: typeof raw.title === 'string' ? raw.title : '',
    status: status in DETAIL_STATUS_STYLE ? status : 'pending',
    missing: toArray<JavDetailFieldName>(raw.missing),
    lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
    nextRetryAt: toNumber(raw.nextRetryAt),
    attempts: toNumber(raw.attempts),
    transientFailures: toNumber(raw.transientFailures),
    retryExhausted: raw.retryExhausted === true,
  };
}

interface JobViewPatch {
  job: JavDetailJob | null;
  pending: number;
  due: number;
  scheduled: number;
  /** 旧后端不返回该字段，缺省按启用处理 */
  enabled?: boolean;
  stats?: JavDetailStats | null;
  recentFailures?: JavDetailFailure[];
}

function normalizeJobView(value: unknown): JobViewPatch | null {
  const raw = toObject(value);
  if (!raw) return null;
  const failures = Array.isArray(raw.recentFailures)
    ? raw.recentFailures
        .map(normalizeFailure)
        .filter((item): item is JavDetailFailure => item !== null)
    : undefined;
  return {
    job: normalizeJob(raw.job),
    pending: toNumber(raw.pending),
    due: toNumber(raw.due),
    scheduled: toNumber(raw.scheduled),
    enabled: raw.enabled === false ? false : true,
    stats: normalizeDetailStats(raw.stats),
    recentFailures: failures,
  };
}

function mergeJobView(prev: JavDetailJobView | null, patch: JobViewPatch | null): JavDetailJobView | null {
  if (!patch) return prev;
  return {
    job: patch.job,
    pending: patch.pending,
    due: patch.due,
    scheduled: patch.scheduled,
    enabled: patch.enabled ?? prev?.enabled ?? true,
    // 启动接口只返回 progress 字段：缺失时沿用上一次 GET 的统计/失败列表
    stats: patch.stats ?? prev?.stats ?? EMPTY_JAV_DETAIL_STATS,
    recentFailures: patch.recentFailures ?? prev?.recentFailures ?? [],
  };
}

// ─── 主组件 ──────────────────────────────────────────────────────────

export const DataStorageTab: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const [activeView, setActiveView] = useState<'overview' | 'records'>('overview');
  const [stats, setStats] = useState<DataStorageStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [records, setRecords] = useState<DataRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'' | DataRecordType>('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'hidden' | ''>('');
  const [search, setSearch] = useState('');
  const [detailFilter, setDetailFilter] = useState<'' | 'complete' | 'incomplete' | 'error'>('');
  const [missingFilters, setMissingFilters] = useState<JavDetailFieldName[]>([]);
  const [retryFilter, setRetryFilter] = useState<'' | 'yes' | 'no'>('');

  const [detail, setDetail] = useState<DataRecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailAction, setDetailAction] = useState<'reset' | 'fetch' | null>(null);
  const [genreSyncing, setGenreSyncing] = useState(false);
  const [jobView, setJobView] = useState<JavDetailJobView | null>(null);
  const [jobStartingField, setJobStartingField] = useState<JavDetailFieldName | null>(null);
  const [retryingTransient, setRetryingTransient] = useState(false);
  const [jobStopping, setJobStopping] = useState(false);
  const [jobPausing, setJobPausing] = useState(false);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(normalizeStats(await dataStorageApi.getStats()));
    } catch {
      toast.error(t('admin:dataStorage.loadStatsFailed'));
    } finally {
      setStatsLoading(false);
    }
  }, [toast, t]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const r = await dataStorageApi.getRecords({
        page,
        pageSize: 20,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
        detail: detailFilter || undefined,
        missing: missingFilters.length > 0 ? missingFilters.join(',') : undefined,
        retry: retryFilter || undefined,
      });
      setRecords(toArray<DataRecord>(r?.items));
      setTotalPages(Math.max(1, toNumber(r?.totalPages) || 1));
      setTotal(toNumber(r?.total));
    } catch {
      toast.error(t('admin:dataStorage.loadRecordsFailed'));
    } finally {
      setRecordsLoading(false);
    }
  }, [page, typeFilter, statusFilter, search, detailFilter, missingFilters, retryFilter, toast, t]);

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
    const tick = async () => {
      try {
        const patch = normalizeJobView(await dataStorageApi.getDetailJob());
        if (cancelled || !patch) return;
        const prevStatus = jobStatusRef.current?.status;
        jobStatusRef.current = patch.job;
        setJobView((prev) => mergeJobView(prev, patch));
        // 任务刚结束：刷新统计与当前列表，避免界面停留在旧数据
        if (prevStatus === 'running' && patch.job?.status !== 'running') {
          loadStats();
          loadRecords();
        }
      } catch {
        /* 忽略轮询错误 */
      }
    };
    tick();
    const timer = setInterval(() => {
      if (jobStatusRef.current?.status === 'running') tick();
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadStats, loadRecords]);

  // 手动重试「暂时失败」：后端先把退避时间清零，再由同一个批次任务立即推进
  const handleRetryTransient = async () => {
    setRetryingTransient(true);
    try {
      const patch = normalizeJobView(
        await dataStorageApi.startDetailJob({ missing: 'transient' })
      );
      if (!patch) throw new Error('empty response');
      jobStatusRef.current = patch.job;
      setJobView((prev) => mergeJobView(prev, patch));
      toast.success(t('admin:dataStorage.batch.retryTransientStarted'));
    } catch {
      toast.error(t('admin:dataStorage.batch.startFailed'));
    } finally {
      setRetryingTransient(false);
    }
  };

  // 四个入口各自启动：筛选只决定选哪些记录，抓取仍然是完整详情
  const handleStartJob = async (missing: JavDetailFieldName) => {
    setJobStartingField(missing);
    try {
      const patch = normalizeJobView(
        // 不传 batchSize：由后端默认值统一控制每分钟条数
        await dataStorageApi.startDetailJob({ missing })
      );
      // 启动接口只返回 progress 字段，缺 stats/recentFailures 时沿用已有数据
      if (!patch) throw new Error('empty response');
      jobStatusRef.current = patch.job;
      setJobView((prev) => mergeJobView(prev, patch));
      toast.success(t('admin:dataStorage.batch.startedToast'));
    } catch {
      toast.error(t('admin:dataStorage.batch.startFailed'));
    } finally {
      setJobStartingField(null);
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

  // 暂停/继续只切开关：任务仍是 running，进度保留，继续后接着跑
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

  useEffect(() => {
    if (activeView === 'overview') loadStats();
  }, [activeView, loadStats]);

  useEffect(() => {
    if (activeView === 'records') loadRecords();
  }, [activeView, loadRecords]);

  const normalizeDetailRecord = (raw: DataRecordDetail): DataRecordDetail => ({
    ...raw,
    tags: toArray<string>(raw.tags),
    sources: toArray<DataRecordSource>(raw.sources),
    detailMissing: toArray<JavDetailFieldName>(raw.detailMissing),
  });

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const raw = await dataStorageApi.getRecord(id);
      if (!raw) {
        setDetail(null);
        return;
      }
      setDetail(normalizeDetailRecord(raw));
    } catch {
      toast.error(t('admin:dataStorage.loadDetailFailed'));
    } finally {
      setDetailLoading(false);
    }
  };

  /** 操作后静默刷新详情：不关闭 Modal，避免整卡闪动 */
  const reloadDetail = async (id: string) => {
    try {
      const raw = await dataStorageApi.getRecord(id);
      if (raw) setDetail(normalizeDetailRecord(raw));
    } catch {
      /* 列表与统计已刷新，详情刷新失败不重复弹错 */
    }
  };

  const handleResetRetry = async (id: string) => {
    setDetailAction('reset');
    try {
      await dataStorageApi.resetRecordDetailRetry(id);
      toast.success(t('admin:dataStorage.resetRetryToast'));
      // 最近错误、次数、重试时间与列表筛选结果同步更新
      await Promise.all([reloadDetail(id), loadRecords(), loadStats()]);
    } catch {
      toast.error(t('admin:dataStorage.actionFailed'));
    } finally {
      setDetailAction(null);
    }
  };

  const handleFetchDetail = async (id: string) => {
    setDetailAction('fetch');
    try {
      const result = await dataStorageApi.fetchRecordDetail(id);
      if (result?.ok === false) {
        toast.error(t('admin:dataStorage.fetchDetailFailed'));
      } else {
        toast.success(t('admin:dataStorage.fetchDetailToast'));
      }
      await Promise.all([reloadDetail(id), loadRecords(), loadStats()]);
    } catch {
      toast.error(t('admin:dataStorage.actionFailed'));
    } finally {
      setDetailAction(null);
    }
  };

  const handleToggleStatus = async (record: DataRecord | DataRecordDetail) => {
    const next = record.status === 'active' ? 'hidden' : 'active';
    try {
      await dataStorageApi.updateRecordStatus(record.id, next);
      toast.success(next === 'hidden' ? t('admin:dataStorage.hiddenToast') : t('admin:dataStorage.shownToast'));
      // 刷新列表与详情
      loadRecords();
      if (detail && detail.id === record.id) {
        setDetail({ ...detail, status: next });
      }
    } catch {
      toast.error(t('admin:dataStorage.opFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('admin:dataStorage.deleteConfirm'))) return;
    try {
      await dataStorageApi.deleteRecord(id);
      toast.success(t('admin:dataStorage.deleteSuccessToast'));
      setDetail(null);
      loadRecords();
      loadStats();
    } catch {
      toast.error(t('admin:dataStorage.deleteFailedToast'));
    }
  };

  const handleCleanup = async () => {
    if (!confirm(t('admin:dataStorage.cleanupConfirm'))) return;
    try {
      const r = await dataStorageApi.cleanup();
      toast.success(t('admin:dataStorage.cleanupToast', { count: r.deleted }));
      loadStats();
      if (activeView === 'records') loadRecords();
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

  // 磁力链接复制到剪贴板（magnet: 协议浏览器无法直接打开，供用户粘贴到下载工具）
  const copyToClipboard = async (text: string, label = t('admin:dataStorage.copyDefaultLabel')) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('admin:dataStorage.copiedToast', { label }));
    } catch {
      toast.error(t('admin:dataStorage.copyFailedToast'));
    }
  };

  return (
    <div className="space-y-5">
      {/* 顶部：视图切换 + 操作 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {(['overview', 'records'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className={clsx(
                'px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors',
                activeView === v
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                  : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
              )}
            >
              {v === 'overview' ? t('admin:dataStorage.viewOverview') : t('admin:dataStorage.viewRecords')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleGenreSync} disabled={genreSyncing}>
            <Tags className="w-3.5 h-3.5" />
            <span className="ml-1">{t('admin:dataStorage.genreSync')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeView === 'overview') loadStats();
              else loadRecords();
              loadJob();
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="ml-1">{t('admin:dataStorage.refresh')}</span>
          </Button>
          {isSuperAdmin && stats && stats.hiddenCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleCleanup} className="text-orange-600 dark:text-orange-400">
              <Trash2 className="w-3.5 h-3.5" />
              <span className="ml-1">{t('admin:dataStorage.cleanupHidden')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* 概览视图 */}
      {activeView === 'overview' && (
        statsLoading ? (
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

            {/* JAV 详情完整度 + 手动批量补全 */}
            <DetailJobPanel
              view={jobView}
              startingField={jobStartingField}
              stopping={jobStopping}
              pausing={jobPausing}
              onStart={handleStartJob}
              onStop={handleStopJob}
              onPause={handlePauseJob}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 30天新增趋势 */}
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">{t('admin:dataStorage.trend30d')}</h3>
                <TrendBarChart data={stats.recordsOverTime} />
              </div>

              {/* 分类分布 */}
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
              {/* 热门标签 */}
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

              {/* 数据来源贡献 */}
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">{t('admin:dataStorage.topSources')}</h3>
                <div className="space-y-2">
                  {(stats.topSources || []).length === 0 ? (
                    <p className="text-sm text-surface-400 py-4 text-center">{t('admin:dataStorage.emptySources')}</p>
                  ) : (
                    stats.topSources.map((s) => (
                      <div
                        key={s.source_name}
                        className="flex items-center justify-between p-2 rounded-lg bg-surface-50 dark:bg-surface-900/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Link2 className="w-3.5 h-3.5 text-surface-400 shrink-0" />
                          <span className="text-sm text-surface-600 dark:text-surface-400 truncate">{s.source_name}</span>
                        </div>
                        <span className="text-sm font-semibold text-surface-900 dark:text-surface-100 ml-2 shrink-0">
                          {toNumber(s.count).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-sm text-surface-500 dark:text-surface-400">
            {t('admin:dataStorage.empty')}
          </div>
        )
      )}

      {/* 数据浏览视图 */}
      {activeView === 'records' && (
        <div className="space-y-4">
          {/* 筛选区 */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex flex-wrap gap-1.5">
              {TYPE_FILTERS.map((tf) => (
                <button
                  key={tf.key || 'all'}
                  onClick={() => {
                    setTypeFilter(tf.key);
                    setPage(1);
                  }}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    typeFilter === tf.key
                      ? 'bg-rose-500 text-white'
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600'
                  )}
                >
                  {t(tf.label)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 flex-1 sm:max-w-2xl sm:ml-auto">
              <select
                value={detailFilter}
                onChange={(e) => {
                  const next = e.target.value as '' | 'complete' | 'incomplete' | 'error';
                  setDetailFilter(next);
                  if (next === 'complete') setMissingFilters([]);
                  setPage(1);
                }}
                className="px-3 py-2 rounded-lg text-sm bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                <option value="">{t('admin:dataStorage.detailFilter.all')}</option>
                <option value="complete">{t('admin:dataStorage.detailFilter.complete')}</option>
                <option value="incomplete">{t('admin:dataStorage.detailFilter.incomplete')}</option>
                <option value="error">{t('admin:dataStorage.detailFilter.error')}</option>
              </select>
              <select
                value={retryFilter}
                onChange={(e) => {
                  setRetryFilter(e.target.value as '' | 'yes' | 'no');
                  setPage(1);
                }}
                className="px-3 py-2 rounded-lg text-sm bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                <option value="">{t('admin:dataStorage.retryFilter.all')}</option>
                <option value="yes">{t('admin:dataStorage.retryFilter.yes')}</option>
                <option value="no">{t('admin:dataStorage.retryFilter.no')}</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'active' | 'hidden' | '');
                  setPage(1);
                }}
                className="px-3 py-2 rounded-lg text-sm bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                <option value="">{t('admin:dataStorage.filter.allStatus')}</option>
                <option value="active">{t('admin:dataStorage.filter.statusActive')}</option>
                <option value="hidden">{t('admin:dataStorage.filter.statusHidden')}</option>
              </select>
              <Input
                placeholder={t('admin:dataStorage.filter.searchPlaceholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
          </div>

          {/* 缺失字段筛选（点击后自动切到 JAV + 详情不完整） */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-surface-400 mr-1">{t('admin:dataStorage.missingFilterLabel')}</span>
            {DETAIL_FIELD_KEYS.map((field) => {
              const active = missingFilters.includes(field);
              return (
                <button
                  key={field}
                  onClick={() => {
                    setTypeFilter('jav');
                    setDetailFilter('incomplete');
                    setMissingFilters((prev) =>
                      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
                    );
                    setPage(1);
                  }}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    active
                      ? 'bg-amber-500 text-white'
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600'
                  )}
                >
                  {t(`admin:dataStorage.detailField.${field}`)}
                </button>
              );
            })}
            {(detailFilter || missingFilters.length > 0 || retryFilter) && (
              <button
                onClick={() => {
                  setDetailFilter('');
                  setMissingFilters([]);
                  setRetryFilter('');
                  setPage(1);
                }}
                className="px-2.5 py-1 rounded-lg text-xs text-surface-500 hover:text-rose-500"
              >
                {t('admin:dataStorage.filter.all')}
              </button>
            )}
            {detailFilter === 'error' && (
              <button
                type="button"
                onClick={() => void handleRetryTransient()}
                disabled={retryingTransient || jobView?.job?.status === 'running'}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500 text-white transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={clsx('h-3 w-3', retryingTransient && 'animate-spin')} />
                {t('admin:dataStorage.batch.retryTransientBtn')}
              </button>
            )}
          </div>

          <div className="text-sm text-surface-500">{t('admin:dataStorage.totalRecords', { count: total.toLocaleString() })}</div>

          {/* 记录卡片网格 */}
          {recordsLoading ? (
            <div className="text-center py-16 text-surface-500">{t('admin:dataStorage.loading')}</div>
          ) : records.length === 0 ? (
            <div className="text-center py-16 text-surface-500">
              <Database className="w-12 h-12 mx-auto mb-3 text-surface-300 dark:text-surface-700" />
              <p>{t('admin:dataStorage.recordsEmpty')}</p>
              <p className="text-xs mt-1">{t('admin:dataStorage.recordsEmptyHint')}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {records.map((r) => (
                  <RecordCard
                    key={r.id}
                    record={r}
                    onClick={() => openDetail(r.id)}
                    onToggleStatus={() => handleToggleStatus(r)}
                  />
                ))}
              </div>
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </>
          )}
        </div>
      )}

      {/* 详情 Modal */}
      <Modal
        isOpen={!!detail || detailLoading}
        onClose={() => {
          if (!detailLoading) {
            setDetail(null);
          }
        }}
        title={t('admin:dataStorage.detailModalTitle')}
        size="full"
      >
        {detailLoading ? (
          <div className="text-center py-16 text-surface-500">{t('admin:dataStorage.loading')}</div>
        ) : detail ? (
          <div className="space-y-5">
            {/* 头部：封面 + 基础信息 */}
            <div className="flex gap-4">
              {detail.cover ? (
                <ProxyImage
                  src={getProxyImageUrl(detail.cover)}
                  alt={detail.title}
                  className="w-24 h-32 object-cover rounded-lg bg-surface-100 dark:bg-surface-700 shrink-0"
                />
              ) : (
                <div className="w-24 h-32 rounded-lg bg-surface-100 dark:bg-surface-700 flex items-center justify-center shrink-0">
                  <Film className="w-8 h-8 text-surface-300 dark:text-surface-600" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2 flex-wrap mb-2">
                  {TYPE_META[detail.recordType] && (
                    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', TYPE_META[detail.recordType].color)}>
                      {TYPE_META[detail.recordType].icon}
                      {t(TYPE_META[detail.recordType].label)}
                    </span>
                  )}
                  {detail.detailStatus ? (
                    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', DETAIL_STATUS_STYLE[detail.detailStatus])}>
                      {detail.detailStatus === 'complete' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      {detailStatusLabel(t, detail.detailStatus)}
                    </span>
                  ) : detail.detailCompleted ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle2 className="w-3 h-3" />
                      {t('admin:dataStorage.detailComplete')}
                    </span>
                  ) : null}
                  {detail.status === 'hidden' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      <EyeOff className="w-3 h-3" />
                      {t('admin:dataStorage.detailHidden')}
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 break-words">{detail.title}</h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500 dark:text-surface-400">
                  {detail.code && <span>{t('admin:dataStorage.codeLabel')}<span className="font-mono text-surface-700 dark:text-surface-300">{detail.code}</span></span>}
                  {detail.releaseDate && <span>{t('admin:dataStorage.releaseLabel')}{detail.releaseDate}</span>}
                  {detail.duration && <span>{t('admin:dataStorage.durationLabel')}{detail.duration}</span>}
                  {detail.publisher && <span>{t('admin:dataStorage.publisherLabel')}{detail.publisher}</span>}
                  {detail.sourceCount > 0 && <span>{t('admin:dataStorage.sourceCountLabel')}{detail.sourceCount}</span>}
                </div>
                <div className="mt-1 text-xs text-surface-400">
                  {t('admin:dataStorage.firstSeen', { time: formatRelativeTime(detail.firstSeenAt) })} · {t('admin:dataStorage.updatedAt', { time: formatRelativeTime(detail.lastUpdatedAt) })}
                </div>
              </div>
            </div>

            {/* 详情完整度与重试状态 */}
            {detail.recordType === 'jav' && detail.detailStatus && (
              <div className="rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                    {t('admin:dataStorage.detailStatusLabel')}
                  </span>
                  {(detail.detailMissing?.length ?? 0) > 0 && (
                    <span className="inline-flex flex-wrap items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      {t('admin:dataStorage.missingFieldsLabel')}
                      {detail.detailMissing!.map((field) => (
                        <span key={field} className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20">
                          {t(`admin:dataStorage.detailField.${field}`)}
                        </span>
                      ))}
                    </span>
                  )}
                  {detail.detailRetryExhausted && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                      {t('admin:dataStorage.detailNoRetry')}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-surface-400">{t('admin:dataStorage.detailAttemptsLabel')}</div>
                    <div className="font-semibold text-surface-700 dark:text-surface-300">{detail.detailAttempts ?? 0} / 3</div>
                  </div>
                  <div>
                    <div className="text-surface-400">{t('admin:dataStorage.detailTransientLabel')}</div>
                    <div className="font-semibold text-surface-700 dark:text-surface-300">{detail.detailTransientFailures ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-surface-400">{t('admin:dataStorage.detailNextRetryLabel')}</div>
                    <div className="font-semibold text-surface-700 dark:text-surface-300">
                      {detail.detailRetryExhausted
                        ? t('admin:dataStorage.detailNoRetry')
                        : detail.detailNextRetryAt && detail.detailNextRetryAt > Date.now()
                          ? formatRelativeTime(detail.detailNextRetryAt)
                          : '—'}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-surface-400">{t('admin:dataStorage.detailLastErrorLabel')}</div>
                    <div className="font-semibold text-surface-700 dark:text-surface-300 truncate">
                      {detail.detailLastError ? errorCodeLabel(t, detail.detailLastError) : '—'}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResetRetry(detail.id)}
                    disabled={detailAction !== null}
                  >
                    {detailAction === 'reset'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                    <span className="ml-1">{t('admin:dataStorage.resetRetryBtn')}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleFetchDetail(detail.id)}
                    disabled={detailAction !== null}
                  >
                    {detailAction === 'fetch'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Search className="w-3.5 h-3.5" />}
                    <span className="ml-1">{t('admin:dataStorage.fetchDetailBtn')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* 演员 */}
            {detail.actors && (
              <div>
                <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1.5">{t('admin:dataStorage.actorsLabel')}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {parseActors(detail.actors).map((a, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md text-xs bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 标签 */}
            {toArray<string>(detail.tags).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1.5">{t('admin:dataStorage.tagsLabel')}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {toArray<string>(detail.tags).map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md text-xs bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 来源链接 */}
            {detail.sources && detail.sources.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1.5">
                  {t('admin:dataStorage.sourceLinksLabel', { count: detail.sources.length })}
                </h4>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {detail.sources.map((s) => {
                    let extra = '';
                    try {
                      const d = JSON.parse(s.sourceData);
                      if (d.size) extra = d.size;
                      if (d.isHD) extra += ' · HD';
                    } catch {
                      /* ignore */
                    }
                    return (
                      <SourceLinkRow
                        key={s.id}
                        source={s}
                        extra={extra}
                        onCopy={copyToClipboard}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* 完整数据 JSON */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-surface-700 dark:text-surface-300 hover:text-rose-600">
                {t('admin:dataStorage.rawData')}
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-surface-900 text-surface-100 dark:bg-black/40 text-xs overflow-x-auto max-h-80 font-mono">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(detail.contentData), null, 2);
                  } catch {
                    return detail.contentData;
                  }
                })()}
              </pre>
            </details>

            {/* 操作 */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-200 dark:border-surface-700">
              <Button variant="outline" size="sm" onClick={() => handleToggleStatus(detail)}>
                <EyeOff className="w-3.5 h-3.5" />
                <span className="ml-1">{detail.status === 'active' ? t('admin:dataStorage.hideBtn') : t('admin:dataStorage.showBtn')}</span>
              </Button>
              {isSuperAdmin && (
                <Button variant="outline" size="sm" onClick={() => handleDelete(detail.id)} className="text-red-600 dark:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="ml-1">{t('admin:dataStorage.deleteBtn')}</span>
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

// ─── 子组件：JAV 详情完整度与批量补全 ────────────────────────────────

const DetailJobPanel: React.FC<{
  view: JavDetailJobView | null;
  /** 正在启动的字段入口；null 表示没有启动请求在途 */
  startingField: JavDetailFieldName | null;
  stopping: boolean;
  pausing: boolean;
  onStart: (missing: JavDetailFieldName) => void;
  onStop: () => void;
  onPause: (paused: boolean) => void;
}> = ({ view, startingField, stopping, pausing, onStart, onStop, onPause }) => {
  const { t } = useTranslation(['admin']);
  const job = view?.job ?? null;
  const stats = view?.stats;
  // 启动接口不返回 recentFailures，旧后端也可能缺该字段：统一兜底为空数组
  const failures = toArray<JavDetailFailure>(view?.recentFailures);
  const enabled = view?.enabled !== false;
  const running = job?.status === 'running';
  const starting = startingField !== null;
  // 本次任务只补哪一类（任务行自带筛选条件；null 表示不限）
  const jobFilter = job?.filter_missing ?? null;
  // 三态互斥，同一个词只表达一个概念：
  //   运行中  = 任务在跑且开关开启
  //   已暂停  = 任务在跑但开关关闭（进度保留，继续后接着跑）
  //   已停止  = 任务已结束（手动停止或跑完）
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
          const isStarting = startingField === field;
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

      {/* 重补逻辑说明：用户需要知道什么条件会被补、自动与手动的边界、补一次写什么、失败怎么退避 */}
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

      {/* 字段级完整度 */}
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

      {/* 任务进度 */}
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
            {t('admin:dataStorage.batch.runningScope', {
              field: t(`admin:dataStorage.detailField.${jobFilter}`),
            })}
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

      {/* 最近失败 */}
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

// ─── 子组件：趋势柱状图 ──────────────────────────────────────────────

const TrendBarChart: React.FC<{ data: Array<{ date: string; count: number }> }> = ({ data }) => {
  const { t } = useTranslation(['admin']);
  const rows = toArray<{ date?: unknown; count?: unknown }>(data).map((item) => ({
    date: String(item?.date ?? ''),
    count: toNumber(item?.count),
  }));
  const maxCount = Math.max(...rows.map((d) => d.count), 1);
  const totalCount = rows.reduce((sum, d) => sum + d.count, 0);
  if (rows.length === 0 || totalCount === 0) {
    return <p className="text-sm text-surface-400 py-8 text-center">{t('admin:dataStorage.trendEmpty')}</p>;
  }
  return (
    <div>
      <div className="flex items-end gap-0.5 h-32">
        {rows.map((d) => (
          // 柱子的高度是百分比，必须让每列撑满容器高度（h-full）才有确定的高度可参照；
          // 否则百分比算不出像素，会被 minHeight 兜成一条 2px 的贴底线，看起来像没有数据。
          <div
            key={d.date}
            className="flex-1 h-full flex items-end group relative"
            title={t('admin:dataStorage.trendTooltip', { date: d.date, count: d.count })}
          >
            <div
              className="w-full bg-gradient-to-t from-rose-400 to-pink-400 dark:from-rose-600 dark:to-pink-600 rounded-sm transition-all hover:from-rose-500 hover:to-pink-500"
              style={{
                height: d.count === 0 ? '0px' : `${Math.max((d.count / maxCount) * 100, 3)}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-surface-400">
        <span>{rows[0].date}</span>
        <span>{rows[rows.length - 1].date}</span>
      </div>
    </div>
  );
};

// ─── 子组件：记录卡片 ────────────────────────────────────────────────

const RecordCard: React.FC<{
  record: DataRecord;
  onClick: () => void;
  onToggleStatus: () => void;
}> = ({ record, onClick, onToggleStatus }) => {
  const { t } = useTranslation(['admin']);
  const meta = TYPE_META[record.recordType];
  return (
    <div
      onClick={onClick}
      className={clsx(
        'group cursor-pointer bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden hover:shadow-lg hover:border-rose-300 dark:hover:border-rose-700 transition-all',
        record.status === 'hidden' && 'opacity-60'
      )}
    >
      <div className="flex gap-3 p-3">
        {record.cover ? (
          <ProxyImage
            src={getProxyImageUrl(record.cover)}
            alt={record.title}
            loading="lazy"
            className="h-[5.5rem] w-16 object-cover rounded-lg bg-surface-100 dark:bg-surface-700 shrink-0"
          />
        ) : (
          <div className="w-16 rounded-lg bg-surface-100 dark:bg-surface-700 flex items-center justify-center shrink-0" style={{ height: '5.5rem' }}>
            <Film className="w-6 h-6 text-surface-300 dark:text-surface-600" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            {meta && (
              <span className={clsx('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium', meta.color)}>
                {meta.icon}
                {t(meta.label)}
              </span>
            )}
            {record.detailStatus && record.detailStatus !== 'complete' ? (
              <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium', DETAIL_STATUS_STYLE[record.detailStatus])}>
                {detailStatusLabel(t, record.detailStatus)}
              </span>
            ) : record.detailCompleted ? (
              <CheckCircle2 className="w-3 h-3 text-green-500" />
            ) : null}
            {record.status === 'hidden' && (
              <EyeOff className="w-3 h-3 text-orange-500" />
            )}
          </div>
          <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100 line-clamp-2 leading-snug">
            {record.title}
          </h4>
          {(record.detailMissing?.length ?? 0) > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {record.detailMissing!.map((field) => (
                <span
                  key={field}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                >
                  {t(`admin:dataStorage.detailField.${field}`)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 text-[11px] text-surface-400 space-y-0.5">
            {record.code && <div className="font-mono truncate">{record.code}</div>}
            <div className="flex items-center gap-2">
              <span>{formatRelativeTime(record.firstSeenAt)}</span>
              {record.sourceCount > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Link2 className="w-2.5 h-2.5" />
                  {record.sourceCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleStatus();
        }}
        className="w-full py-1.5 text-[11px] text-surface-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 border-t border-surface-100 dark:border-surface-700 transition-colors"
        title={record.status === 'active' ? t('admin:dataStorage.toggleHideTitle') : t('admin:dataStorage.toggleShowTitle')}
      >
        {record.status === 'active' ? t('admin:dataStorage.hideBtn') : t('admin:dataStorage.showBtn')}
      </button>
    </div>
  );
};

// ─── 工具函数 ────────────────────────────────────────────────────────

function parseActors(raw: string): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map(String);
  } catch {
    /* fallthrough */
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// ─── 子组件：来源链接行（磁力→复制，网页→打开） ──────────────────────

const SourceLinkRow: React.FC<{
  source: DataRecordSource;
  extra: string;
  onCopy: (text: string, label?: string) => void;
}> = ({ source, extra, onCopy }) => {
  const { t } = useTranslation(['admin']);
  const [copied, setCopied] = useState(false);
  const isMagnet = source.sourceType === 'magnet';

  const handleCopy = () => {
    if (!source.sourceUrl) return;
    onCopy(source.sourceUrl, t('admin:dataStorage.magnetLabel'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-50 dark:bg-surface-900/50">
      {isMagnet ? (
        <Magnet className="w-3.5 h-3.5 text-rose-500 shrink-0" />
      ) : (
        <Link2 className="w-3.5 h-3.5 text-surface-400 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-surface-700 dark:text-surface-300 truncate">
          {source.sourceName}
          {extra && <span className="text-surface-400 font-normal ml-1">· {extra}</span>}
        </div>
        <div className="text-[10px] text-surface-400 font-mono truncate">{source.sourceUrl}</div>
      </div>
      {source.sourceUrl && (
        isMagnet ? (
          <button
            onClick={handleCopy}
            className="p-1 rounded text-surface-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 shrink-0 transition-colors"
            title={t('admin:dataStorage.copyMagnetTitle')}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded text-surface-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 shrink-0"
            title={t('admin:dataStorage.openLinkTitle')}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )
      )}
    </div>
  );
};
