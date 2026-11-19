/**
 * 数据存储 · R2 管理看板
 *
 * 三口径对账：R2 实际对象（扫描快照）/ 账本登记（cover_assets）/ 业务引用（data_records）。
 * 差额四类：未登记（保护期）、可回收、账本谎报、未解析 key。
 *
 * 数字来自最近一轮完整扫描，不是实时值；scan 卡片会明确展示扫描时间与进度。
 * 回收只针对「无账本 + 无记录引用 + 超期」的懒加载封面，删除后由代理下次访问重建。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  AlertTriangle,
  Cloud,
  Database,
  HardDrive,
  Image as ImageIcon,
  RefreshCw,
  ScanLine,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { r2AdminApi } from '@/services/api';
import { Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/hooks/useNotification';
import {
  formatDate,
  formatRelativeTime,
  Pagination,
  StatCard,
  StatsGrid,
  TableWrapper,
} from '../shared';
import type {
  R2DashboardStats,
  R2NamespaceStat,
  R2ObjectRow,
  R2ReclaimPreview,
  R2ScanStatus,
} from '@/types';
import { StoragePageHeader, formatBytes } from './shared';

/** 命名空间固定列表：与后端 key 规则只增不改的约定保持一致 */
const NAMESPACES = ['jav', 'anime', 'movie', 'manga', 'novel', 'person', 'misc'];
const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

const SCAN_STATUS_STYLE: Record<R2ScanStatus, string> = {
  idle: 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const EMPTY_DIFF_STATS: R2DashboardStats['diff'] = {
  unregistered: { count: 0, bytes: 0 },
  ledgerMissing: { count: 0, repairable: 0, orphan: 0 },
  reclaimable: { days: 90, count: 0, bytes: 0 },
};

export const R2Page: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const toast = useToast();

  const [stats, setStats] = useState<R2DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const [objects, setObjects] = useState<R2ObjectRow[]>([]);
  const [objTotal, setObjTotal] = useState(0);
  const [objTotalPages, setObjTotalPages] = useState(1);
  const [objLoading, setObjLoading] = useState(true);
  const [pageLimitHit, setPageLimitHit] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [namespace, setNamespace] = useState('');
  const [registered, setRegistered] = useState<'all' | 'yes' | 'no'>('all');
  const [statusFilter, setStatusFilter] = useState<'live' | 'reclaimed' | 'all'>('live');
  const [minAgeDays, setMinAgeDays] = useState('');
  const [sort, setSort] = useState<'uploaded' | 'size'>('uploaded');

  const [reclaimDays, setReclaimDays] = useState(90);
  const [reclaimNamespace, setReclaimNamespace] = useState('');
  const [preview, setPreview] = useState<R2ReclaimPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [reclaiming, setReclaiming] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const loadStats = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const next = await r2AdminApi.getStats();
        setStats(next);
        // 回收天数默认跟随服务端配置，管理员改过就不再覆盖
        setReclaimDays((prev) => (prev === 90 ? next.reclaim.days : prev));
      } catch {
        if (!silent) toast.error(t('admin:r2.loadFailed'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [toast, t]
  );

  const loadObjects = useCallback(async () => {
    setObjLoading(true);
    try {
      const result = await r2AdminApi.getObjects({
        page,
        pageSize,
        namespace: namespace || undefined,
        registered,
        status: statusFilter,
        minAgeDays: minAgeDays ? Number(minAgeDays) : undefined,
        sort,
      });
      setObjects(result.items ?? []);
      // 后端只在第一页算总数，翻页时返回 null：沿用上一次的数字，避免每页重扫全表
      if (result.total !== null && result.total !== undefined) {
        setObjTotal(result.total);
        setObjTotalPages(result.totalPages ?? 1);
      }
      setPageLimitHit(Boolean(result.pageLimitHit));
    } catch {
      setObjects([]);
      setObjTotal(0);
      toast.error(t('admin:r2.objects.loadFailed'));
    } finally {
      setObjLoading(false);
    }
  }, [page, pageSize, namespace, registered, statusFilter, minAgeDays, sort, toast, t]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  // 只在扫描进行中轮询进度（8 秒）：120 秒看不出分片推进。
  // 空闲时完全不轮询 —— 统计来自扫描快照，不刷新也不会变旧；
  // 常驻后台请求只会白烧 D1 的读额度。
  const scanStatus = stats?.scan?.status;
  useEffect(() => {
    if (scanStatus !== 'running') return;
    const timer = setInterval(async () => {
      try {
        const next = await r2AdminApi.getScanState();
        setStats((prev) =>
          prev && prev.scan ? { ...prev, scan: { ...prev.scan, ...next } } : prev
        );
        // 一轮结束后快照才更新，这时必须整份重拉一次
        if (next.status !== 'running') await loadStats(true);
      } catch {
        /* 静默轮询失败不提示，手动刷新可恢复 */
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [scanStatus, loadStats]);

  const handleScanNow = async () => {
    setScanning(true);
    try {
      await r2AdminApi.triggerScan();
      toast.success(t('admin:r2.scan.triggered'));
      await loadStats(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(
        message.includes('429') ? t('admin:r2.rateLimited') : t('admin:r2.scan.triggerFailed')
      );
    } finally {
      setScanning(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const result = await r2AdminApi.previewReclaim({
        days: reclaimDays,
        namespace: reclaimNamespace || undefined,
      });
      setPreview(result);
    } catch {
      toast.error(t('admin:r2.reclaim.previewFailed'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleReclaim = async () => {
    setReclaiming(true);
    try {
      const result = await r2AdminApi.reclaim({
        days: reclaimDays,
        namespace: reclaimNamespace || undefined,
      });
      if (result.deleted > 0) {
        toast.success(
          t('admin:r2.reclaim.success', {
            total: result.deleted.toLocaleString(),
            size: formatBytes(result.bytesFreed),
          })
        );
      } else if (result.failed > 0) {
        toast.error(t('admin:r2.reclaim.failed'));
      } else {
        toast.info(t('admin:r2.reclaim.none'));
      }
      setConfirmOpen(false);
      setConfirmText('');
      setPreview(null);
      await Promise.all([loadStats(true), loadObjects()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('429')) toast.error(t('admin:r2.rateLimited'));
      else if (message.includes('403')) toast.error(t('admin:r2.reclaim.forbidden'));
      else toast.error(t('admin:r2.reclaim.failed'));
    } finally {
      setReclaiming(false);
    }
  };

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setPage(1);
    setter(value);
  };

  const diff = stats?.diff ?? EMPTY_DIFF_STATS;
  const namespaceStats = useMemo<R2NamespaceStat[]>(
    () => (stats?.byNamespace ?? []).filter((row) => row.objects > 0),
    [stats?.byNamespace]
  );
  const maxNamespaceObjects = useMemo(
    () => Math.max(...namespaceStats.map((row) => row.objects), 1),
    [namespaceStats]
  );

  if (loading && !stats) {
    return <div className="text-center py-16 text-surface-500">{t('admin:dataStorage.loading')}</div>;
  }

  if (!stats) {
    return (
      <div className="text-center py-16 text-surface-500">{t('admin:r2.loadFailed')}</div>
    );
  }

  const scan = stats.scan;
  // 快照为空时所有数字都是 0，不能当成「R2 是空的」展示
  const neverScanned = stats.stale;
  const running = scan?.status === 'running';

  return (
    <div className="space-y-5">
      <StoragePageHeader
        title={t('admin:r2.title')}
        description={t('admin:r2.desc')}
        actions={
          <>
            <span
              className={clsx(
                'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium',
                SCAN_STATUS_STYLE[scan?.status ?? 'idle']
              )}
            >
              {t(`admin:r2.scanStatus.${scan?.status ?? 'idle'}`)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleScanNow}
              disabled={scanning || running}
            >
              <ScanLine className={clsx('w-3.5 h-3.5', (scanning || running) && 'animate-pulse')} />
              <span className="ml-1">
                {running ? t('admin:r2.scanning') : t('admin:r2.scanNow')}
              </span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => loadStats()} disabled={loading}>
              <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
              <span className="ml-1">{t('admin:dataStorage.refresh')}</span>
            </Button>
          </>
        }
      />

      {neverScanned && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20 p-4 text-sm text-amber-700 dark:text-amber-300">
          {t('admin:r2.scan.hintFirstRun')}
        </div>
      )}

      {scan?.lastError && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {scan.lastError}
        </div>
      )}

      <StatsGrid>
        <StatCard
          icon={Cloud}
          label={t('admin:r2.stat.r2Objects')}
          value={stats.r2.objects}
          color="blue"
          subLabel={formatBytes(stats.r2.bytes)}
        />
        <StatCard
          icon={Database}
          label={t('admin:r2.stat.ledgerReady')}
          value={stats.ledger.ready}
          color="green"
          subLabel={formatBytes(stats.ledger.bytes)}
        />
        <StatCard
          icon={ImageIcon}
          label={t('admin:r2.stat.business')}
          value={stats.business.recordsWithCover}
          color="purple"
          subLabel={t('admin:r2.stat.businessSub', {
            total: stats.business.distinctCoverHashes.toLocaleString(),
          })}
        />
        <StatCard
          icon={HardDrive}
          label={t('admin:r2.stat.unregistered')}
          value={diff.unregistered.count}
          color="orange"
          subLabel={formatBytes(diff.unregistered.bytes)}
        />
        <StatCard
          icon={AlertTriangle}
          label={t('admin:r2.stat.ledgerMissing')}
          value={diff.ledgerMissing.count}
          color="red"
          subLabel={t('admin:r2.stat.ledgerMissingSub', {
            repairable: diff.ledgerMissing.repairable,
            orphan: diff.ledgerMissing.orphan,
          })}
        />
        <StatCard
          icon={Trash2}
          label={t('admin:r2.stat.reclaimable')}
          value={diff.reclaimable.count}
          color="teal"
          subLabel={t('admin:r2.stat.reclaimableSub', {
            days: diff.reclaimable.days,
            size: formatBytes(diff.reclaimable.bytes),
          })}
        />
      </StatsGrid>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* 差异分布：已登记 / 未登记双色，直接看出偏差落在哪个类别 */}
        <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5 space-y-3">
          <div>
            <h3 className="font-semibold text-surface-900 dark:text-surface-100">
              {t('admin:r2.diff.title')}
            </h3>
            <p className="text-xs text-surface-500 mt-1">{t('admin:r2.diff.hint')}</p>
          </div>
          {namespaceStats.length === 0 ? (
            <p className="text-sm text-surface-400 py-6 text-center">{t('admin:r2.diff.empty')}</p>
          ) : (
            <div className="space-y-2.5">
              {namespaceStats.map((row) => {
                const registeredWidth = (row.registered / maxNamespaceObjects) * 100;
                const unregisteredWidth = (row.unregistered / maxNamespaceObjects) * 100;
                return (
                  <div key={row.namespace} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-surface-700 dark:text-surface-300">
                        {row.namespace}
                      </span>
                      <span className="text-surface-400">
                        {row.objects.toLocaleString()} · {formatBytes(row.bytes)}
                      </span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-surface-100 dark:bg-surface-700">
                      <div
                        className="bg-green-500 dark:bg-green-600"
                        style={{ width: `${registeredWidth}%` }}
                        title={t('admin:r2.diff.registered')}
                      />
                      <div
                        className="bg-amber-400 dark:bg-amber-500"
                        style={{ width: `${unregisteredWidth}%` }}
                        title={t('admin:r2.diff.unregistered')}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-4 pt-1 text-[11px] text-surface-500">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                  {t('admin:r2.diff.registered')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
                  {t('admin:r2.diff.unregistered')}
                </span>
                {stats.r2.unparsed > 0 && (
                  <span className="text-surface-400">
                    {t('admin:r2.diff.unparsed', { total: stats.r2.unparsed.toLocaleString() })}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* 扫描卡片：解释「为什么数字不是实时值」 */}
          <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5 space-y-2.5">
            <h3 className="font-semibold text-surface-900 dark:text-surface-100">
              {t('admin:r2.scan.title')}
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-surface-500">{t('admin:r2.scan.pages')}</dt>
              <dd className="text-surface-700 dark:text-surface-300">
                {scan?.pagesDone.toLocaleString() ?? '-'}
              </dd>
              <dt className="text-surface-500">{t('admin:r2.scan.objects')}</dt>
              <dd className="text-surface-700 dark:text-surface-300">
                {scan?.objectsSeen.toLocaleString() ?? '-'}
              </dd>
              <dt className="text-surface-500">{t('admin:r2.scan.startedAt')}</dt>
              <dd className="text-surface-700 dark:text-surface-300">
                {scan?.startedAt ? formatDate(scan.startedAt) : t('admin:r2.scan.neverScanned')}
              </dd>
              <dt className="text-surface-500">{t('admin:r2.scan.completedAt')}</dt>
              <dd className="text-surface-700 dark:text-surface-300">
                {scan?.completedAt
                  ? formatRelativeTime(scan.completedAt)
                  : t('admin:r2.scan.neverScanned')}
              </dd>
              <dt className="text-surface-500">{t('admin:r2.scan.nextScanAt')}</dt>
              <dd className="text-surface-700 dark:text-surface-300">
                {scan?.nextScanAt ? formatRelativeTime(scan.nextScanAt) : '-'}
              </dd>
            </dl>
            <p className="text-[11px] text-surface-400 pt-1">
              {scan?.mode === 'incremental'
                ? t('admin:r2.scan.noteIncremental')
                : t('admin:r2.scan.note')}
            </p>
            {stats.snapshotAt > 0 && (
              <p className="text-[11px] text-surface-400">
                {t('admin:r2.scan.snapshotAt', { time: formatRelativeTime(stats.snapshotAt) })}
              </p>
            )}
          </div>

          {/* 回收卡片：预览 → 输入确认词 → 执行 */}
          <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5 space-y-3">
            <div>
              <h3 className="font-semibold text-surface-900 dark:text-surface-100">
                {t('admin:r2.reclaim.title')}
              </h3>
              <p className="text-xs text-surface-500 mt-1">{t('admin:r2.reclaim.desc')}</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-surface-500 space-y-1">
                <span className="block">{t('admin:r2.reclaim.days')}</span>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={reclaimDays}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setReclaimDays(Number.isFinite(next) ? next : 0);
                    setPreview(null);
                  }}
                  className="w-24"
                />
              </label>
              <label className="text-xs text-surface-500 space-y-1">
                <span className="block">{t('admin:r2.reclaim.namespace')}</span>
                <select
                  value={reclaimNamespace}
                  onChange={(e) => {
                    setReclaimNamespace(e.target.value);
                    setPreview(null);
                  }}
                  className="h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2 text-sm text-surface-700 dark:text-surface-200"
                >
                  <option value="">{t('admin:r2.objects.allNamespaces')}</option>
                  {NAMESPACES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing || reclaimDays < 1}>
                {previewing ? t('admin:r2.reclaim.previewing') : t('admin:r2.reclaim.preview')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={!preview || preview.candidates === 0 || reclaiming}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="ml-1">{t('admin:r2.reclaim.execute')}</span>
              </Button>
            </div>
            {preview && (
              <div className="rounded-lg bg-surface-50 dark:bg-surface-900/50 p-3 text-xs space-y-1">
                {preview.candidates > 0 ? (
                  <>
                    <div className="text-surface-700 dark:text-surface-300">
                      {t('admin:r2.reclaim.previewResult', {
                        total: preview.candidates.toLocaleString(),
                        size: formatBytes(preview.bytes),
                      })}
                    </div>
                    <div className="text-surface-400">
                      {t('admin:r2.reclaim.previewOldest', {
                        date: preview.oldestUploadedAt
                          ? formatDate(preview.oldestUploadedAt)
                          : '-',
                      })}
                      {preview.hasMore ? ` · ${t('admin:r2.reclaim.hasMore', { limit: 500 })}` : ''}
                    </div>
                  </>
                ) : (
                  <div className="text-surface-500">{t('admin:r2.reclaim.none')}</div>
                )}
              </div>
            )}
            <p className="text-[11px] text-surface-400">{t('admin:r2.note.recover')}</p>
          </div>
        </div>
      </div>

      {/* 对象浏览 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-surface-900 dark:text-surface-100">
            {t('admin:r2.objects.title')}
          </h3>
          <span className="text-xs text-surface-400">
            {t('admin:r2.objects.total', { total: objTotal.toLocaleString() })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={namespace}
            onChange={(e) => resetPage(setNamespace)(e.target.value)}
            className="h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2 text-sm text-surface-700 dark:text-surface-200"
          >
            <option value="">{t('admin:r2.objects.allNamespaces')}</option>
            {NAMESPACES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select
            value={registered}
            onChange={(e) => resetPage(setRegistered)(e.target.value as 'all' | 'yes' | 'no')}
            className="h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2 text-sm text-surface-700 dark:text-surface-200"
          >
            <option value="all">{t('admin:r2.objects.registered.all')}</option>
            <option value="yes">{t('admin:r2.objects.registered.yes')}</option>
            <option value="no">{t('admin:r2.objects.registered.no')}</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => resetPage(setStatusFilter)(e.target.value as 'live' | 'reclaimed' | 'all')}
            className="h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2 text-sm text-surface-700 dark:text-surface-200"
          >
            <option value="live">{t('admin:r2.objects.status.live')}</option>
            <option value="reclaimed">{t('admin:r2.objects.status.reclaimed')}</option>
            <option value="all">{t('admin:r2.objects.status.all')}</option>
          </select>
          <Input
            type="number"
            min={0}
            placeholder={t('admin:r2.objects.minAge')}
            value={minAgeDays}
            onChange={(e) => resetPage(setMinAgeDays)(e.target.value)}
            className="w-32"
          />
          <select
            value={String(pageSize)}
            onChange={(e) => resetPage(setPageSize)(Number(e.target.value))}
            className="h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2 text-sm text-surface-700 dark:text-surface-200"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{t('admin:r2.objects.pageSize', { size })}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => resetPage(setSort)(e.target.value as 'uploaded' | 'size')}
            className="h-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2 text-sm text-surface-700 dark:text-surface-200"
          >
            <option value="uploaded">{t('admin:r2.objects.sort.uploaded')}</option>
            <option value="size">{t('admin:r2.objects.sort.size')}</option>
          </select>
        </div>

        {pageLimitHit && (
          <div className="text-xs text-amber-600 dark:text-amber-400">
            {t('admin:r2.objects.pageLimit')}
          </div>
        )}

        <TableWrapper>
          <table className="w-full text-sm">
            <thead className="bg-surface-50 dark:bg-surface-900/50 text-xs text-surface-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t('admin:r2.objects.colKey')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('admin:r2.objects.colNamespace')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('admin:r2.objects.colSize')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('admin:r2.objects.colUploaded')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('admin:r2.objects.colLastSeen')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('admin:r2.objects.colRegistered')}</th>
              </tr>
            </thead>
            <tbody>
              {objLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-surface-400">
                    {t('admin:dataStorage.loading')}
                  </td>
                </tr>
              ) : objects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-surface-400">
                    {t('admin:r2.objects.empty')}
                  </td>
                </tr>
              ) : (
                objects.map((row) => (
                  <tr
                    key={row.objectKey}
                    className="border-t border-surface-100 dark:border-surface-700/60 hover:bg-surface-50 dark:hover:bg-surface-900/30"
                  >
                    <td className="px-3 py-2 max-w-[22rem]">
                      <span className="block truncate font-mono text-[11px] text-surface-600 dark:text-surface-400" title={row.objectKey}>
                        {row.objectKey}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-surface-600 dark:text-surface-400">{row.namespace}</td>
                    <td className="px-3 py-2 text-right text-surface-600 dark:text-surface-400 whitespace-nowrap">
                      {formatBytes(row.byteSize)}
                    </td>
                    <td className="px-3 py-2 text-surface-500 whitespace-nowrap" title={formatDate(row.uploadedAt)}>
                      {formatRelativeTime(row.uploadedAt)}
                    </td>
                    <td className="px-3 py-2 text-surface-500 whitespace-nowrap" title={formatDate(row.lastSeenAt)}>
                      {formatRelativeTime(row.lastSeenAt)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.registered ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          {t('admin:r2.objects.registeredYes')}
                        </span>
                      ) : row.urlHash === null ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                          {t('admin:r2.objects.unparsed')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          {t('admin:r2.objects.registeredNo')}
                        </span>
                      )}
                      {row.reclaimedAt !== null && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-surface-200 text-surface-500 dark:bg-surface-700 dark:text-surface-400">
                          {t('admin:r2.objects.status.reclaimed')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrapper>

        <Pagination page={page} totalPages={objTotalPages} onPageChange={setPage} />
      </div>

      <div className="rounded-xl bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700 p-4 text-xs text-surface-500 space-y-1">
        <p className="font-medium text-surface-700 dark:text-surface-300">{t('admin:r2.note.title')}</p>
        <p>{t('admin:r2.note.body')}</p>
        <p>{t('admin:r2.note.scope')}</p>
      </div>

      <Modal
        isOpen={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmText('');
        }}
        title={t('admin:r2.reclaim.confirmTitle')}
        size="md"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText('');
              }}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={handleReclaim}
              disabled={confirmText !== 'RECLAIM' || reclaiming}
            >
              {reclaiming ? t('admin:r2.reclaim.previewing') : t('admin:r2.reclaim.execute')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-surface-600 dark:text-surface-300">
            {t('admin:r2.reclaim.confirmBody', {
              total: (preview?.candidates ?? 0).toLocaleString(),
              size: formatBytes(preview?.bytes ?? 0),
            })}
          </p>
          <p className="text-surface-500 text-xs">{t('admin:r2.reclaim.confirmHint')}</p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t('admin:r2.reclaim.confirmPlaceholder')}
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
};
