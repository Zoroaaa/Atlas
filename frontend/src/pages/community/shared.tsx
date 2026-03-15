import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';

export const StarRating: React.FC<{ rating: number; interactive?: boolean; onRate?: (r: number) => void }> = ({ rating, interactive, onRate }) => {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          className={clsx('w-4 h-4 transition-colors', (hovered || rating) >= star ? 'text-warning-500 fill-warning-500' : 'text-surface-300',
            interactive && 'cursor-pointer hover:scale-110 transition-transform')}
          onMouseEnter={() => interactive && setHovered(star)}
          onMouseLeave={() => interactive && setHovered(0)}
          onClick={() => interactive && onRate && onRate(star)}
        />
      ))}
    </div>
  );
};

export const Pagination: React.FC<{ page: number; totalPages: number; total?: number; onPageChange: (p: number) => void }> = ({ page, totalPages, total, onPageChange }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4">
      {total !== undefined && <span className="text-sm text-surface-500">共 {total} 条</span>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="flex items-center px-3 text-sm text-surface-600 dark:text-surface-400">{page}/{totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = {
    active: { label: '已通过', cls: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
    pending: { label: '待审核', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    rejected: { label: '已拒绝', cls: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400' },
    removed: { label: '已下架', cls: 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400' },
  };
  const c = config[status as keyof typeof config] || config.pending;
  return <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', c.cls)}>{c.label}</span>;
};
