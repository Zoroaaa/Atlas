/**
 * Badge - 视觉优化版
 * 功能逻辑不变，优化视觉样式
 */
import React, { CSSProperties } from 'react';
import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' | 'outline' | 'accent';
  size?: 'sm' | 'md';
  className?: string;
  style?: CSSProperties;
  title?: string;
}

const variantStyles = {
  default: 'bg-slate-100 text-slate-700 dark:bg-slate-700/70 dark:text-slate-300',
  primary: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400 ring-1 ring-blue-200/60 dark:ring-blue-500/20',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 ring-1 ring-emerald-200/60 dark:ring-emerald-500/20',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 ring-1 ring-amber-200/60 dark:ring-amber-500/20',
  error: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400 ring-1 ring-red-200/60 dark:ring-red-500/20',
  info: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400 ring-1 ring-cyan-200/60 dark:ring-cyan-500/20',
  outline: 'bg-transparent border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300',
  accent: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400 ring-1 ring-violet-200/60 dark:ring-violet-500/20',
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  className,
  style,
  title,
}) => {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-semibold rounded-full tracking-tight',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      style={style}
      title={title}
    >
      {children}
    </span>
  );
};
