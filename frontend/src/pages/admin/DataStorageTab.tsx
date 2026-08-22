import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { dataStorageApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { getProxyImageUrl } from '@/utils';
import { Pagination, StatCard, StatsGrid, formatRelativeTime } from './shared';
import { useTranslation } from 'react-i18next';
import type {
  DataRecord,
  DataRecordDetail,
  DataRecordSource,
  DataStorageStats,
  DataRecordType,
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

  const [detail, setDetail] = useState<DataRecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await dataStorageApi.getStats());
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
      });
      setRecords(r.items);
      setTotalPages(r.totalPages);
      setTotal(r.total);
    } catch {
      toast.error(t('admin:dataStorage.loadRecordsFailed'));
    } finally {
      setRecordsLoading(false);
    }
  }, [page, typeFilter, statusFilter, search, toast, t]);

  useEffect(() => {
    if (activeView === 'overview') loadStats();
  }, [activeView, loadStats]);

  useEffect(() => {
    if (activeView === 'records') loadRecords();
  }, [activeView, loadRecords]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await dataStorageApi.getRecord(id);
      setDetail(d);
    } catch {
      toast.error(t('admin:dataStorage.loadDetailFailed'));
    } finally {
      setDetailLoading(false);
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
          <Button variant="outline" size="sm" onClick={activeView === 'overview' ? loadStats : loadRecords}>
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
                            {item.count.toLocaleString()}
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
                          {s.count.toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null
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
            <div className="flex gap-2 flex-1 sm:max-w-md sm:ml-auto">
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
                <img
                  src={getProxyImageUrl(detail.cover)}
                  alt={detail.title}
                  className="w-24 h-32 object-cover rounded-lg bg-surface-100 dark:bg-surface-700 shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
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
                  {detail.detailCompleted && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle2 className="w-3 h-3" />
                      {t('admin:dataStorage.detailComplete')}
                    </span>
                  )}
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
            {detail.tags.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1.5">{t('admin:dataStorage.tagsLabel')}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {detail.tags.map((tag, i) => (
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

// ─── 子组件：趋势柱状图 ──────────────────────────────────────────────

const TrendBarChart: React.FC<{ data: Array<{ date: string; count: number }> }> = ({ data }) => {
  const { t } = useTranslation(['admin']);
  const maxCount = Math.max(...(data || []).map((d) => d.count), 1);
  if (!data || data.length === 0) {
    return <p className="text-sm text-surface-400 py-8 text-center">{t('admin:dataStorage.trendEmpty')}</p>;
  }
  return (
    <div className="flex items-end gap-0.5 h-32">
      {data.map((d) => (
        <div
          key={d.date}
          className="flex-1 group relative"
          title={t('admin:dataStorage.trendTooltip', { date: d.date, count: d.count })}
        >
          <div
            className="w-full bg-gradient-to-t from-rose-400 to-pink-400 dark:from-rose-600 dark:to-pink-600 rounded-sm transition-all hover:from-rose-500 hover:to-pink-500"
            style={{ height: `${Math.max((d.count / maxCount) * 100, 2)}%`, minHeight: '2px' }}
          />
        </div>
      ))}
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
          <img
            src={getProxyImageUrl(record.cover)}
            alt={record.title}
            loading="lazy"
            className="w-16 h-22 object-cover rounded-lg bg-surface-100 dark:bg-surface-700 shrink-0"
            style={{ height: '5.5rem' }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = '0';
            }}
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
            {record.detailCompleted && (
              <CheckCircle2 className="w-3 h-3 text-green-500" />
            )}
            {record.status === 'hidden' && (
              <EyeOff className="w-3 h-3 text-orange-500" />
            )}
          </div>
          <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100 line-clamp-2 leading-snug">
            {record.title}
          </h4>
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
