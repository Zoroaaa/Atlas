import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';

export type PaginationVariant = 'compact' | 'bar';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /**
   * compact：页脚居中，显示「当前页 / 总页数」+ 前后箭头（搜索/社区列表）；
   * bar：容器底部整条，左侧分页文案 + 右侧描边按钮（管理后台表格）。
   */
  variant?: PaginationVariant;
  prevLabel?: string;
  nextLabel?: string;
  totalLabel?: string;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onChange,
  variant = 'compact',
  prevLabel,
  nextLabel,
  totalLabel,
  className,
}) => {
  const { t } = useTranslation(['common']);

  if (totalPages <= 1) return null;

  if (variant === 'bar') {
    return (
      <div className={clsx('flex items-center justify-between border-t border-surface-200 px-4 py-3 dark:border-surface-700', className)}>
        <div className="text-sm text-surface-500">{t('common:pagination', { page, totalPages })}</div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            aria-label={prevLabel}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onChange(page + 1)}
            aria-label={nextLabel}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex items-center justify-center gap-2 py-3', className)}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label={prevLabel}
        className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-surface-800 dark:hover:text-surface-200"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {prevLabel ? <span className="hidden sm:inline">{prevLabel}</span> : null}
      </button>
      <span className="type-meta tabular-nums">
        {page} / {totalPages}
        {totalLabel ? <span className="ml-1 text-surface-400">{totalLabel}</span> : null}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label={nextLabel}
        className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-surface-800 dark:hover:text-surface-200"
      >
        {nextLabel ? <span className="hidden sm:inline">{nextLabel}</span> : null}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
