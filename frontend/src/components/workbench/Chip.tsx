import React from 'react';
import { clsx } from 'clsx';

export type ChipTone =
  | 'neutral'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'source'
  | 'proxy';

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  accent: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300',
  success: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
  warning: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
  danger: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
  source: 'bg-surface-100 text-surface-600 dark:bg-surface-800/80 dark:text-surface-400',
  proxy: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
};

interface ChipProps {
  tone?: ChipTone;
  size?: 'xs' | 'sm';
  className?: string;
  /** 内容过长时截断（如 manga:uuid 这类长 ID），默认不截断 */
  truncate?: boolean;
  children: React.ReactNode;
}

export const Chip: React.FC<ChipProps> = ({ tone = 'neutral', size = 'sm', className, truncate = false, children }) => (
  <span
    className={clsx(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-md font-medium',
      truncate ? 'min-w-0 max-w-[9rem]' : 'shrink-0',
      size === 'xs' ? 'h-4 px-1 text-[10px]' : 'h-5 px-1.5 text-[10px]',
      TONE_CLASS[tone],
      className
    )}
  >
    {truncate ? (
      <span className="truncate" title={typeof children === 'string' ? children : undefined}>{children}</span>
    ) : children}
  </span>
);

interface CountBadgeProps {
  children: React.ReactNode;
}

export const CountBadge: React.FC<CountBadgeProps> = ({ children }) => (
  <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-primary-100 px-1.5 text-[10px] font-semibold tabular-nums text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
    {children}
  </span>
);
