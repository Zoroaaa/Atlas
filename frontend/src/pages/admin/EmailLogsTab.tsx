import React, { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, Clock, MapPin, Inbox } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { adminApi, EmailLogRow, EmailQueueRow } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/hooks/useNotification';
import { Pagination, TableWrapper, formatDate, formatRelativeTime } from './shared';

const EMAIL_TYPES = [
  'registration',
  'forgot_password',
  'email_change',
  'email_verify',
  'account_delete',
] as const;

const QUEUE_TYPES = [
  'follow.new_work',
  'follow.release_soon',
  'community.like',
  'community.comment',
  'community.favorite',
  'community.report_resolved',
  'site.announcement',
] as const;

const LOG_STATUS = ['sent', 'failed'] as const;
const QUEUE_STATUS = ['pending', 'sent', 'skipped', 'failed'] as const;

const statusClass = (status: string) => clsx(
  'inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium',
  status === 'sent' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  status === 'failed' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  status === 'skipped' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  status === 'pending' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
);

export const EmailLogsTab: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const toast = useToast();
  const [tab, setTab] = useState<'logs' | 'queue'>('logs');

  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [queue, setQueue] = useState<EmailQueueRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queuePage, setQueuePage] = useState(1);
  const [queueTotalPages, setQueueTotalPages] = useState(1);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueType, setQueueType] = useState('');
  const [queueStatus, setQueueStatus] = useState('');

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const result = await adminApi.getEmailLogs({
        page: logsPage,
        pageSize: 20,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
      });
      setLogs(result.items);
      setLogsTotal(result.total);
      setLogsTotalPages(result.totalPages);
    } catch {
      toast.error(t('admin:emailLogs.loadFailed'));
    } finally {
      setLogsLoading(false);
    }
  }, [logsPage, typeFilter, statusFilter, toast, t]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const result = await adminApi.getEmailQueue({
        page: queuePage,
        pageSize: 20,
        type: queueType || undefined,
        status: queueStatus || undefined,
      });
      setQueue(result.items);
      setQueueTotal(result.total);
      setQueueTotalPages(result.totalPages);
    } catch {
      toast.error(t('admin:emailLogs.loadFailed'));
    } finally {
      setQueueLoading(false);
    }
  }, [queuePage, queueType, queueStatus, toast, t]);

  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);
  useEffect(() => { if (tab === 'queue') loadQueue(); }, [tab, loadQueue]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs
          tabs={[
            { id: 'logs', label: t('admin:emailLogs.tabs.logs'), icon: <Mail className="w-4 h-4" /> },
            { id: 'queue', label: t('admin:emailLogs.tabs.queue'), icon: <Inbox className="w-4 h-4" /> },
          ]}
          activeTab={tab}
          onChange={(id) => setTab(id as 'logs' | 'queue')}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => (tab === 'logs' ? loadLogs() : loadQueue())}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          {t('admin:emailLogs.refresh')}
        </Button>
      </div>

      {tab === 'logs' ? (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setLogsPage(1); }}
              className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
            >
              <option value="">{t('admin:emailLogs.allTypes')}</option>
              {EMAIL_TYPES.map((type) => (
                <option key={type} value={type}>{t(`admin:emailLogs.types.${type}`)}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setLogsPage(1); }}
              className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
            >
              <option value="">{t('admin:emailLogs.allStatus')}</option>
              {LOG_STATUS.map((status) => (
                <option key={status} value={status}>{t(`admin:emailLogs.status.${status}`)}</option>
              ))}
            </select>
            <span className="text-sm text-surface-500">{t('admin:emailLogs.totalCount', { count: logsTotal })}</span>
          </div>

          <TableWrapper>
            <table className="w-full text-sm">
              <thead className="bg-surface-50 dark:bg-surface-900">
                <tr>
                  {['time', 'user', 'recipient', 'type', 'status', 'subject', 'ip'].map((key) => (
                    <th key={key} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400">
                      {t(`admin:emailLogs.columns.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                {logsLoading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500">{t('admin:emailLogs.loading')}</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500">{t('admin:emailLogs.noData')}</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                    <td className="px-4 py-3 text-surface-500 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-xs"><Clock className="w-3 h-3" />{formatRelativeTime(log.created_at)}</div>
                      <div className="text-xs text-surface-400">{formatDate(log.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-surface-900 dark:text-surface-100">{log.username || '-'}</td>
                    <td className="px-4 py-3 text-surface-600 dark:text-surface-300">{log.recipient_email}</td>
                    <td className="px-4 py-3 text-surface-500">{t(`admin:emailLogs.types.${log.email_type}`, { defaultValue: log.email_type })}</td>
                    <td className="px-4 py-3">
                      <span className={statusClass(log.send_status)}>
                        {t(`admin:emailLogs.status.${log.send_status}`, { defaultValue: log.send_status })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-surface-500 max-w-[220px] truncate" title={log.subject || ''}>{log.subject || '-'}</td>
                    <td className="px-4 py-3 text-surface-500 whitespace-nowrap">
                      <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{log.ip_address || '-'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.some((log) => log.send_error) && (
              <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400 space-y-1">
                {logs.filter((log) => log.send_error).map((log) => (
                  <div key={log.id} className="truncate" title={log.send_error || ''}>
                    {log.recipient_email}: {log.send_error}
                  </div>
                ))}
              </div>
            )}
            <Pagination page={logsPage} totalPages={logsTotalPages} onPageChange={setLogsPage} />
          </TableWrapper>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={queueType}
              onChange={(e) => { setQueueType(e.target.value); setQueuePage(1); }}
              className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
            >
              <option value="">{t('admin:emailLogs.allTypes')}</option>
              {QUEUE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <select
              value={queueStatus}
              onChange={(e) => { setQueueStatus(e.target.value); setQueuePage(1); }}
              className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
            >
              <option value="">{t('admin:emailLogs.allStatus')}</option>
              {QUEUE_STATUS.map((status) => (
                <option key={status} value={status}>{t(`admin:emailLogs.status.${status}`)}</option>
              ))}
            </select>
            <span className="text-sm text-surface-500">{t('admin:emailLogs.totalCount', { count: queueTotal })}</span>
          </div>

          <TableWrapper>
            <table className="w-full text-sm">
              <thead className="bg-surface-50 dark:bg-surface-900">
                <tr>
                  {['time', 'user', 'queueTitle', 'queueType', 'status', 'reason'].map((key) => (
                    <th key={key} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400">
                      {t(`admin:emailLogs.columns.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                {queueLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-500">{t('admin:emailLogs.loading')}</td></tr>
                ) : queue.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-500">{t('admin:emailLogs.noData')}</td></tr>
                ) : queue.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                    <td className="px-4 py-3 text-surface-500 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-xs"><Clock className="w-3 h-3" />{formatRelativeTime(item.created_at)}</div>
                      <div className="text-xs text-surface-400">{formatDate(item.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-surface-900 dark:text-surface-100">
                      {item.username || '-'}
                      <div className="text-xs text-surface-400">{item.user_email || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-surface-600 dark:text-surface-300 max-w-[260px] truncate" title={item.title}>{item.title}</td>
                    <td className="px-4 py-3 text-surface-500">{item.type}</td>
                    <td className="px-4 py-3">
                      <span className={statusClass(item.status)}>
                        {t(`admin:emailLogs.status.${item.status}`, { defaultValue: item.status })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-surface-500 max-w-[260px] truncate" title={item.last_error || ''}>
                      {item.last_error || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={queuePage} totalPages={queueTotalPages} onPageChange={setQueuePage} />
          </TableWrapper>
        </>
      )}
    </div>
  );
};
