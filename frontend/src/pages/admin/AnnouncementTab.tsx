import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  RefreshCw, Plus, Edit3, Trash2,
  Pin, PinOff, Eye, EyeOff, AlertCircle, Info, CheckCircle2, AlertTriangle
} from 'lucide-react';
import { announcementApi, type Announcement, type AnnouncementForm } from '@/services/api/announcement';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from 'react-i18next';
import { Pagination, TableWrapper, formatDate } from './shared';

// ─── 类型样式映射 ─────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: React.FC<any>; color: string; bg: string }> = {
  info: { label: 'admin:announcement.typeInfo', icon: Info, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  warning: { label: 'admin:announcement.typeWarning', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  success: { label: 'admin:announcement.typeSuccess', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
  error: { label: 'admin:announcement.typeError', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
};

const TYPE_BADGE: Record<string, string> = {
  info: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const EMPTY_FORM: AnnouncementForm = {
  title: '',
  content: '',
  type: 'info',
  isPinned: false,
  isActive: true,
  startTime: null,
  endTime: null,
};

// ─── 表单弹窗 ──────────────────────────────────────────────────────────

interface FormModalState {
  open: boolean;
  editItem: Announcement | null;
}

const FormModal: React.FC<{
  state: FormModalState;
  onClose: () => void;
  onDone: () => void;
}> = ({ state, onClose, onDone }) => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state.editItem) {
      setForm({
        title: state.editItem.title,
        content: state.editItem.content,
        type: state.editItem.type,
        isPinned: state.editItem.is_pinned === 1,
        isActive: state.editItem.is_active === 1,
        startTime: state.editItem.start_time,
        endTime: state.editItem?.end_time ?? null,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [state.editItem]);

  const handleSubmit = async () => {
    if (form.title.trim().length < 2) { toast.error(t('admin:announcement.titleMinLength')); return; }
    if (form.content.trim().length < 5) { toast.error(t('admin:announcement.contentMinLength')); return; }
    setSubmitting(true);
    try {
      if (state.editItem) {
        await announcementApi.update(state.editItem.id, form);
        toast.success(t('admin:announcement.updateSuccess'));
      } else {
        await announcementApi.create(form);
        toast.success(t('admin:announcement.createSuccess'));
      }
      onDone();
    } catch (err: any) {
      toast.error(err.message || t('admin:announcement.opFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const isEdit = !!state.editItem;

  return (
    <Modal isOpen={state.open} onClose={onClose} title={isEdit ? t('admin:announcement.editTitle') : t('admin:announcement.publish')} size="lg">
      <div className="space-y-5 max-h-[65vh] overflow-y-auto px-1">
        {/* 标题 */}
        <div>
          <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">{t('admin:announcement.labelTitle')}</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t('admin:announcement.titlePlaceholder')}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>

        {/* 内容 */}
        <div>
          <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">{t('admin:announcement.labelContent')}</label>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder={t('admin:announcement.contentPlaceholder')}
            rows={6}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
          />
        </div>

        {/* 类型 + 开关 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">{t('admin:announcement.labelType')}</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AnnouncementForm['type'] })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="info">{t('admin:announcement.typeInfo')}</option>
              <option value="warning">{t('admin:announcement.typeWarning')}</option>
              <option value="success">{t('admin:announcement.typeSuccess')}</option>
              <option value="error">{t('admin:announcement.typeError')}</option>
            </select>
          </div>
          <div className="flex items-end gap-3">
            <ToggleSwitch label={t('admin:announcement.pinnedLabel')} checked={form.isPinned} onChange={(v) => setForm({ ...form, isPinned: v })} />
            <ToggleSwitch label={t('admin:announcement.enabledLabel')} checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
          </div>
        </div>

        {/* 时间范围 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">{t('admin:announcement.effectiveTime')}</label>
            <input
              type="datetime-local"
              value={form.startTime ? new Date(form.startTime).toISOString().slice(0, 16) : ''}
              onChange={(e) => setForm({ ...form, startTime: e.target.value ? new Date(e.target.value).getTime() : null })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">{t('admin:announcement.expireTime')}</label>
            <input
              type="datetime-local"
              value={form.endTime ? new Date(form.endTime).toISOString().slice(0, 16) : ''}
              onChange={(e) => setForm({ ...form, endTime: e.target.value ? new Date(e.target.value).getTime() : null })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-stone-200 dark:border-stone-700">
        <Button variant="outline" size="sm" onClick={onClose}>{t('admin:announcement.cancel')}</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? t('admin:announcement.submitting') : (isEdit ? t('admin:announcement.saveChanges') : t('admin:announcement.publish'))}
        </Button>
      </div>
    </Modal>
  );
};

// ─── 简单开关组件 ──────────────────────────────────────────────────────

const ToggleSwitch: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={clsx(
      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all',
      checked
        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
        : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500'
    )}
  >
    <div className={clsx('w-4 h-4 rounded flex items-center justify-center border transition-all', checked ? 'bg-amber-500 border-amber-500' : 'border-stone-300')}>
      {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
    </div>
    {label}
  </button>
);

// ─── 主组件 ─────────────────────────────────────────────────────────────

export const AnnouncementTab: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // 弹窗状态
  const [formModal, setFormModal] = useState<FormModalState>({ open: false, editItem: null });
  const [deleteConfirm, setDeleteConfirm] = useState<Announcement | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await announcementApi.adminList({ page, pageSize: 15 });
      setItems(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.total);
    } catch {
      toast.error(t('admin:announcement.loadListFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, toast]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleToggleActive = async (item: Announcement) => {
    try {
      await announcementApi.update(item.id, { isActive: item.is_active === 0 });
      toast.success(item.is_active === 0 ? t('admin:announcement.enabled') : t('admin:announcement.disabled'));
      loadItems();
    } catch (err: any) { toast.error(err.message || t('admin:announcement.opFailed')); }
  };

  const handleTogglePin = async (item: Announcement) => {
    try {
      await announcementApi.update(item.id, { isPinned: item.is_pinned === 0 });
      toast.success(item.is_pinned === 0 ? t('admin:announcement.pinned') : t('admin:announcement.unpinned'));
      loadItems();
    } catch (err: any) { toast.error(err.message || t('admin:announcement.opFailed')); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await announcementApi.delete(deleteConfirm.id);
      toast.success(t('admin:announcement.deleteSuccess'));
      setDeleteConfirm(null);
      loadItems();
    } catch (err: any) { toast.error(err.message || t('admin:announcement.deleteFailed')); }
  };

  return (
    <div className="space-y-6">

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setFormModal({ open: true, editItem: null })}>
            <Plus className="w-4 h-4 mr-1" />{t('admin:announcement.publish')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadItems()}>
            <RefreshCw className="w-4 h-4 mr-1" />{t('admin:announcement.refresh')}
          </Button>
        </div>
        <span className="text-xs text-stone-400">{t('admin:announcement.totalCount', { count: total })}</span>
      </div>

      {/* 表格 */}
      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>
              {['admin:announcement.colTypeTitle', 'admin:announcement.colStatus', 'admin:announcement.colPinned', 'admin:announcement.colPublisher', 'admin:announcement.colCreated', 'admin:announcement.colActions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wide">{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-stone-500">{t('admin:announcement.loading')}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-stone-500">{t('admin:announcement.empty')}</td></tr>
            ) : items.map((item) => {
              const tc = TYPE_CONFIG[item.type] || TYPE_CONFIG.info;
              const TypeIcon = tc.icon;
              return (
                <tr key={item.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
                  <td className="px-4 py-3 max-w-[280px]">
                    <div className="flex items-center gap-2">
                      <TypeIcon className={clsx('w-4 h-4 flex-shrink-0', tc.color)} />
                      <div>
                        <div className="font-medium text-stone-900 dark:text-stone-100 truncate" title={item.title}>{item.title}</div>
                        <div className="text-xs text-stone-500 truncate mt-0.5 line-clamp-1">{item.content}</div>
                      </div>
                      <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0', TYPE_BADGE[item.type])}>{t(tc.label)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleActive(item)} title={item.is_active ? t('admin:announcement.clickDisable') : t('admin:announcement.clickEnable')}>
                      {item.is_active === 1
                        ? <Eye className="w-4 h-4 text-green-500" />
                        : <EyeOff className="w-4 h-4 text-stone-400" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleTogglePin(item)} title={item.is_pinned ? t('admin:announcement.unpin') : t('admin:announcement.pinnedLabel')}>
                      {item.is_pinned === 1
                        ? <Pin className="w-4 h-4 text-red-500" />
                        : <PinOff className="w-4 h-4 text-stone-400" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500">{item.admin_username || '-'}</td>
                  <td className="px-4 py-3 text-xs text-stone-500 whitespace-nowrap">{formatDate(item.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => setFormModal({ open: true, editItem: item })}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <button
                        onClick={() => setDeleteConfirm(item)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title={t('admin:announcement.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </TableWrapper>

      {/* 发布/编辑弹窗 */}
      <FormModal state={formModal} onClose={() => setFormModal({ open: false, editItem: null })} onDone={() => { setFormModal({ open: false, editItem: null }); loadItems(); }} />

      {/* 删除确认 */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title={t('admin:announcement.confirmDelete')}>
        <p className="text-sm text-stone-600 dark:text-stone-400 mb-4">{t('admin:announcement.deleteConfirm', { title: deleteConfirm?.title })}</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>{t('admin:announcement.cancel')}</Button>
          <Button variant="primary" size="sm" onClick={handleDelete} className="!bg-red-500 hover:!bg-red-600">{t('admin:announcement.confirmDeleteButton')}</Button>
        </div>
      </Modal>
    </div>
  );
};
