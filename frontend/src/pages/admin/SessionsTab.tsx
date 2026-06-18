import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { RefreshCw, MapPin, Monitor, XCircle, Users, Wifi, Clock, Smartphone, MonitorSmartphone, Zap } from 'lucide-react';
import { adminApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Pagination, TableWrapper, StatCard, StatsGrid } from './shared';

export const SessionsTab: React.FC = () => {
  const toast = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('active');
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{
    total: number;
    active: number;
    uniqueUsers: number;
    recentlyActive: number;
    todaySessions: number;
    deviceDistribution: Array<{ device_type: string; count: number }>;
  } | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi.getSessions({ page, pageSize: 20, status: statusFilter || undefined });
      setSessions(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch { toast.error('加载会话失败'); } finally { setLoading(false); }
  }, [page, statusFilter, toast]);

  const loadStats = useCallback(async () => {
    try { setStats(await adminApi.getSessionsStats()); } catch { toast.error('加载统计数据失败'); }
  }, [toast]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const handleTerminate = async (sessionId: string) => {
    if (!confirm('确定要强制终止此会话吗？')) return;
    try { await adminApi.terminateSession(sessionId); toast.success('会话已终止'); loadSessions(); loadStats(); } catch { toast.error('操作失败'); }
  };

  const formatExpiry = (seconds: number) => {
    if (seconds <= 0) return '已过期';
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m}分钟前`;
    if (h < 24) return `${h}小时前`;
    return `${d}天前`;
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'Mobile': return Smartphone;
      case 'Tablet': return MonitorSmartphone;
      default: return Monitor;
    }
  };

  return (
    <div className="space-y-4">
      {stats && (
        <StatsGrid>
          <StatCard icon={Wifi} label="活跃会话" value={stats.active} color="green" />
          <StatCard icon={Users} label="在线用户" value={stats.uniqueUsers} color="blue" />
          <StatCard icon={Zap} label="1小时内活跃" value={stats.recentlyActive} color="orange" />
          <StatCard icon={Clock} label="今日新会话" value={stats.todaySessions} color="purple" />
          <StatCard icon={Monitor} label="总会话记录" value={stats.total} color="teal" />
          {stats.deviceDistribution[0] && (
            <StatCard icon={getDeviceIcon(stats.deviceDistribution[0].device_type)} label="主要设备" value={stats.deviceDistribution[0].device_type} subLabel={`${stats.deviceDistribution[0].count} 个`} color="pink" />
          )}
        </StatsGrid>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm">
            <option value="">全部会话</option><option value="active">活跃会话</option><option value="expired">已过期</option>
          </select>
          <span className="text-sm text-surface-500">共 {total} 条记录</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadSessions(); loadStats(); }}><RefreshCw className="w-4 h-4 mr-2" />刷新</Button>
      </div>
      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>{['用户', 'IP地址', '设备', '最后活跃', '剩余时间', '状态', '操作'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500">加载中...</td></tr>
              : sessions.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500">暂无数据</td></tr>
              : sessions.map(s => (
                <tr key={s.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                  <td className="px-4 py-3"><div className="font-medium text-surface-900 dark:text-surface-100">{s.username || '-'}</div><div className="text-xs text-surface-500 truncate max-w-[120px]">{s.email || '-'}</div></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-surface-400" /><span>{s.ipAddress || '-'}</span></div></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-1 max-w-[160px]"><Monitor className="w-3 h-3 text-surface-400 shrink-0" /><span className="truncate text-surface-500 text-xs">{s.userAgent?.split(' ')[0] || '-'}</span></div></td>
                  <td className="px-4 py-3 text-surface-500">{formatRelativeTime(s.lastActivity)}</td>
                  <td className="px-4 py-3 text-surface-500">{formatExpiry(s.expiresInSeconds)}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', s.isActive ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400')}>
                      {s.isActive ? '活跃' : '已过期'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.isActive && <button onClick={() => handleTerminate(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-600" title="终止会话"><XCircle className="w-4 h-4" /></button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </TableWrapper>
    </div>
  );
};
