import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { RefreshCw, MapPin, Monitor, XCircle, Users, Wifi, Clock, Smartphone, MonitorSmartphone, Zap } from 'lucide-react';
import { adminApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from 'react-i18next';
import { Pagination, TableWrapper, StatCard, StatsGrid } from './shared';

export const SessionsTab: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
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
    } catch { toast.error(t('admin:sessions.loadFailed')); } finally { setLoading(false); }
  }, [page, statusFilter, toast, t]);

  const loadStats = useCallback(async () => {
    try { setStats(await adminApi.getSessionsStats()); } catch { toast.error(t('admin:sessions.loadStatsFailed')); }
  }, [toast, t]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const handleTerminate = async (sessionId: string) => {
    if (!confirm(t('admin:sessions.terminateConfirm'))) return;
    try { await adminApi.terminateSession(sessionId); toast.success(t('admin:sessions.terminatedToast')); loadSessions(); loadStats(); } catch { toast.error(t('admin:sessions.opFailed')); }
  };

  const formatExpiry = (seconds: number) => {
    if (seconds <= 0) return t('admin:sessions.expired');
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return t('admin:sessions.time.justNow');
    if (m < 60) return t('admin:sessions.time.minutesAgo', { count: m });
    if (h < 24) return t('admin:sessions.time.hoursAgo', { count: h });
    return t('admin:sessions.time.daysAgo', { count: d });
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'Mobile': return Smartphone;
      case 'Tablet': return MonitorSmartphone;
      default: return Monitor;
    }
  };

  /** 从 User-Agent 提取浏览器名+版本 与 操作系统,合并展示 */
  const parseUserAgent = (ua: string | undefined): { label: string; isMobile: boolean } => {
    if (!ua) return { label: '-', isMobile: false };

    // 操作系统
    let os = 'Unknown';
    let isMobile = false;
    if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
    else if (/Windows NT 6\.3/.test(ua)) os = 'Windows 8.1';
    else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Android ([\d.]+)/.test(ua)) { os = `Android ${ua.match(/Android ([\d.]+)/)?.[1] ?? ''}`.trim(); isMobile = true; }
    else if (/iPhone OS ([\d_]+)/.test(ua)) { os = `iOS ${ua.match(/iPhone OS ([\d_]+)/)?.[1].replace(/_/g, '.') ?? ''}`.trim(); isMobile = true; }
    else if (/iPad;.*OS ([\d_]+)/.test(ua)) { os = `iPadOS ${ua.match(/OS ([\d_]+)/)?.[1].replace(/_/g, '.') ?? ''}`.trim(); isMobile = true; }
    else if (/Mac OS X ([\d_]+)/.test(ua)) os = `macOS ${ua.match(/Mac OS X ([\d_]+)/)?.[1].replace(/_/g, '.') ?? ''}`.trim();
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    // 浏览器(顺序很重要,先匹配特殊标识)
    let browser = 'Unknown';
    if (/Edg\/([\d.]+)/.test(ua)) browser = `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1]?.split('.')[0]}`;
    else if (/OPR\/([\d.]+)/.test(ua)) browser = `Opera ${ua.match(/OPR\/([\d.]+)/)?.[1]?.split('.')[0]}`;
    else if (/Firefox\/([\d.]+)/.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1]?.split('.')[0]}`;
    else if (/Chrome\/([\d.]+)/.test(ua) && !/Edg\//.test(ua)) browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1]?.split('.')[0]}`;
    else if (/Version\/([\d.]+).*Safari/.test(ua)) browser = `Safari ${ua.match(/Version\/([\d.]+)/)?.[1]?.split('.')[0]}`;

    return { label: `${browser} · ${os}`, isMobile };
  };

  return (
    <div className="space-y-4">
      {stats && (
        <StatsGrid>
          <StatCard icon={Wifi} label={t('admin:sessions.stat.active')} value={stats.active} color="green" />
          <StatCard icon={Users} label={t('admin:sessions.stat.onlineUsers')} value={stats.uniqueUsers} color="blue" />
          <StatCard icon={Zap} label={t('admin:sessions.stat.recentlyActive')} value={stats.recentlyActive} color="orange" />
          <StatCard icon={Clock} label={t('admin:sessions.stat.todaySessions')} value={stats.todaySessions} color="purple" />
          <StatCard icon={Monitor} label={t('admin:sessions.stat.total')} value={stats.total} color="teal" />
          {stats.deviceDistribution[0] && (
            <StatCard icon={getDeviceIcon(stats.deviceDistribution[0].device_type)} label={t('admin:sessions.stat.mainDevice')} value={stats.deviceDistribution[0].device_type} subLabel={t('admin:sessions.stat.deviceCount', { count: stats.deviceDistribution[0].count })} color="pink" />
          )}
        </StatsGrid>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm">
            <option value="">{t('admin:sessions.filter.all')}</option><option value="active">{t('admin:sessions.filter.active')}</option><option value="expired">{t('admin:sessions.filter.expired')}</option>
          </select>
          <span className="text-sm text-surface-500">{t('admin:sessions.totalRecords', { count: total })}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadSessions(); loadStats(); }}><RefreshCw className="w-4 h-4 mr-2" />{t('admin:sessions.refresh')}</Button>
      </div>
      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>{[t('admin:sessions.table.colUser'), t('admin:sessions.table.colIp'), t('admin:sessions.table.colDevice'), t('admin:sessions.table.colLastActive'), t('admin:sessions.table.colExpiry'), t('admin:sessions.table.colStatus'), t('admin:sessions.table.colActions')].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500">{t('admin:sessions.table.loading')}</td></tr>
              : sessions.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500">{t('admin:sessions.table.empty')}</td></tr>
              : sessions.map(s => (
                <tr key={s.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                  <td className="px-4 py-3"><div className="font-medium text-surface-900 dark:text-surface-100">{s.username || '-'}</div><div className="text-xs text-surface-500 truncate max-w-[120px]">{s.email || '-'}</div></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-surface-400" /><span>{s.ipAddress || '-'}</span></div></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-1 max-w-[200px]">{(() => { const { label, isMobile } = parseUserAgent(s.userAgent); const Icon = isMobile ? Smartphone : Monitor; return <><Icon className="w-3 h-3 text-surface-400 shrink-0" /><span className="truncate text-surface-500 text-xs" title={s.userAgent}>{label}</span></>; })()}</div></td>
                  <td className="px-4 py-3 text-surface-500">{formatRelativeTime(s.lastActivity)}</td>
                  <td className="px-4 py-3 text-surface-500">{formatExpiry(s.expiresInSeconds)}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', s.isActive ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400')}>
                      {s.isActive ? t('admin:sessions.table.statusActive') : t('admin:sessions.table.statusExpired')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.isActive && <button onClick={() => handleTerminate(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-600" title={t('admin:sessions.table.terminateTitle')}><XCircle className="w-4 h-4" /></button>}
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
