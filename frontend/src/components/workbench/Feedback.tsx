import React from 'react';
import { clsx } from 'clsx';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

type NoticeTone = 'info' | 'warning' | 'error' | 'success';

const NOTICE_STYLE: Record<NoticeTone, { icon: React.ReactNode; cls: string }> = {
  info: { icon: <Info className="h-4 w-4" />, cls: 'text-primary-600 dark:text-primary-300' },
  warning: { icon: <AlertTriangle className="h-4 w-4" />, cls: 'text-warning-600 dark:text-warning-400' },
  error: { icon: <AlertCircle className="h-4 w-4" />, cls: 'text-error-600 dark:text-error-400' },
  success: { icon: <CheckCircle2 className="h-4 w-4" />, cls: 'text-success-600 dark:text-success-400' },
};

interface NoticeProps {
  tone?: NoticeTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** 扁平提示块：不再使用来源色卡片。 */
export const Notice: React.FC<NoticeProps> = ({ tone = 'info', icon, children, className }) => {
  const style = NOTICE_STYLE[tone];
  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-[10px] bg-surface-50/70 px-3 py-2 text-[12px] dark:bg-surface-900/40',
        style.cls,
        className
      )}
    >
      <span className="shrink-0">{icon ?? style.icon}</span>
      <span className="min-w-0 text-surface-600 dark:text-surface-300">{children}</span>
    </div>
  );
};

interface EmptyBlockProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyBlock: React.FC<EmptyBlockProps> = ({ icon, title, hint, action, className }) => (
  <div className={clsx('flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-[10px] bg-surface-50/60 px-4 text-center dark:bg-surface-900/30', className)}>
    {icon ? <span className="text-surface-400">{icon}</span> : null}
    <p className="text-[13px] font-medium text-surface-600 dark:text-surface-300">{title}</p>
    {hint ? <p className="type-micro text-surface-500">{hint}</p> : null}
    {action ? <div className="mt-1">{action}</div> : null}
  </div>
);

interface LoadingBlockProps {
  rows?: number;
  className?: string;
}

export const LoadingBlock: React.FC<LoadingBlockProps> = ({ rows = 5, className }) => (
  <div className={clsx('space-y-2 py-2', className)}>
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="skeleton h-11 w-full" />
    ))}
  </div>
);
