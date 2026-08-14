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
import type {
  DataRecord,
  DataRecordDetail,
  DataRecordSource,
  DataStorageStats,
  DataRecordType,
} from '@/types';

// ─── 类型元数据 ──────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  jav: { label: 'JAV', icon: <Film className="w-3.5 h-3.5" />, color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  anime: { label: '动漫', icon: <Clapperboard className="w-3.5 h-3.5" />, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  movie: { label: '影视', icon: <Film className="w-3.5 h-3.5" />, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  manga: { label: '漫画', icon: <BookOpen className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  novel: { label: '小说', icon: <BookText className="w-3.5 h-3.5" />, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  actress: { label: '女优', icon: <User className="w-3.5 h-3.5" />, color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
};

const TYPE_FILTERS: Array<{ key: '' | DataRecordType; label: string }> = [
  { key: '', label: '全部' },
  { key: 'jav', label: 'JAV' },
  { key: 'anime', label: '动漫' },
  { key: 'movie', label: '影视' },
  { key: 'manga', label: '漫画' },
  { key: 'novel', label: '小说' },
  { key: 'actress', label: '女优' },
];

// ─── 主组件 ──────────────────────────────────────────────────────────

export const DataStorageTab: React.FC = () => {
  const toast = useToast();
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
      toast.error('加载统计数据失败');
    } finally {
      setStatsLoading(false);
    }
  }, [toast]);

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
      toast.error('加载记录失败');
    } finally {
      setRecordsLoading(false);
    }
  }, [page, typeFilter, statusFilter, search, toast]);

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
      toast.error('加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleStatus = async (record: DataRecord | DataRecordDetail) => {
    const next = record.status === 'active' ? 'hidden' : 'active';
    try {
      await dataStorageApi.updateRecordStatus(record.id, next);
      toast.success(next === 'hidden' ? '已隐藏' : '已显示');
      // 刷新列表与详情
      loadRecords();
      if (detail && detail.id === record.id) {
        setDetail({ ...detail, status: next });
      }
    } catch {
      toast.error('操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该记录？关联的来源数据将一并删除。')) return;
    try {
      await dataStorageApi.deleteRecord(id);
      toast.success('删除成功');
      setDetail(null);
      loadRecords();
      loadStats();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleCleanup = async () => {
    if (!confirm('确认清理所有隐藏记录？此操作不可撤销。')) return;
    try {
      const r = await dataStorageApi.cleanup();
      toast.success(`已清理 ${r.deleted} 条隐藏记录`);
      loadStats();
      if (activeView === 'records') loadRecords();
    } catch {
      toast.error('清理失败');
    }
  };

  // 磁力链接复制到剪贴板（magnet: 协议浏览器无法直接打开，供用户粘贴到下载工具）
  const copyToClipboard = async (text: string, label = '链接') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制`);
    } catch {
      toast.error('复制失败');
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
              {v === 'overview' ? '统计概览' : '数据浏览'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={activeView === 'overview' ? loadStats : loadRecords}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="ml-1">刷新</span>
          </Button>
          {isSuperAdmin && stats && stats.hiddenCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleCleanup} className="text-orange-600 dark:text-orange-400">
              <Trash2 className="w-3.5 h-3.5" />
              <span className="ml-1">清理隐藏</span>
            </Button>
          )}
        </div>
      </div>

      {/* 概览视图 */}
      {activeView === 'overview' && (
        statsLoading ? (
          <div className="text-center py-16 text-surface-500">加载中...</div>
        ) : stats ? (
          <div className="space-y-5">
            <StatsGrid>
              <StatCard icon={Database} label="总记录数" value={stats.totalRecords} color="blue" subLabel={`隐藏 ${stats.hiddenCount}`} />
              <StatCard icon={TrendingUp} label="今日新增" value={stats.addedToday} color="green" subLabel={`本周 ${stats.addedThisWeek}`} />
              <StatCard icon={TrendingUp} label="本月新增" value={stats.addedThisMonth} color="teal" />
              <StatCard icon={CheckCircle2} label="详情完成率" value={`${stats.detailCompletionRate}%`} color="purple" subLabel="完整详情占比" />
              <StatCard icon={EyeOff} label="隐藏记录" value={stats.hiddenCount} color="orange" />
            </StatsGrid>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 30天新增趋势 */}
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">近 30 天新增趋势</h3>
                <TrendBarChart data={stats.recordsOverTime} />
              </div>

              {/* 分类分布 */}
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">分类分布</h3>
                <div className="space-y-2.5">
                  {(stats.byType || []).length === 0 ? (
                    <p className="text-sm text-surface-400 py-4 text-center">暂无数据</p>
                  ) : (
                    stats.byType.map((item) => {
                      const maxCount = Math.max(...stats.byType.map((b) => b.count), 1);
                      const meta = TYPE_META[item.type];
                      return (
                        <div key={item.type} className="flex items-center gap-3">
                          <div className="w-20 flex items-center gap-1.5 text-xs text-surface-600 dark:text-surface-400">
                            {meta?.icon}
                            <span>{meta?.label || item.type}</span>
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
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">热门标签 Top 15</h3>
                <div className="flex flex-wrap gap-2">
                  {(stats.topTags || []).length === 0 ? (
                    <p className="text-sm text-surface-400 py-4 text-center w-full">暂无标签</p>
                  ) : (
                    stats.topTags.map((t) => (
                      <span
                        key={t.tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-300"
                        title={`${t.count} 次`}
                      >
                        {t.tag}
                        <span className="text-surface-400">{t.count}</span>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 数据来源贡献 */}
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">数据来源贡献 Top 10</h3>
                <div className="space-y-2">
                  {(stats.topSources || []).length === 0 ? (
                    <p className="text-sm text-surface-400 py-4 text-center">暂无来源数据</p>
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
              {TYPE_FILTERS.map((t) => (
                <button
                  key={t.key || 'all'}
                  onClick={() => {
                    setTypeFilter(t.key);
                    setPage(1);
                  }}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    typeFilter === t.key
                      ? 'bg-rose-500 text-white'
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600'
                  )}
                >
                  {t.label}
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
                <option value="">全部状态</option>
                <option value="active">显示中</option>
                <option value="hidden">已隐藏</option>
              </select>
              <Input
                placeholder="搜索标题或编号..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
          </div>

          <div className="text-sm text-surface-500">共 {total.toLocaleString()} 条记录</div>

          {/* 记录卡片网格 */}
          {recordsLoading ? (
            <div className="text-center py-16 text-surface-500">加载中...</div>
          ) : records.length === 0 ? (
            <div className="text-center py-16 text-surface-500">
              <Database className="w-12 h-12 mx-auto mb-3 text-surface-300 dark:text-surface-700" />
              <p>暂无数据</p>
              <p className="text-xs mt-1">用户搜索有效结果后将自动积累</p>
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
        title="数据记录详情"
        size="full"
      >
        {detailLoading ? (
          <div className="text-center py-16 text-surface-500">加载中...</div>
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
                      {TYPE_META[detail.recordType].label}
                    </span>
                  )}
                  {detail.detailCompleted && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle2 className="w-3 h-3" />
                      详情完整
                    </span>
                  )}
                  {detail.status === 'hidden' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      <EyeOff className="w-3 h-3" />
                      已隐藏
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 break-words">{detail.title}</h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500 dark:text-surface-400">
                  {detail.code && <span>编号：<span className="font-mono text-surface-700 dark:text-surface-300">{detail.code}</span></span>}
                  {detail.releaseDate && <span>发行：{detail.releaseDate}</span>}
                  {detail.duration && <span>时长：{detail.duration}</span>}
                  {detail.publisher && <span>发行商：{detail.publisher}</span>}
                  {detail.sourceCount > 0 && <span>来源数：{detail.sourceCount}</span>}
                </div>
                <div className="mt-1 text-xs text-surface-400">
                  首次采集 {formatRelativeTime(detail.firstSeenAt)} · 更新 {formatRelativeTime(detail.lastUpdatedAt)}
                </div>
              </div>
            </div>

            {/* 演员 */}
            {detail.actors && (
              <div>
                <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1.5">演员</h4>
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
                <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1.5">标签</h4>
                <div className="flex flex-wrap gap-1.5">
                  {detail.tags.map((t, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md text-xs bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 来源链接 */}
            {detail.sources && detail.sources.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1.5">
                  来源链接（{detail.sources.length}）
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
                原始数据（JSON）
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
                <span className="ml-1">{detail.status === 'active' ? '隐藏' : '显示'}</span>
              </Button>
              {isSuperAdmin && (
                <Button variant="outline" size="sm" onClick={() => handleDelete(detail.id)} className="text-red-600 dark:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="ml-1">删除</span>
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
  const maxCount = Math.max(...(data || []).map((d) => d.count), 1);
  if (!data || data.length === 0) {
    return <p className="text-sm text-surface-400 py-8 text-center">暂无趋势数据</p>;
  }
  return (
    <div className="flex items-end gap-0.5 h-32">
      {data.map((d) => (
        <div
          key={d.date}
          className="flex-1 group relative"
          title={`${d.date}：${d.count} 条`}
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
                {meta.label}
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
        title={record.status === 'active' ? '隐藏' : '显示'}
      >
        {record.status === 'active' ? '隐藏' : '显示'}
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
  const [copied, setCopied] = useState(false);
  const isMagnet = source.sourceType === 'magnet';

  const handleCopy = () => {
    if (!source.sourceUrl) return;
    onCopy(source.sourceUrl, '磁力链接');
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
            title="复制磁力链接"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded text-surface-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 shrink-0"
            title="打开链接"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )
      )}
    </div>
  );
};
