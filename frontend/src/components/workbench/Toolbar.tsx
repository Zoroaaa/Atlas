import React from 'react';
import { clsx } from 'clsx';

interface ToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

/** 区段顶部的统计/操作条，浅底 + 下分隔线。 */
export const Toolbar: React.FC<ToolbarProps> = ({ left, right, className }) => (
  <div className={clsx('panel-toolbar', className)}>
    <div className="flex min-w-0 flex-wrap items-center gap-2">{left}</div>
    {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
  </div>
);

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}

/** 全站统一尺寸的分段控件。 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={clsx(
        'flex h-8 items-center rounded-[10px] bg-surface-100 p-0.5 dark:bg-surface-800/60',
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              'flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium transition-colors',
              active
                ? 'bg-white text-primary-600 shadow-sm dark:bg-surface-800 dark:text-primary-300'
                : 'text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200'
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface IconActionProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  className?: string;
}

const ICON_TONE: Record<NonNullable<IconActionProps['tone']>, string> = {
  default: 'text-surface-400 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-800 dark:hover:text-surface-200',
  primary: 'text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20',
  danger: 'text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20',
};

export const IconAction: React.FC<IconActionProps> = ({
  icon,
  label,
  onClick,
  tone = 'default',
  disabled,
  className,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={clsx(
      'flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40',
      ICON_TONE[tone],
      className
    )}
  >
    {icon}
  </button>
);
