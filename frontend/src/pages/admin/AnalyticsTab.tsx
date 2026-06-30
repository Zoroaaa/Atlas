import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Zap, Users, Server, Search, Globe } from 'lucide-react';
import { adminApi } from '@/services/api';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { Pagination, TableWrapper } from './shared';

export const AnalyticsTab: React.FC = () => {
  const toast = useToast();
  const [stats, setStats] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [activeView, setActiveView] = useState<'overview' | 'events'>('overview');

  const formatDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  useEffect(() => {
    const load = async () => { setLoading(true); try { setStats(await adminApi.getAnalyticsStats(days)); } catch { toast.error('加载分析数据失败'); } finally { setLoading(false); } };
    load();
  }, [days, toast]);

  useEffect(() => {
    if (activeView !== 'events') return;
    const load = async () => { setEventsLoading(true); try { const r = await adminApi.getAnalyticsEvents({ page, pageSize: 20, eventType: eventTypeFilter || undefined }); setEvents(r.items); setTotalPages(r.totalPages); } catch { toast.error('加载事件失败'); } finally { setEventsLoading(false); } };
    load();
  }, [page, eventTypeFilter, activeView, toast]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', days === d ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800')}>近{d}天</button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['overview', 'events'] as const).map(v => (
            <button key={v} onClick={() => setActiveView(v)} className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', activeView === v ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800')}>
              {v === 'overview' ? '统计概览' : '事件列表'}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'overview' && (
        loading ? <div className="text-center py-12 text-surface-500">加载中...</div> : stats && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { title: '总事件数', value: stats.totalEvents, icon: <Zap className="w-6 h-6 text-white" />, color: 'bg-gradient-to-br from-[#d4a853] to-[#f59e0b]' },
                { title: '独立用户', value: stats.uniqueUsers, icon: <Users className="w-6 h-6 text-white" />, color: 'bg-gradient-to-br from-green-500 to-green-600' },
                { title: '独立会话', value: stats.uniqueSessions, icon: <Server className="w-6 h-6 text-white" />, color: 'bg-gradient-to-br from-rose-500 to-rose-600' },
              ].map(c => (
                <div key={c.title} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-surface-500">{c.title}</p><p className="text-2xl font-bold text-surface-900 dark:text-surface-100 mt-1">{c.value.toLocaleString()}</p></div>
                    <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center', c.color)}>{c.icon}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">事件类型分布</h3>
                <div className="space-y-2.5">
                  {(stats.eventsByType || []).slice(0, 8).map((item: any) => {
                    const maxCount = Math.max(...stats.eventsByType.map((e: any) => e.count), 1);
                    return (
                      <div key={item.event_type} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-surface-600 dark:text-surface-400 truncate">{item.event_type}</div>
                        <div className="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2">
                          <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${(item.count / maxCount) * 100}%` }} />
                        </div>
                        <div className="w-12 text-right text-xs font-medium text-surface-700 dark:text-surface-300">{item.count.toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">每小时活跃分布</h3>
                <div className="flex items-end gap-0.5 h-28">
                  {Array.from({ length: 24 }, (_, i) => {
                    const d = (stats.hourlyDistribution || []).find((h: any) => parseInt(h.hour) === i);
                    const count = d?.count || 0;
                    const maxCount = Math.max(...(stats.hourlyDistribution || []).map((h: any) => h.count), 1);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center group" title={`${i}:00 - ${count}次`}>
                        <div className="w-full bg-primary-200 dark:bg-primary-800/50 hover:bg-primary-400 rounded-sm transition-all" style={{ height: `${Math.max((count / maxCount) * 100, 2)}%`, minHeight: '2px' }} />
                        {i % 6 === 0 && <span className="text-[9px] text-surface-400 mt-0.5">{i}h</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">每日事件趋势（近7天）</h3>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-surface-200 dark:border-surface-700"><th className="py-2 text-left text-xs text-surface-500 font-medium">日期</th><th className="py-2 text-right text-xs text-surface-500 font-medium">事件数</th></tr></thead>
                  <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                    {(stats.dailyEvents || []).slice(-7).map((item: any) => (
                      <tr key={item.date} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                        <td className="py-2 text-surface-700 dark:text-surface-300">{item.date}</td>
                        <td className="py-2 text-right font-semibold text-surface-900 dark:text-surface-100">{item.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(stats.topReferers || []).length > 0 && (
                <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                  <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">Top 来源页面</h3>
                  <div className="space-y-2">
                    {stats.topReferers.slice(0, 6).map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-surface-50 dark:bg-surface-900/50">
                        <div className="flex items-center gap-2 min-w-0"><Globe className="w-3 h-3 text-surface-400 shrink-0" /><span className="text-sm text-surface-600 dark:text-surface-400 truncate">{item.referer}</span></div>
                        <span className="text-sm font-semibold text-surface-900 dark:text-surface-100 ml-2 shrink-0">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {activeView === 'events' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Input placeholder="筛选事件类型..." value={eventTypeFilter} onChange={e => { setEventTypeFilter(e.target.value); setPage(1); }} leftIcon={<Search className="w-4 h-4" />} />
          </div>
          <TableWrapper>
            <table className="w-full text-sm">
              <thead className="bg-surface-50 dark:bg-surface-900">
                <tr>{['时间', '用户', '事件类型', 'IP地址', '会话', '详情'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                {eventsLoading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-500">加载中...</td></tr>
                  : events.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-500">暂无数据</td></tr>
                  : events.map(e => (
                    <tr key={e.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                      <td className="px-4 py-3 text-surface-500 text-xs whitespace-nowrap">{formatDate(e.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-surface-900 dark:text-surface-100">{e.username || '匿名'}</td>
                      <td className="px-4 py-3"><span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{e.eventType}</span></td>
                      <td className="px-4 py-3 text-surface-500 text-xs">{e.ipAddress || '-'}</td>
                      <td className="px-4 py-3 text-surface-400 text-xs font-mono">{e.sessionId?.slice(-8) || '-'}</td>
                      <td className="px-4 py-3 text-surface-400 text-xs">{e.eventData && Object.keys(e.eventData).length > 0 ? <span title={JSON.stringify(e.eventData, null, 2)} className="cursor-help underline decoration-dotted text-primary-600">查看</span> : '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </TableWrapper>
        </div>
      )}
    </div>
  );
};
