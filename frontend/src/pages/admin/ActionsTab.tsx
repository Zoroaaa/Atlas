import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { Search, RefreshCw, Clock, MapPin, Terminal, Activity, Zap, Users, LogIn, AlertTriangle, TrendingUp } from 'lucide-react';
import { adminApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { Pagination, TableWrapper, actionLabels, actionColors, StatCard, StatsGrid, resolveActionLabel } from './shared';
import { useTranslation } from 'react-i18next';

export const ActionsTab: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const toast = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    total: number;
    today: number;
    week: number;
    uniqueUsersToday: number;
    actionsByType: Array<{ action: string; count: number }>;
    loginToday: { success: number; failed: number };
  } | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi.getLogs({
        page,
        pageSize: 20,
        username: userSearch || undefined,
        action: actionFilter || undefined,
      });
      setLogs(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch { toast.error(t('admin:actions.loadLogsFailed')); } finally { setLoading(false); }
  }, [page, userSearch, actionFilter, toast]);

  const loadStats = useCallback(async () => {
    try { setStats(await adminApi.getLogsStats()); } catch { toast.error(t('admin:actions.loadStatsFailed')); }
  }, [toast]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const parseData = (data: string | null): string => {
    if (!data) return '-';
    try { return JSON.stringify(JSON.parse(data), null, 2); } catch { return data; }
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

  return (
    <div className="space-y-4">
      {stats && (
        <StatsGrid>
          <StatCard icon={Activity} label={t('admin:actions.statTotal')} value={stats.total} color="blue" />
          <StatCard icon={Zap} label={t('admin:actions.statTodayActions')} value={stats.today} subLabel={t('admin:actions.statWeek', { count: stats.week })} color="orange" />
          <StatCard icon={Users} label={t('admin:actions.statActiveUsers')} value={stats.uniqueUsersToday} color="green" />
          <StatCard icon={LogIn} label={t('admin:actions.statLoginSuccess')} value={stats.loginToday.success} color="teal" />
          <StatCard icon={AlertTriangle} label={t('admin:actions.statLoginFailed')} value={stats.loginToday.failed} color="red" />
          <StatCard icon={TrendingUp} label={t('admin:actions.statTopAction')} value={stats.actionsByType[0] ? resolveActionLabel(stats.actionsByType[0].action) : '-'} color="purple" />
        </StatsGrid>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-44"><Input placeholder={t('admin:actions.filterUsername')} value={userSearch} onChange={e => { setUserSearch(e.target.value); setPage(1); }} leftIcon={<Search className="w-4 h-4" />} /></div>
          <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm">
            <option value="">{t('admin:actions.allOperations')}</option>
            {Object.entries(actionLabels).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <span className="text-sm text-surface-500">{t('admin:actions.totalCount', { count: total })}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadLogs(); loadStats(); }}><RefreshCw className="w-4 h-4 mr-2" />{t('admin:actions.refresh')}</Button>
      </div>
      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>{['admin:actions.colTime', 'admin:actions.colUser', 'admin:actions.colAction', 'admin:actions.colIp', 'admin:actions.colDetail'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400">{t(h)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-500">{t('admin:actions.loading')}</td></tr>
              : logs.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-500">{t('admin:actions.noData')}</td></tr>
              : logs.map(log => (
                <React.Fragment key={log.id}>
                  <tr className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                    <td className="px-4 py-3 text-surface-500 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-xs"><Clock className="w-3 h-3" />{formatRelativeTime(log.created_at)}</div>
                      <div className="text-xs text-surface-400">{new Date(log.created_at).toLocaleString('zh-CN')}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-surface-900 dark:text-surface-100">{log.username || t('admin:actions.anonymous')}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium', actionColors[log.action] || 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400')}>
                        {resolveActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-surface-500"><div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{log.ip_address || '-'}</div></td>
                    <td className="px-4 py-3">
                      {log.data && log.data !== 'null' && log.data !== '{}' && (
                        <button onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)} className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700">
                          <Terminal className="w-3 h-3" />{expandedLog === log.id ? t('admin:actions.collapse') : t('admin:actions.expand')}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedLog === log.id && (
                    <tr>
                      <td colSpan={5} className="px-4 py-2 bg-surface-50 dark:bg-surface-900/50">
                        <pre className="text-xs text-surface-600 dark:text-surface-400 overflow-x-auto max-h-32 p-2 bg-surface-100 dark:bg-surface-800 rounded">{parseData(log.data)}</pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </TableWrapper>
    </div>
  );
};
