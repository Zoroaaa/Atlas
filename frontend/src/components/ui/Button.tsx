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
    'bg-gradient-to-r from-[#d4a853] to-[#f59e0b]',
    'hover:from-[#c49a48] hover:to-[#d97706]',
    'shadow-md shadow-amber-500/20 hover:shadow-lg hover:shadow-amber-500/30',
    'focus:ring-amber-500',
    'dark:from-amber-500 dark:to-amber-400 dark:hover:from-amber-600 dark:hover:to-amber-500',
  ].join(' '),
  secondary: [
    'bg-stone-100 dark:bg-stone-700 text-stone-900 dark:text-stone-100',
    'hover:bg-stone-200 dark:hover:bg-stone-600',
    'focus:ring-stone-400',
    'border border-stone-200 dark:border-stone-600',
  ].join(' '),
  outline: [
    'border-2 border-stone-300 dark:border-stone-600',
    'text-stone-700 dark:text-stone-300',
    'hover:bg-stone-50 dark:hover:bg-stone-800',
    'hover:border-amber-400 dark:hover:border-amber-500 hover:text-amber-700 dark:hover:text-amber-400',
    'focus:ring-stone-400',
  ].join(' '),
  ghost: [
    'text-stone-600 dark:text-stone-400',
    'hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100',
    'focus:ring-stone-400',
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
        'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-stone-900',
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
