/**
 * 系统观测 Tab — 错误监控看板
 * 复用 admin/shared.tsx 的样式与组件，保持与其他 Tab 视觉一致
 */

import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  AlertTriangle, Bug, Server, Monitor, Trash2,
  ChevronRight, X,
} from 'lucide-react';
import { adminApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { Pagination, TableWrapper, StatCard, StatsGrid, formatDate, formatRelativeTime } from './shared';

type ErrorItem = {
  id: string;
  source: string;
  error_type: string;
  message: string;
  stack: string | null;
  url: string | null;
  line_number: number | null;
  column_number: number | null;
  user_id: string | null;
  session_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  fingerprint: string | null;
  created_at: number;
  username: string | null;
};

const sourceLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  frontend: {
    label: '前端',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <Monitor className="w-3 h-3" />,
  },
  backend: {
    label: '后端',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    icon: <Server className="w-3 h-3" />,
  },
};

export const ObservabilityTab: React.FC = () => {
  const toast = useToast();
  const [stats, setStats] = useState<any>(null);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<'' | 'frontend' | 'backend'>('');
  const [errorTypeFilter, setErrorTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<'overview' | 'list'>('overview');
  const [selectedError, setSelectedError] = useState<ErrorItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRelated, setDetailRelated] = useState<any[]>([]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const s = await adminApi.getErrorStats(days);
      setStats(s);
    } catch {
      toast.error('加载错误统计失败');
    } finally {
      setLoading(false);
    }
  }, [days, toast]);

  const loadErrors = useCallback(async () => {
    setErrorsLoading(true);
    try {
      const r = await adminApi.getErrors({
        page,
        pageSize: 20,
        source: sourceFilter || undefined,
        errorType: errorTypeFilter || undefined,
        search: search || undefined,
      });
      setErrors(r.items);
      setTotalPages(r.totalPages);
      setTotal(r.total);
    } catch {
      toast.error('加载错误列表失败');
    } finally {
      setErrorsLoading(false);
    }
  }, [page, sourceFilter, errorTypeFilter, search, toast]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    if (activeView !== 'list') return;
    loadErrors();
  }, [activeView, loadErrors]);

  const loadErrorDetail = async (errorId: string) => {
    setDetailLoading(true);
    try {
      const r = await adminApi.getErrorDetail(errorId);
      setSelectedError(r.error);
      setDetailRelated(r.related || []);
    } catch {
      toast.error('加载错误详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (errorId: string | null, byFingerprint: boolean = false) => {
    if (!errorId) return;
    const target = byFingerprint ? '该指纹的所有错误' : '此错误';
    if (!confirm(`确定删除${target}记录？此操作不可恢复。`)) return;
    try {
      await adminApi.deleteError(errorId, byFingerprint);
      toast.success('已删除');
      if (selectedError?.id === errorId) setSelectedError(null);
      loadErrors();
      loadStats();
    } catch {
      toast.error('删除失败');
    }
  };

  const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

  return (
    <div className="space-y-5">
      {/* 头部：时间窗口 + 视图切换 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {[1, 7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                days === d
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
              )}
            >
              {d === 1 ? '今天' : `近${d}天`}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['overview', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                activeView === v
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
              )}
            >
              {v === 'overview' ? '统计概览' : '错误列表'}
            </button>
          ))}
        </div>
      </div>

      {/* 概览视图 */}
      {activeView === 'overview' && (
        loading ? (
          <div className="text-center py-12 text-surface-500">加载中...</div>
        ) : stats && (
          <div className="space-y-5">
            {/* 统计卡片 */}
            <StatsGrid>
              <StatCard icon={Bug} label="错误总数" value={stats.total} subLabel={`近${days}天`} color="red" />
              <StatCard icon={AlertTriangle} label="今日新增" value={stats.today} color="orange" />
              <StatCard icon={Monitor} label="前端错误" value={stats.frontend} color="blue" />
              <StatCard icon={Server} label="后端错误" value={stats.backend} color="purple" />
              <StatCard icon={Bug} label="独立错误指纹" value={stats.uniqueErrors} subLabel="去重后" color="teal" />
              <StatCard icon={AlertTriangle} label="本周新增" value={stats.week} color="pink" />
            </StatsGrid>

            {/* Top 错误聚合 */}
            <div>
              <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-3">
                高频错误 Top 10（按指纹聚合）
              </h3>
              <TableWrapper>
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 dark:bg-surface-800/50 text-surface-600 dark:text-surface-300">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">来源</th>
                      <th className="px-4 py-2.5 text-left font-medium">类型</th>
                      <th className="px-4 py-2.5 text-left font-medium">消息</th>
                      <th className="px-4 py-2.5 text-right font-medium">次数</th>
                      <th className="px-4 py-2.5 text-left font-medium">最后发生</th>
                      <th className="px-4 py-2.5 text-left font-medium">位置</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                    {(stats.topErrors || []).length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-400">暂无错误</td></tr>
                    ) : (
                      stats.topErrors.map((e: any, i: number) => {
                        const src = sourceLabels[e.source] || sourceLabels.frontend;
                        return (
                          <tr key={i} className="hover:bg-surface-50 dark:hover:bg-surface-800/30 cursor-pointer"
                            onClick={() => {
                              setErrorTypeFilter('');
                              setSourceFilter(e.source === 'frontend' ? 'frontend' : 'backend');
                              setSearch(e.fingerprint);
                              setActiveView('list');
                              setPage(1);
                            }}
                          >
                            <td className="px-4 py-2.5">
                              <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', src.color)}>
                                {src.icon}{src.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-surface-600 dark:text-surface-300 font-mono text-xs">{e.error_type}</td>
                            <td className="px-4 py-2.5 text-surface-700 dark:text-surface-200" title={e.message}>
                              {truncate(e.message, 80)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-red-600 dark:text-red-400">{e.count}</td>
                            <td className="px-4 py-2.5 text-xs text-surface-500">{formatRelativeTime(e.last_seen)}</td>
                            <td className="px-4 py-2.5 text-xs text-surface-500 truncate max-w-xs" title={e.url || ''}>
                              {e.url ? truncate(e.url, 40) : '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </TableWrapper>
            </div>

            {/* 按错误类型分布 */}
            {(stats.byType || []).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-3">
                  错误类型分布
                </h3>
                <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-4">
                  <div className="space-y-2">
                    {stats.byType.map((t: any) => {
                      const pct = stats.total > 0 ? (t.count / stats.total) * 100 : 0;
                      return (
                        <div key={t.error_type} className="flex items-center gap-3">
                          <div className="w-32 text-xs font-mono text-surface-600 dark:text-surface-300 truncate">
                            {t.error_type}
                          </div>
                          <div className="flex-1 h-2 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-rose-500 to-red-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-16 text-right text-xs text-surface-500">{t.count}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 每日趋势 */}
            {(stats.dailyErrors || []).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-3">
                  每日错误趋势
                </h3>
                <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-4">
                  <div className="flex items-end gap-1 h-32">
                    {(() => {
                      const max = Math.max(...stats.dailyErrors.map((d: any) => d.count), 1);
                      return stats.dailyErrors.map((d: any) => (
                        <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                          <div
                            className="w-full bg-gradient-to-t from-rose-500 to-red-400 rounded-t hover:opacity-80 transition-opacity"
                            style={{ height: `${(d.count / max) * 100}%`, minHeight: '4px' }}
                            title={`${d.date}: ${d.count} 次`}
                          />
                          <div className="text-[10px] text-surface-400">{d.date.slice(5)}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* 列表视图 */}
      {activeView === 'list' && (
        <div className="space-y-3">
          {/* 筛选器 */}
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={sourceFilter}
              onChange={e => { setSourceFilter(e.target.value as any); setPage(1); }}
              className="px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200"
            >
              <option value="">全部来源</option>
              <option value="frontend">前端</option>
              <option value="backend">后端</option>
            </select>
            <input
              value={errorTypeFilter}
              onChange={e => { setErrorTypeFilter(e.target.value); setPage(1); }}
              placeholder="错误类型 (如 javascript)"
              className="px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 w-48"
            />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="搜索消息/堆栈/URL"
              className="px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 flex-1 min-w-[200px]"
            />
            <button
              onClick={() => { setSourceFilter(''); setErrorTypeFilter(''); setSearch(''); setPage(1); }}
              className="px-3 py-1.5 rounded-lg text-sm text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800"
            >
              清除
            </button>
            <div className="text-xs text-surface-500 ml-auto">共 {total} 条</div>
          </div>

          {/* 列表 */}
          <TableWrapper>
            <table className="w-full text-sm">
              <thead className="bg-surface-50 dark:bg-surface-800/50 text-surface-600 dark:text-surface-300">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">来源</th>
                  <th className="px-4 py-2.5 text-left font-medium">类型</th>
                  <th className="px-4 py-2.5 text-left font-medium">消息</th>
                  <th className="px-4 py-2.5 text-left font-medium">用户</th>
                  <th className="px-4 py-2.5 text-left font-medium">时间</th>
                  <th className="px-4 py-2.5 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                {errorsLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-400">加载中...</td></tr>
                ) : errors.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-400">暂无错误记录</td></tr>
                ) : (
                  errors.map(e => {
                    const src = sourceLabels[e.source] || sourceLabels.frontend;
                    return (
                      <tr key={e.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/30">
                        <td className="px-4 py-2.5">
                          <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', src.color)}>
                            {src.icon}{src.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-surface-600 dark:text-surface-300 font-mono text-xs">{e.error_type}</td>
                        <td className="px-4 py-2.5 text-surface-700 dark:text-surface-200 max-w-md truncate" title={e.message}>
                          {truncate(e.message, 100)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-surface-500">{e.username || '-'}</td>
                        <td className="px-4 py-2.5 text-xs text-surface-500">{formatRelativeTime(e.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1">
                            <button
                              onClick={() => loadErrorDetail(e.id)}
                              className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 hover:text-primary-600"
                              title="查看详情"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(e.id)}
                              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-500 hover:text-red-500"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </TableWrapper>
        </div>
      )}

      {/* 详情抽屉 */}
      {selectedError && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex justify-end"
          onClick={() => setSelectedError(null)}
        >
          <div
            className="bg-white dark:bg-surface-900 w-full max-w-2xl h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700 px-5 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-surface-900 dark:text-surface-100">错误详情</h3>
              <div className="flex gap-2">
                {selectedError.fingerprint && (
                  <button
                    onClick={() => handleDelete(selectedError.fingerprint, true)}
                    className="text-xs px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    按指纹批量删除
                  </button>
                )}
                <button onClick={() => setSelectedError(null)} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800">
                  <X className="w-5 h-5 text-surface-500" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {detailLoading ? (
                <div className="text-center py-8 text-surface-400">加载中...</div>
              ) : (
                <>
                  {/* 元信息 */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="来源" value={
                      (() => {
                        const src = sourceLabels[selectedError.source] || sourceLabels.frontend;
                        return <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', src.color)}>{src.icon}{src.label}</span>;
                      })()
                    } />
                    <Field label="错误类型" value={<span className="font-mono text-xs">{selectedError.error_type}</span>} />
                    <Field label="发生时间" value={formatDate(selectedError.created_at)} />
                    <Field label="指纹" value={<span className="font-mono text-xs text-surface-500">{selectedError.fingerprint || '-'}</span>} />
                    <Field label="用户" value={selectedError.username || '匿名'} />
                    <Field label="IP" value={selectedError.ip_address || '-'} />
                    <Field label="URL / 路径" value={selectedError.url || '-'} colSpan={2} />
                    {selectedError.line_number != null && (
                      <Field label="行:列" value={`${selectedError.line_number}:${selectedError.column_number ?? '-'}`} />
                    )}
                  </div>

                  {/* 错误消息 */}
                  <div>
                    <div className="text-xs font-semibold text-surface-500 mb-1">消息</div>
                    <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 break-all font-mono">
                      {selectedError.message}
                    </div>
                  </div>

                  {/* 堆栈 */}
                  {selectedError.stack && (
                    <div>
                      <div className="text-xs font-semibold text-surface-500 mb-1">堆栈</div>
                      <pre className="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg p-3 text-xs text-surface-700 dark:text-surface-200 overflow-x-auto whitespace-pre-wrap font-mono max-h-96">
                        {selectedError.stack}
                      </pre>
                    </div>
                  )}

                  {/* User Agent */}
                  {selectedError.user_agent && (
                    <div>
                      <div className="text-xs font-semibold text-surface-500 mb-1">User Agent</div>
                      <div className="text-xs text-surface-600 dark:text-surface-300 break-all">{selectedError.user_agent}</div>
                    </div>
                  )}

                  {/* 同指纹近期错误 */}
                  {detailRelated.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-surface-500 mb-1">
                        同指纹近期发生 ({detailRelated.length})
                      </div>
                      <div className="border border-surface-200 dark:border-surface-700 rounded-lg divide-y divide-surface-100 dark:divide-surface-700 max-h-60 overflow-y-auto">
                        {detailRelated.map(r => (
                          <div key={r.id} className="px-3 py-2 text-xs flex items-center justify-between">
                            <span className="text-surface-600 dark:text-surface-300">{r.ip_address || '未知 IP'}</span>
                            <span className="text-surface-400">{formatRelativeTime(r.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: React.ReactNode; colSpan?: number }> = ({ label, value, colSpan }) => (
  <div className={colSpan === 2 ? 'col-span-2' : ''}>
    <div className="text-xs text-surface-500 mb-0.5">{label}</div>
    <div className="text-sm text-surface-700 dark:text-surface-200 break-all">{value}</div>
  </div>
);
