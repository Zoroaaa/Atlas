/**
 * 数据存储子页面共用的常量、容错函数与小部件。
 *
 * 生产可能先部署前端、后执行迁移/部署后端，接口会返回旧结构、null 或空响应；
 * 所有展示数据在进入渲染前统一归一化，避免对缺失字段直接做 .length / .map。
 */
import React, { useState } from 'react';
import { clsx } from 'clsx';
import {
  BookOpen,
  BookText,
  Check,
  CheckCircle2,
  Clapperboard,
  Copy,
  ExternalLink,
  EyeOff,
  Film,
  Link2,
  Magnet,
  User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProxyImage } from '@/components/ui';
import { getProxyImageUrl } from '@/utils';
import { formatRelativeTime } from '../shared';
import type {
  DataRecord,
  DataRecordSource,
  DataStorageStats,
  JavDetailFailure,
  JavDetailFieldName,
  JavDetailJob,
  JavDetailJobFilter,
  JavDetailJobView,
  JavDetailStats,
  JavDetailStatus,
} from '@/types';

// ─── 类型元数据 ──────────────────────────────────────────────────────

export const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  jav: { label: 'admin:dataStorage.type.jav', icon: <Film className="w-3.5 h-3.5" />, color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  anime: { label: 'admin:dataStorage.type.anime', icon: <Clapperboard className="w-3.5 h-3.5" />, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  movie: { label: 'admin:dataStorage.type.movie', icon: <Film className="w-3.5 h-3.5" />, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  manga: { label: 'admin:dataStorage.type.manga', icon: <BookOpen className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  novel: { label: 'admin:dataStorage.type.novel', icon: <BookText className="w-3.5 h-3.5" />, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  actress: { label: 'admin:dataStorage.type.actress', icon: <User className="w-3.5 h-3.5" />, color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
};

export const TYPE_FILTERS: Array<{ key: '' | DataRecord['recordType']; label: string }> = [
  { key: '', label: 'admin:dataStorage.filter.all' },
  { key: 'jav', label: 'admin:dataStorage.type.jav' },
  { key: 'anime', label: 'admin:dataStorage.type.anime' },
  { key: 'movie', label: 'admin:dataStorage.type.movie' },
  { key: 'manga', label: 'admin:dataStorage.type.manga' },
  { key: 'novel', label: 'admin:dataStorage.type.novel' },
  { key: 'actress', label: 'admin:dataStorage.type.actress' },
];

export const DETAIL_FIELD_KEYS: JavDetailFieldName[] = ['director', 'maker', 'publisher', 'magnets'];

/** 批量任务的筛选范围：四个字段 + 三个状态入口 */
export const JOB_FILTERS: JavDetailJobFilter[] = [...DETAIL_FIELD_KEYS, 'pending', 'transient', 'absent'];

/** 状态范围入口：与字段入口分开展示 */
export const SCOPE_FILTERS: Array<Exclude<JavDetailJobFilter, JavDetailFieldName>> = ['pending', 'transient', 'absent'];

export function isJobFilter(value: unknown): value is JavDetailJobFilter {
  return typeof value === 'string' && (JOB_FILTERS as string[]).includes(value);
}

export function isFieldFilter(filter: JavDetailJobFilter): filter is JavDetailFieldName {
  return (DETAIL_FIELD_KEYS as string[]).includes(filter);
}

export const DETAIL_STATUS_STYLE: Record<JavDetailStatus, string> = {
  complete: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  absent: 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export function detailStatusLabel(t: (key: string) => string, status: JavDetailStatus | null | undefined): string {
  return t(`admin:dataStorage.detailStatus.${status || 'pending'}`);
}

/** 历史版本把错误文案直接写进了 last_error，展示时兼容成稳定错误码 */
const LEGACY_ERROR_CODES: Record<string, string> = {
  '磁力接口暂时不可用': 'MAGNET_FETCH_FAILED',
};

export function errorCodeLabel(t: (key: string) => string, code: string | null | undefined): string {
  if (!code) return '';
  const normalized = LEGACY_ERROR_CODES[code] ?? code;
  const key = `admin:dataStorage.errorCode.${normalized}`;
  const label = t(key);
  return label === key ? normalized : label;
}

// ─── 接口响应容错 ────────────────────────────────────────────────────

export function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export const EMPTY_JAV_DETAIL_STATS: JavDetailStats = {
  total: 0,
  complete: 0,
  partial: 0,
  absent: 0,
  error: 0,
  pending: 0,
  missing: { director: 0, maker: 0, publisher: 0, magnets: 0 },
};

export function normalizeDetailStats(value: unknown): JavDetailStats | null {
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

export function normalizeStats(value: unknown): DataStorageStats | null {
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

export function normalizeJob(value: unknown): JavDetailJob | null {
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
    filter_missing: isJobFilter(raw.filter_missing) ? raw.filter_missing : null,
    created_at: toNumber(raw.created_at),
    updated_at: toNumber(raw.updated_at),
    finished_at: raw.finished_at == null ? null : toNumber(raw.finished_at),
  };
}

export function normalizeFailure(value: unknown): JavDetailFailure | null {
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

export interface JobViewPatch {
  job: JavDetailJob | null;
  pending?: number;
  due?: number;
  scheduled?: number;
  enabled?: boolean;
  stats?: JavDetailStats | null;
  recentFailures?: JavDetailFailure[];
}

export function normalizeJobView(value: unknown): JobViewPatch | null {
  const raw = toObject(value);
  if (!raw) return null;
  const failures = Array.isArray(raw.recentFailures)
    ? raw.recentFailures
        .map(normalizeFailure)
        .filter((item): item is JavDetailFailure => item !== null)
    : undefined;
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    job: normalizeJob(raw.job),
    pending: num(raw.pending),
    due: num(raw.due),
    scheduled: num(raw.scheduled),
    enabled: raw.enabled === false ? false : true,
    stats: normalizeDetailStats(raw.stats),
    recentFailures: failures,
  };
}

export function mergeJobView(prev: JavDetailJobView | null, patch: JobViewPatch | null): JavDetailJobView | null {
  if (!patch) return prev;
  return {
    job: patch.job,
    pending: patch.pending ?? prev?.pending ?? 0,
    due: patch.due ?? prev?.due ?? 0,
    scheduled: patch.scheduled ?? prev?.scheduled ?? 0,
    enabled: patch.enabled ?? prev?.enabled ?? true,
    stats: patch.stats ?? prev?.stats ?? EMPTY_JAV_DETAIL_STATS,
    recentFailures: patch.recentFailures ?? prev?.recentFailures ?? [],
  };
}

// ─── 共用小部件 ──────────────────────────────────────────────────────

/** 字节数转可读体积；封面页与 R2 看板共用，避免两处各写一份精度不一致 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export const StoragePageHeader: React.FC<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <div className="flex items-start justify-between gap-3 flex-wrap">
    <div className="min-w-0">
      <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">{title}</h2>
      {description && <p className="text-xs text-surface-500 mt-1">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

export const TrendBarChart: React.FC<{ data: Array<{ date: string; count: number }> }> = ({ data }) => {
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

export const RecordCard: React.FC<{
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
            className="h-[5.5rem] w-16 object-contain rounded-lg bg-surface-100 dark:bg-surface-700 shrink-0"
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

export function parseActors(raw: string): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map(String);
  } catch {
    /* fallthrough */
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export const SourceLinkRow: React.FC<{
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
