import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageSquarePlus, Bug, Lightbulb, MessageCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/stores';
import { feedbackApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';

const TYPE_OPTIONS = [
  {
    value: 'bug' as const,
    label: '问题反馈',
    icon: Bug,
    activeClass: 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-700',
    iconClass: 'text-red-500',
  },
  {
    value: 'suggestion' as const,
    label: '优化建议',
    icon: Lightbulb,
    activeClass: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700',
    iconClass: 'text-amber-500',
  },
  {
    value: 'other' as const,
    label: '其他',
    icon: MessageCircle,
    activeClass: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700',
    iconClass: 'text-blue-500',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user, isAuthenticated } = useAuthStore();
  const toast = useToast();
  const [type, setType] = useState<'bug' | 'suggestion' | 'other'>('bug');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setType('bug');
    setTitle('');
    setContent('');
    setContactEmail('');
    setSubmitted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim() || title.trim().length < 5) {
      toast.error('标题至少需要 5 个字符');
      return;
    }
    if (!content.trim() || content.trim().length < 10) {
      toast.error('内容至少需要 10 个字符');
      return;
    }
    if (!isAuthenticated && (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
      toast.error('请填写有效的联系邮箱');
      return;
    }

    setSubmitting(true);
    try {
      await feedbackApi.submit({
        type,
        title: title.trim(),
        content: content.trim(),
        contactEmail: isAuthenticated ? undefined : contactEmail,
        pageUrl: window.location.href,
      });
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-slate-800/80 dark:to-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-sm">
              <MessageSquarePlus className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">反馈与建议</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">帮助我们持续改进</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          /* ── 提交成功 ── */
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">感谢您的反馈！</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              我们已收到您的反馈，将尽快进行处理。
              {(isAuthenticated ? user?.email : contactEmail) && (
                <><br />处理结果将通过邮件告知您。</>
              )}
            </p>
            <button
              onClick={handleClose}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-violet-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
            >
              关闭
            </button>
          </div>
        ) : (
          /* ── 表单 ── */
          <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">

            {/* 反馈类型 */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                反馈类型
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setType(opt.value)}
                      className={clsx(
                        'flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all text-xs font-medium',
                        active
                          ? opt.activeClass
                          : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600'
                      )}
                    >
                      <Icon className={clsx('w-4 h-4', active ? opt.iconClass : 'text-slate-400')} />
                      <span className={active ? 'text-slate-800 dark:text-slate-200' : ''}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 标题 */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                标题 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="简要描述您的问题或建议（5~100字）"
                maxLength={100}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1 text-right">{title.length}/100</p>
            </div>

            {/* 内容 */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                详细描述 <span className="text-red-400">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  type === 'bug'
                    ? '请描述问题的复现步骤、出现情景，以及期望的正确行为...'
                    : type === 'suggestion'
                    ? '请描述您希望改进的功能，以及改进后能解决什么问题...'
                    : '请详细描述您的想法...'
                }
                rows={5}
                maxLength={2000}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 transition-all resize-none"
              />
              <p className="text-[11px] text-slate-400 mt-1 text-right">{content.length}/2000</p>
            </div>

            {/* 联系邮箱（已登录则显示已有邮箱，未登录必填） */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                <p className="text-xs text-green-700 dark:text-green-400">
                  处理结果将发送至：<strong>{user?.email}</strong>
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                  联系邮箱 <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="用于接收处理结果通知"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 transition-all"
                />
              </div>
            )}

            {/* 提交按钮 */}
            <div className="pt-2 pb-1">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/25"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />提交中...</>
                ) : (
                  <>提交反馈</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
