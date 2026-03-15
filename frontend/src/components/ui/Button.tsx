/**
 * Button - 视觉优化版
 * 功能逻辑不变，仅优化视觉样式
 */
import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'text-white font-semibold',
    'bg-gradient-to-r from-blue-600 to-violet-600',
    'hover:from-blue-700 hover:to-violet-700',
    'shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30',
    'focus:ring-blue-500',
    'dark:from-blue-500 dark:to-violet-500 dark:hover:from-blue-600 dark:hover:to-violet-600',
  ].join(' '),
  secondary: [
    'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100',
    'hover:bg-slate-200 dark:hover:bg-slate-600',
    'focus:ring-slate-400',
    'border border-slate-200 dark:border-slate-600',
  ].join(' '),
  outline: [
    'border-2 border-slate-300 dark:border-slate-600',
    'text-slate-700 dark:text-slate-300',
    'hover:bg-slate-50 dark:hover:bg-slate-800',
    'hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400',
    'focus:ring-slate-400',
  ].join(' '),
  ghost: [
    'text-slate-600 dark:text-slate-400',
    'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100',
    'focus:ring-slate-400',
  ].join(' '),
  danger: [
    'bg-red-600 dark:bg-red-500 text-white',
    'hover:bg-red-700 dark:hover:bg-red-600',
    'shadow-md shadow-red-500/20',
    'focus:ring-red-500',
  ].join(' '),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className,
  disabled,
  children,
  ...props
}) => {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'active:scale-[0.97]',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
};
