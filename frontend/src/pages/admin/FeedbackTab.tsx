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
import { Pagination, TableWrapper } from './shared';

// ─── helpers ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: React.FC<any>; color: string }> = {
  bug: { label: '问题反馈', icon: Bug, color: 'text-red-500' },
  suggestion: { label: '优化建议', icon: Lightbulb, color: 'text-amber-500' },
  other: { label: '其他', icon: MessageCircle, color: 'text-amber-500' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  processing: { label: '处理中', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  resolved: { label: '已解决', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  closed: { label: '已关闭', color: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-400' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400' },
  normal: { label: '普通', color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  high: { label: '高', color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
  urgent: { label: '紧急', color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
};

const fmtDate = (ts: number | null | undefined) =>
  ts ? new Date(ts).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

// ─── Stats cards ─────────────────────────────────────────────────────────────

const StatsCards: React.FC<{ stats: FeedbackStats | null; loading: boolean }> = ({ stats, loading }) => {
  const cards = [
    { label: '总计', value: stats?.total ?? 0, icon: MessageCircle, color: 'from-[#d4a853] to-[#f59e0b]', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: '待处理', value: stats?.pending ?? 0, icon: Clock, color: 'from-orange-400 to-amber-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    { label: '问题报告', value: stats?.bugs ?? 0, icon: Bug, color: 'from-red-400 to-rose-500', bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: '优化建议', value: stats?.suggestions ?? 0, icon: Lightbulb, color: 'from-amber-400 to-yellow-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: '已解决', value: stats?.resolved ?? 0, icon: CheckCircle2, color: 'from-green-400 to-emerald-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: '紧急', value: stats?.urgent ?? 0, icon: AlertTriangle, color: 'from-red-500 to-orange-600', bg: 'bg-red-50 dark:bg-red-900/20' },
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
              {loading ? '—' : c.value}
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
      toast.error('回复内容至少 5 个字符');
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
        toast.success('反馈已处理，回复邮件已发送！');
      } else if (adminReply.trim() && sendEmail && result.emailError) {
        toast.warning(`反馈已处理，但邮件发送失败：${result.emailError}`);
      } else {
        toast.success('反馈已处理');
      }
      onDone();
    } catch (err: any) {
      toast.error(err.message || '处理失败');
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
    <Modal isOpen={state.open} onClose={onClose} title="处理反馈" size="xl">
      <div className="space-y-5 max-h-[65vh] overflow-y-auto px-1">

        {/* 反馈信息概览 */}
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-stone-50 dark:bg-stone-800 cursor-pointer" onClick={() => setShowDetail(!showDetail)}>
            <div className="flex items-center gap-2.5">
              <TypeIcon className={clsx('w-4 h-4', typeConf.color)} />
              <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">{item.title}</span>
              <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CONFIG[item.status]?.color)}>{STATUS_CONFIG[item.status]?.label}</span>
            </div>
            {showDetail ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
          </div>

          {showDetail && (
            <div className="px-4 py-3 space-y-2 text-sm border-t border-stone-200 dark:border-stone-700">
              <div className="flex gap-2 flex-wrap">
                <span className="text-stone-500">类型：</span><span>{typeConf.label}</span>
                <span className="text-stone-500 ml-4">提交人：</span><span>{item.username || '未登录用户'}</span>
                <span className="text-stone-500 ml-4">时间：</span><span>{fmtDate(item.created_at)}</span>
              </div>
              {contactEmail && (
                <div className="flex gap-2">
                  <span className="text-stone-500">联系邮箱：</span>
                  <span className="text-amber-600 dark:text-amber-400">{contactEmail}</span>
                  {item.email_sent ? <span title="已发送过回复邮件"><MailCheck className="w-4 h-4 text-green-500 ml-1" /></span> : null}
                </div>
              )}
              {item.page_url && (
                <div className="flex gap-2">
                  <span className="text-stone-500">页面：</span>
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
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">处理状态</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="pending">待处理</option>
              <option value="processing">处理中</option>
              <option value="resolved">已解决</option>
              <option value="closed">已关闭</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">优先级</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="low">低</option>
              <option value="normal">普通</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
        </div>

        {/* 回复内容 */}
        <div>
          <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">
            回复用户（将在邮件中展示）
          </label>
          <textarea
            value={adminReply}
            onChange={(e) => setAdminReply(e.target.value)}
            placeholder="填写后用户将通过邮件收到您的回复。如不填写则不发送邮件..."
            rows={4}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
          />
        </div>

        {/* 内部备注 */}
        <div>
          <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">
            内部备注（仅管理员可见，不发送给用户）
          </label>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            placeholder="记录处理进展、关联 Issue 等内部信息..."
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
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">发送回复邮件</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">发送至：{contactEmail}</p>
            </div>
            <Mail className="w-4 h-4 text-amber-500 ml-auto" />
          </div>
        )}

        {adminReply.trim() && !contactEmail && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">该用户没有留下联系邮箱，无法发送回复邮件。</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-stone-200 dark:border-stone-700">
        <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '处理中...' : '确认处理'}
        </Button>
      </div>
    </Modal>
  );
};

// ─── Main FeedbackTab ─────────────────────────────────────────────────────────

export const FeedbackTab: React.FC = () => {
  const toast = useToast();
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
      toast.error('加载反馈列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, priorityFilter, searchText, toast]);

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
      toast.error('获取详情失败');
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
            placeholder="搜索标题或内容..."
            className="flex-1 px-3 py-2 text-sm bg-transparent text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none"
          />
          <button onClick={handleSearch} className="px-3 py-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">
            <Search className="w-4 h-4" />
          </button>
        </div>

        <select value={statusFilter} onChange={handleFilterChange(setStatusFilter)}
          className="px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50">
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="processing">处理中</option>
          <option value="resolved">已解决</option>
          <option value="closed">已关闭</option>
        </select>

        <select value={typeFilter} onChange={handleFilterChange(setTypeFilter)}
          className="px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50">
          <option value="">全部类型</option>
          <option value="bug">问题反馈</option>
          <option value="suggestion">优化建议</option>
          <option value="other">其他</option>
        </select>

        <select value={priorityFilter} onChange={handleFilterChange(setPriorityFilter)}
          className="px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50">
          <option value="">全部优先级</option>
          <option value="urgent">紧急</option>
          <option value="high">高</option>
          <option value="normal">普通</option>
          <option value="low">低</option>
        </select>

        <Button variant="outline" size="sm" onClick={() => { loadItems(); loadStats(); }}>
          <RefreshCw className="w-4 h-4 mr-1.5" />刷新
        </Button>

        <span className="text-xs text-stone-400 ml-auto">共 {total} 条</span>
      </div>

      {/* 表格 */}
      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>
              {['类型', '标题 / 提交人', '状态', '优先级', '邮件', '提交时间', '操作'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-stone-500">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-stone-500">暂无反馈数据</td></tr>
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
                      <span className="text-xs text-stone-600 dark:text-stone-400">{typeConf.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <div className="font-medium text-stone-900 dark:text-stone-100 truncate" title={item.title}>{item.title}</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {item.username ? <span className="text-amber-500">{item.username}</span> : <span className="italic">未登录</span>}
                      {contactEmail && <span className="text-stone-400 ml-1">· {contactEmail}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', statusConf.color)}>{statusConf.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', priorityConf.color)}>{priorityConf.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    {item.email_sent ? (
                      <span className="flex items-center gap-1 text-green-500 text-xs"><MailCheck className="w-3.5 h-3.5" />已发</span>
                    ) : contactEmail ? (
                      <span className="flex items-center gap-1 text-stone-400 text-xs"><Mail className="w-3.5 h-3.5" />未发</span>
                    ) : (
                      <span className="text-stone-300 dark:text-stone-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500 whitespace-nowrap">{fmtDate(item.created_at)}</td>
                  <td className="px-4 py-3">
                    <Button variant="outline" size="sm" onClick={() => openHandle(item)}>
                      {item.status === 'pending' || item.status === 'processing' ? '处理' : '查看'}
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
