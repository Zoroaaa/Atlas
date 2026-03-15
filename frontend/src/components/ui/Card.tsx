/**
 * Card - 视觉优化版
 * 功能逻辑不变，优化视觉样式和阴影
 */
import React from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
  children,
  className,
  padding = 'md',
  hover = false,
  onClick,
}) => {
  return (
    <div
      className={clsx(
        'bg-white dark:bg-slate-900/80',
        'rounded-2xl border border-slate-200/80 dark:border-slate-700/50',
        'transition-all duration-200',
        paddingStyles[padding],
        hover && [
          'cursor-pointer',
          'hover:-translate-y-0.5',
          'hover:shadow-lg hover:shadow-blue-500/8 dark:hover:shadow-blue-500/5',
          'hover:border-blue-200 dark:hover:border-blue-700/50',
        ],
        onClick && 'cursor-pointer',
        className
      )}
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' }}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  className,
}) => {
  return (
    <div className={clsx('flex items-start justify-between', className)}>
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export const CardContent: React.FC<CardContentProps> = ({ children, className }) => {
  return <div className={clsx('mt-4', className)}>{children}</div>;
};

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const CardFooter: React.FC<CardFooterProps> = ({ children, className }) => {
  return (
    <div
      className={clsx(
        'mt-4 pt-4 border-t border-slate-100 dark:border-slate-800',
        className
      )}
    >
      {children}
    </div>
  );
};
