import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageSquarePlus, Bug, Lightbulb, MessageCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { feedbackApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';

const TYPE_OPTIONS = [
  {
    value: 'bug' as const,
    labelKey: 'feedback:modal.typeBug',
    icon: Bug,
    activeClass: 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-700',
    iconClass: 'text-red-500',
  },
  {
    value: 'suggestion' as const,
    labelKey: 'feedback:modal.typeSuggestion',
    icon: Lightbulb,
    activeClass: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700',
    iconClass: 'text-amber-500',
  },
  {
    value: 'other' as const,
    labelKey: 'feedback:modal.typeOther',
    icon: MessageCircle,
    activeClass: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700',
    iconClass: 'text-amber-500',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t } = useTranslation(['feedback']);
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
      toast.error(t('feedback:modal.errorTitleMinLength'));
      return;
    }
    if (!content.trim() || content.trim().length < 10) {
      toast.error(t('feedback:modal.errorContentMinLength'));
      return;
    }
    if (!isAuthenticated && (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
      toast.error(t('feedback:modal.errorEmailInvalid'));
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
      toast.error(err.message || t('feedback:modal.errorSubmitFailed'));
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

      <div className="relative w-full sm:max-w-lg bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-gradient-to-r from-amber-50 to-rose-50 dark:from-stone-800/80 dark:to-stone-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center shadow-sm">
              <MessageSquarePlus className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 dark:text-stone-100 text-sm">{t('feedback:modal.title')}</h3>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">{t('feedback:modal.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700 transition-all"
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
            <h4 className="text-lg font-bold text-stone-900 dark:text-stone-100 mb-2">{t('feedback:modal.thankYou')}</h4>
            <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed mb-6">
              {t('feedback:modal.followUpBody')}
              {(isAuthenticated ? user?.email : contactEmail) && (
                <><br />{t('feedback:modal.followUpEmail')}</>
              )}
            </p>
            <button
              onClick={handleClose}
              className="px-6 py-2.5 bg-gradient-to-r from-[#d4a853] to-[#f59e0b] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
            >
              {t('feedback:modal.close')}
            </button>
          </div>
        ) : (
          /* ── 表单 ── */
          <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">

            {/* 反馈类型 */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-2 uppercase tracking-wide">
                {t('feedback:modal.typeLabel')}
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
                          : 'border-stone-200 dark:border-stone-700 text-stone-500 hover:border-stone-300 dark:hover:border-stone-600'
                      )}
                    >
                      <Icon className={clsx('w-4 h-4', active ? opt.iconClass : 'text-stone-400')} />
                      <span className={active ? 'text-stone-800 dark:text-stone-200' : ''}>{t(opt.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 标题 */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">
                {t('feedback:modal.titleLabel')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('feedback:modal.titlePlaceholder')}
                maxLength={100}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-all"
              />
              <p className="text-[11px] text-stone-400 mt-1 text-right">{title.length}/100</p>
            </div>

            {/* 内容 */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">
                {t('feedback:modal.contentLabel')} <span className="text-red-400">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  type === 'bug'
                    ? t('feedback:modal.contentBugPlaceholder')
                    : type === 'suggestion'
                    ? t('feedback:modal.contentSuggestionPlaceholder')
                    : t('feedback:modal.contentOtherPlaceholder')
                }
                rows={5}
                maxLength={2000}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-all resize-none"
              />
              <p className="text-[11px] text-stone-400 mt-1 text-right">{content.length}/2000</p>
            </div>

            {/* 联系邮箱（已登录则显示已有邮箱，未登录必填） */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                <p className="text-xs text-green-700 dark:text-green-400">
                  {t('feedback:modal.emailSentTo')}<strong>{user?.email}</strong>
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5 uppercase tracking-wide">
                  {t('feedback:modal.contactEmailLabel')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder={t('feedback:modal.contactEmailPlaceholder')}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-all"
                />
              </div>
            )}

            {/* 提交按钮 */}
            <div className="pt-2 pb-1">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#d4a853] to-[#f59e0b] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-amber-500/25"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{t('feedback:modal.submitting')}</>
                ) : (
                  <>{t('feedback:modal.submit')}</>
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
