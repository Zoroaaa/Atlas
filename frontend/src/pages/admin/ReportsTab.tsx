import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { RefreshCw } from 'lucide-react';
import { adminApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from 'react-i18next';
import { Pagination, TableWrapper } from './shared';

export const ReportsTab: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [handleModal, setHandleModal] = useState<{ open: boolean; reportId: string }>({ open: false, reportId: '' });
  const [handleForm, setHandleForm] = useState<{ status: 'resolved' | 'dismissed'; action: string; notes: string }>({ status: 'resolved', action: '', notes: '' });

  const formatDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.getReports({ page, pageSize: 20, status: statusFilter });
      setReports(response.items);
      setTotalPages(response.totalPages);
    } catch { toast.error(t('admin:reports.loadFailed')); } finally { setLoading(false); }
  }, [page, statusFilter, toast, t]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleReport = async () => {
    try {
      await adminApi.handleReport(handleModal.reportId, handleForm);
      toast.success(t('admin:reports.handledToast')); setHandleModal({ open: false, reportId: '' }); loadReports();
    } catch { toast.error(t('admin:reports.opFailed')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm">
          <option value="pending">{t('admin:reports.filter.pending')}</option><option value="resolved">{t('admin:reports.filter.resolved')}</option><option value="dismissed">{t('admin:reports.filter.dismissed')}</option>
        </select>
        <Button variant="outline" size="sm" onClick={loadReports}><RefreshCw className="w-4 h-4 mr-2" />{t('admin:reports.refresh')}</Button>
      </div>
      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>{[t('admin:reports.table.colContent'), t('admin:reports.table.colReporter'), t('admin:reports.table.colStatus'), t('admin:reports.table.colTime'), t('admin:reports.table.colActions')].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-500">{t('admin:reports.table.loading')}</td></tr>
              : reports.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-500">{t('admin:reports.table.empty')}</td></tr>
              : reports.map((r: any) => (
                <tr key={r.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                  <td className="px-4 py-3"><div className="font-medium text-surface-900 dark:text-surface-100">{r.title || t('admin:reports.table.unknownPost')}</div><div className="text-xs text-surface-500 mt-0.5">{r.report_reason || '-'}</div></td>
                  <td className="px-4 py-3 text-surface-700 dark:text-surface-300">{r.reporter_username || t('admin:reports.table.anonymous')}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', r.status === 'pending' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : r.status === 'resolved' ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400')}>
                      {r.status === 'pending' ? t('admin:reports.table.statusPending') : r.status === 'resolved' ? t('admin:reports.table.statusResolved') : t('admin:reports.table.statusDismissed')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-500 text-xs">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3">{r.status === 'pending' && <Button variant="outline" size="sm" onClick={() => { setHandleModal({ open: true, reportId: r.id }); setHandleForm({ status: 'resolved', action: '', notes: '' }); }}>{t('admin:reports.table.handleBtn')}</Button>}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </TableWrapper>

      <Modal isOpen={handleModal.open} onClose={() => setHandleModal({ open: false, reportId: '' })} title={t('admin:reports.handleModal.title')}>
        <div className="space-y-4">
          {[{ label: t('admin:reports.handleModal.resultLabel'), key: 'status', options: [{ v: 'resolved', l: t('admin:reports.handleModal.resultResolved') }, { v: 'dismissed', l: t('admin:reports.handleModal.resultDismissed') }] }, { label: t('admin:reports.handleModal.actionLabel'), key: 'action', options: [{ v: '', l: t('admin:reports.handleModal.actionNone') }, { v: 'warn_author', l: t('admin:reports.handleModal.actionWarnAuthor') }, { v: 'remove_source', l: t('admin:reports.handleModal.actionRemoveSource') }] }].map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">{field.label}</label>
              <select value={handleForm[field.key as keyof typeof handleForm]} onChange={e => setHandleForm({ ...handleForm, [field.key]: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800">
                {field.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">{t('admin:reports.handleModal.notesLabel')}</label>
            <textarea value={handleForm.notes} onChange={e => setHandleForm({ ...handleForm, notes: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800" placeholder={t('admin:reports.handleModal.notesPlaceholder')} />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setHandleModal({ open: false, reportId: '' })}>{t('admin:reports.handleModal.cancel')}</Button>
            <Button variant="primary" onClick={handleReport}>{t('admin:reports.handleModal.confirm')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
