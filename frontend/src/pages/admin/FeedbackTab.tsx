import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  RefreshCw, Bug, Lightbulb, MessageCircle, Mail, MailCheck,
  ChevronDown, ChevronUp, Search, AlertTriangle, Clock, CheckCircle2
} from 'lucide-react';
import { feedbackApi } from '@/services/api';
import type { FeedbackItem, FeedbackStats } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from 'react-i18next';
import { Pagination, TableWrapper } from './shared';

// ─── helpers ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: React.FC<any>; color: string }> = {
  bug: { label: 'admin:feedback.type.bug', icon: Bug, color: 'text-red-500' },
  suggestion: { label: 'admin:feedback.type.suggestion', icon: Lightbulb, color: 'text-amber-500' },
  other: { label: 'admin:feedback.type.other', icon: MessageCircle, color: 'text-amber-500' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'admin:feedback.status.pending', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  processing: { label: 'admin:feedback.status.processing', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  resolved: { label: 'admin:feedback.status.resolved', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  closed: { label: 'admin:feedback.status.closed', color: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-400' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'admin:feedback.priority.low', color: 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400' },
  normal: { label: 'admin:feedback.priority.normal', color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  high: { label: 'admin:feedback.priority.high', color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
  urgent: { label: 'admin:feedback.priority.urgent', color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
};

const fmtDate = (ts: number | null | undefined) =>
  ts ? new Date(ts).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

// ─── Stats cards ─────────────────────────────────────────────────────────────

const StatsCards: React.FC<{ stats: FeedbackStats | null; loading: boolean }> = ({ stats, loading }) => {
  const { t } = useTranslation(['admin']);
  const cards = [
    { label: t('admin:feedback.statsCards.total'), value: stats?.total ?? 0, icon: MessageCircle, color: 'from-[#d4a853] to-[#f59e0b]', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: t('admin:feedback.statsCards.pending'), value: stats?.pending ?? 0, icon: Clock, color: 'from-orange-400 to-amber-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    { label: t('admin:feedback.statsCards.bugs'), value: stats?.bugs ?? 0, icon: Bug, color: 'from-red-400 to-rose-500', bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: t('admin:feedback.statsCards.suggestions'), value: stats?.suggestions ?? 0, icon: Lightbulb, color: 'from-amber-400 to-yellow-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: t('admin:feedback.statsCards.resolved'), value: stats?.resolved ?? 0, icon: CheckCircle2, color: 'from-green-400 to-emerald-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: t('admin:feedback.statsCards.urgent'), value: stats?.urgent ?? 0, icon: AlertTriangle, color: 'from-red-500 to-orange-600', bg: 'bg-red-50 dark:bg-red-900/20' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className={clsx('rounded-xl p-4', c.bg, 'border border-stone-200/50 dark:border-stone-700/50')}>
            <div className={clsx('w-8 h-8 rounded-lg bg-gradient-to-br mb-3 flex items-center justify-center', c.color)}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">
              {loading ? t('admin:feedback.statsCards.dash') : c.value}
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{c.label}</div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Handle Modal ─────────────────────────────────────────────────────────────

interface HandleModalState {
  open: boolean;
  item: FeedbackItem | null;
}

const HandleModal: React.FC<{
  state: HandleModalState;
  onClose: () => void;
  onDone: () => void;
}> = ({ state, onClose, onDone }) => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
  const [status, setStatus] = useState<string>('');
  const [priority, setPriority] = useState<string>('');
  const [adminReply, setAdminReply] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    if (state.item) {
      setStatus(state.item.status || 'pending');
      setPriority(state.item.priority || 'normal');
      setAdminReply(state.item.admin_reply || '');
      setAdminNotes(state.item.admin_notes || '');
      setSendEmail(true);
      setShowDetail(false);
    }
  }, [state.item]);

  const handleSubmit = async () => {
    if (!state.item) return;
    if (adminReply && adminReply.trim().length < 5) {
      toast.error(t('admin:feedback.replyTooShort'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await feedbackApi.adminHandle(state.item.id, {
        status: status as any,
        priority: priority as any,
        adminReply: adminReply.trim() || undefined,
        adminNotes: adminNotes.trim() || undefined,
        sendEmail: sendEmail && !!adminReply.trim(),
      });
      if (result.emailSent) {
        toast.success(t('admin:feedback.handledWithEmailToast'));
      } else if (adminReply.trim() && sendEmail && result.emailError) {
        toast.warning(t('admin:feedback.handledButEmailFailedToast', { error: result.emailError }));
      } else {
        toast.success(t('admin:feedback.handledToast'));
      }
      onDone();
    } catch (err: any) {
      toast.error(err.message || t('admin:feedback.handleFailedToast'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!state.item) return null;

  const item = state.item;
  const typeConf = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;
  const TypeIcon = typeConf.icon;
  const contactEmail = item.contact_email || item.user_email;

  return (
    <Modal isOpen={state.open} onClose={onClose} title={t('admin:feedback.handleModal.title')} size="xl">
      <div className="space-y-5 max-h-[65vh] overflow-y-auto px-1">

        {/* 反馈信息概览 */}
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-stone-50 dark:bg-stone-800 cursor-pointer" onClick={() => setShowDetail(!showDetail)}>
            <div className="flex items-center gap-2.5">
              <TypeIcon className={clsx('w-4 h-4', typeConf.color)} />
              <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">{item.title}</span>
              <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CONFIG[item.status]?.color)}>{t(STATUS_CONFIG[item.status]?.label || '')}</span>
            </div>
            {showDetail ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
          </div>

          {showDetail && (
            <div className="px-4 py-3 space-y-2 text-sm border-t border-stone-200 dark:border-stone-700">
              <div className="flex gap-2 flex-wrap">
                <span className="text-stone-500">{t('admin:feedback.handleModal.typeLabel')}</span><span>{t(typeConf.label)}</span>
                <span className="text-stone-500 ml-4">{t('admin:feedback.handleModal.submitterLabel')}</span><span>{item.username || t('admin:feedback.handleModal.unloggedIn')}</span>
                <span className="text-stone-500 ml-4">{t('admin:feedback.handleModal.timeLabel')}</span><span>{fmtDate(item.created_at)}</span>
              </div>
              {contactEmail && (
                <div className="flex gap-2">
                  <span className="text-stone-500">{t('admin:feedback.handleModal.contactEmailLabel')}</span>
                  <span className="text-amber-600 dark:text-amber-400">{contactEmail}</span>
                  {item.email_sent ? <span title={t('admin:feedback.handleModal.emailSentTitle')}><MailCheck className="w-4 h-4 text-green-500 ml-1" /></span> : null}
                </div>
              )}
              {item.page_url && (
                <div className="flex gap-2">
                  <span className="text-stone-500">{t('admin:feedback.handleModal.pageLabel')}</span>
                  <span className="text-xs text-stone-600 dark:text-stone-400 break-all">{item.page_url}</span>
                </div>
              )}
              <div className="mt-2 p-3 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 whitespace-pre-wrap text-xs leading-relaxed">
                {item.content}
              </div>
            </div>
          )}
        </div>

        {/* 状态 + 优先级 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">{t('admin:feedback.handleModal.statusLabel')}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="pending">{t('admin:feedback.status.pending')}</option>
              <option value="processing">{t('admin:feedback.status.processing')}</option>
              <option value="resolved">{t('admin:feedback.status.resolved')}</option>
              <option value="closed">{t('admin:feedback.status.closed')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">{t('admin:feedback.handleModal.priorityLabel')}</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="low">{t('admin:feedback.priority.low')}</option>
              <option value="normal">{t('admin:feedback.priority.normal')}</option>
              <option value="high">{t('admin:feedback.priority.high')}</option>
              <option value="urgent">{t('admin:feedback.priority.urgent')}</option>
            </select>
          </div>
        </div>

        {/* 回复内容 */}
        <div>
          <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">
            {t('admin:feedback.handleModal.replyLabel')}
          </label>
          <textarea
            value={adminReply}
            onChange={(e) => setAdminReply(e.target.value)}
            placeholder={t('admin:feedback.handleModal.replyPlaceholder')}
            rows={4}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
          />
        </div>

        {/* 内部备注 */}
        <div>
          <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">
            {t('admin:feedback.handleModal.notesLabel')}
          </label>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            placeholder={t('admin:feedback.handleModal.notesPlaceholder')}
            rows={2}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
          />
        </div>

        {/* 发送邮件选项 */}
        {adminReply.trim() && contactEmail && (
          <div
            className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 cursor-pointer"
            onClick={() => setSendEmail(!sendEmail)}
          >
            <div className={clsx('w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-all', sendEmail ? 'bg-amber-500 border-amber-500' : 'border-stone-300 dark:border-stone-600')}>
              {sendEmail && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </div>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('admin:feedback.handleModal.sendEmailLabel')}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{t('admin:feedback.handleModal.sendTo', { email: contactEmail })}</p>
            </div>
            <Mail className="w-4 h-4 text-amber-500 ml-auto" />
          </div>
        )}

        {adminReply.trim() && !contactEmail && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">{t('admin:feedback.handleModal.noContactEmailHint')}</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-stone-200 dark:border-stone-700">
        <Button variant="outline" size="sm" onClick={onClose}>{t('admin:feedback.handleModal.cancel')}</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? t('admin:feedback.handleModal.submitting') : t('admin:feedback.handleModal.submit')}
        </Button>
      </div>
    </Modal>
  );
};

// ─── Main FeedbackTab ─────────────────────────────────────────────────────────

export const FeedbackTab: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Handle modal
  const [handleModal, setHandleModal] = useState<HandleModalState>({ open: false, item: null });

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await feedbackApi.adminStats();
      setStats(s);
    } catch {
      /* silent */
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await feedbackApi.adminList({
        page,
        pageSize: 15,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        priority: priorityFilter || undefined,
        search: searchText || undefined,
      });
      setItems(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.total);
    } catch {
      toast.error(t('admin:feedback.loadListFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, priorityFilter, searchText, toast, t]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSearch = () => {
    setSearchText(searchInput);
    setPage(1);
  };

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  const openHandle = async (item: FeedbackItem) => {
    try {
      const detail = await feedbackApi.adminGet(item.id);
      setHandleModal({ open: true, item: detail });
    } catch {
      toast.error(t('admin:feedback.fetchDetailFailed'));
    }
  };

  const onHandleDone = () => {
    setHandleModal({ open: false, item: null });
    loadItems();
    loadStats();
  };

  return (
    <div className="space-y-6">

      {/* 统计卡片 */}
      <StatsCards stats={stats} loading={statsLoading} />

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-[180px] max-w-xs border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden bg-white dark:bg-stone-800">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={t('admin:feedback.searchPlaceholder')}
            className="flex-1 px-3 py-2 text-sm bg-transparent text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none"
          />
          <button onClick={handleSearch} className="px-3 py-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">
            <Search className="w-4 h-4" />
          </button>
        </div>

        <select value={statusFilter} onChange={handleFilterChange(setStatusFilter)}
          className="px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50">
          <option value="">{t('admin:feedback.filterAllStatus')}</option>
          <option value="pending">{t('admin:feedback.status.pending')}</option>
          <option value="processing">{t('admin:feedback.status.processing')}</option>
          <option value="resolved">{t('admin:feedback.status.resolved')}</option>
          <option value="closed">{t('admin:feedback.status.closed')}</option>
        </select>

        <select value={typeFilter} onChange={handleFilterChange(setTypeFilter)}
          className="px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50">
          <option value="">{t('admin:feedback.filterAllType')}</option>
          <option value="bug">{t('admin:feedback.type.bug')}</option>
          <option value="suggestion">{t('admin:feedback.type.suggestion')}</option>
          <option value="other">{t('admin:feedback.type.other')}</option>
        </select>

        <select value={priorityFilter} onChange={handleFilterChange(setPriorityFilter)}
          className="px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50">
          <option value="">{t('admin:feedback.filterAllPriority')}</option>
          <option value="urgent">{t('admin:feedback.priority.urgent')}</option>
          <option value="high">{t('admin:feedback.priority.high')}</option>
          <option value="normal">{t('admin:feedback.priority.normal')}</option>
          <option value="low">{t('admin:feedback.priority.low')}</option>
        </select>

        <Button variant="outline" size="sm" onClick={() => { loadItems(); loadStats(); }}>
          <RefreshCw className="w-4 h-4 mr-1.5" />{t('admin:feedback.refresh')}
        </Button>

        <span className="text-xs text-stone-400 ml-auto">{t('admin:feedback.totalCount', { count: total })}</span>
      </div>

      {/* 表格 */}
      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>
              {[t('admin:feedback.table.colType'), t('admin:feedback.table.colTitle'), t('admin:feedback.table.colStatus'), t('admin:feedback.table.colPriority'), t('admin:feedback.table.colEmail'), t('admin:feedback.table.colTime'), t('admin:feedback.table.colActions')].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-stone-500">{t('admin:feedback.table.loading')}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-stone-500">{t('admin:feedback.table.empty')}</td></tr>
            ) : items.map((item) => {
              const typeConf = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;
              const TypeIcon = typeConf.icon;
              const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
              const priorityConf = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
              const contactEmail = item.contact_email || item.user_email;
              return (
                <tr key={item.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <TypeIcon className={clsx('w-4 h-4 flex-shrink-0', typeConf.color)} />
                      <span className="text-xs text-stone-600 dark:text-stone-400">{t(typeConf.label)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <div className="font-medium text-stone-900 dark:text-stone-100 truncate" title={item.title}>{item.title}</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {item.username ? <span className="text-amber-500">{item.username}</span> : <span className="italic">{t('admin:feedback.table.unloggedIn')}</span>}
                      {contactEmail && <span className="text-stone-400 ml-1">· {contactEmail}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', statusConf.color)}>{t(statusConf.label)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', priorityConf.color)}>{t(priorityConf.label)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {item.email_sent ? (
                      <span className="flex items-center gap-1 text-green-500 text-xs"><MailCheck className="w-3.5 h-3.5" />{t('admin:feedback.table.emailSent')}</span>
                    ) : contactEmail ? (
                      <span className="flex items-center gap-1 text-stone-400 text-xs"><Mail className="w-3.5 h-3.5" />{t('admin:feedback.table.emailNotSent')}</span>
                    ) : (
                      <span className="text-stone-300 dark:text-stone-600 text-xs">{t('admin:feedback.table.dash')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500 whitespace-nowrap">{fmtDate(item.created_at)}</td>
                  <td className="px-4 py-3">
                    <Button variant="outline" size="sm" onClick={() => openHandle(item)}>
                      {item.status === 'pending' || item.status === 'processing' ? t('admin:feedback.table.handleBtn') : t('admin:feedback.table.viewBtn')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </TableWrapper>

      {/* 处理弹窗 */}
      <HandleModal state={handleModal} onClose={() => setHandleModal({ open: false, item: null })} onDone={onHandleDone} />
    </div>
  );
};
