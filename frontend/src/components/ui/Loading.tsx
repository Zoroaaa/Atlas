/**
 * Loading / Skeleton - 视觉优化版
 * 功能逻辑不变，优化加载状态视觉效果
 */
import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export const Loading: React.FC<LoadingProps> = ({
  size = 'md',
  text,
  fullScreen = false,
  className,
}) => {
  const content = (
    <div className={clsx('flex flex-col items-center justify-center gap-3', className)}>
      <div className="relative">
        <Loader2 className={clsx('animate-spin text-blue-500 dark:text-blue-400', sizeStyles[size])} />
        {size === 'lg' && (
          <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" style={{ animationDuration: '1.5s' }} />
        )}
      </div>
      {text && (
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{text}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/85 dark:bg-slate-900/85 backdrop-blur-md z-50">
        {content}
      </div>
    );
  }

  return content;
};

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'text',
  width,
  height,
}) => {
  return (
    <div
      className={clsx(
        'bg-slate-200 dark:bg-slate-700/60',
        // Shimmer animation
        'relative overflow-hidden',
        'before:absolute before:inset-0',
        'before:bg-gradient-to-r before:from-transparent before:via-white/40 dark:before:via-slate-600/30 before:to-transparent',
        'before:animate-[shimmer_1.5s_ease-in-out_infinite]',
        variant === 'text' && 'h-4 rounded-lg',
        variant === 'circular' && 'rounded-full',
        variant === 'rectangular' && 'rounded-xl',
        className
      )}
      style={{ width, height }}
    />
  );
};
