import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { RefreshCw } from 'lucide-react';
import { adminApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Pagination, TableWrapper } from './shared';

export const ReportsTab: React.FC = () => {
  const toast = useToast();
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
    } catch { toast.error('加载举报列表失败'); } finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleReport = async () => {
    try {
      await adminApi.handleReport(handleModal.reportId, handleForm);
      toast.success('举报已处理'); setHandleModal({ open: false, reportId: '' }); loadReports();
    } catch { toast.error('操作失败'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm">
          <option value="pending">待处理</option><option value="resolved">已解决</option><option value="dismissed">已驳回</option>
        </select>
        <Button variant="outline" size="sm" onClick={loadReports}><RefreshCw className="w-4 h-4 mr-2" />刷新</Button>
      </div>
      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>{['举报内容', '举报人', '状态', '时间', '操作'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-500">加载中...</td></tr>
              : reports.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-500">暂无举报</td></tr>
              : reports.map((r: any) => (
                <tr key={r.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                  <td className="px-4 py-3"><div className="font-medium text-surface-900 dark:text-surface-100">{r.source_name || '未知来源'}</div><div className="text-xs text-surface-500 mt-0.5">{r.reason || '-'}</div></td>
                  <td className="px-4 py-3 text-surface-700 dark:text-surface-300">{r.reporter_username || '匿名'}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', r.status === 'pending' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : r.status === 'resolved' ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400')}>
                      {r.status === 'pending' ? '待处理' : r.status === 'resolved' ? '已解决' : '已驳回'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-500 text-xs">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3">{r.status === 'pending' && <Button variant="outline" size="sm" onClick={() => { setHandleModal({ open: true, reportId: r.id }); setHandleForm({ status: 'resolved', action: '', notes: '' }); }}>处理</Button>}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </TableWrapper>

      <Modal isOpen={handleModal.open} onClose={() => setHandleModal({ open: false, reportId: '' })} title="处理举报">
        <div className="space-y-4">
          {[{ label: '处理结果', key: 'status', options: [{ v: 'resolved', l: '已解决' }, { v: 'dismissed', l: '驳回' }] }, { label: '处理动作', key: 'action', options: [{ v: '', l: '无动作' }, { v: 'warn_author', l: '警告作者' }, { v: 'remove_source', l: '删除搜索源' }] }].map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">{field.label}</label>
              <select value={handleForm[field.key as keyof typeof handleForm]} onChange={e => setHandleForm({ ...handleForm, [field.key]: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800">
                {field.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">处理备注</label>
            <textarea value={handleForm.notes} onChange={e => setHandleForm({ ...handleForm, notes: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800" placeholder="输入处理说明..." />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setHandleModal({ open: false, reportId: '' })}>取消</Button>
            <Button variant="primary" onClick={handleReport}>确认处理</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
