import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  prevLabel?: string;
  nextLabel?: string;
  totalLabel?: string;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onChange,
  prevLabel,
  nextLabel,
  totalLabel,
  className,
}) => {
  if (totalPages <= 1) return null;

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
