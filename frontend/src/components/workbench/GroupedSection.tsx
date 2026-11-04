import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface GroupedHeaderProps {
  cover?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  className?: string;
}

/** 聚合视图的作品分组头部；封面 48×64，标题 2 行，元信息 1 行。 */
export const GroupedHeader: React.FC<GroupedHeaderProps> = ({
  cover,
  title,
  subtitle,
  badges,
  meta,
  expanded,
  onToggle,
  actions,
  className,
}) => (
  <div className={clsx('flex items-center gap-3 px-4 py-3', className)}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex min-w-0 flex-1 items-center gap-3 text-left"
    >
      {cover ? <div className="shrink-0">{cover}</div> : null}
      <div className="min-w-0 flex-1">
        {badges ? <div className="mb-1 flex flex-wrap items-center gap-1">{badges}</div> : null}
        <div className="line-clamp-2 text-[13px] font-semibold leading-snug text-surface-900 dark:text-surface-100">
          {title}
        </div>
        {subtitle ? <p className="type-micro truncate text-surface-500">{subtitle}</p> : null}
        {meta ? <div className="type-micro mt-0.5 truncate text-surface-500">{meta}</div> : null}
      </div>
    </button>
    {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    <span className="shrink-0 text-surface-400">
      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </span>
  </div>
);

export interface GroupedFilterOption {
  value: string;
  label: React.ReactNode;
  count?: number;
}

interface GroupedFilterBarProps {
  sortLabel?: string;
  sortOptions: GroupedFilterOption[];
  sortValue: string;
  onSortChange: (value: string) => void;
  filterLabel?: string;
  filterOptions?: GroupedFilterOption[];
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  extra?: React.ReactNode;
  className?: string;
}

export const GroupedFilterBar: React.FC<GroupedFilterBarProps> = ({
  sortLabel,
  sortOptions,
  sortValue,
  onSortChange,
  filterLabel,
  filterOptions,
  filterValue,
  onFilterChange,
  extra,
  className,
}) => (
  <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pb-2', className)}>
    {sortLabel ? <span className="type-micro text-surface-500">{sortLabel}</span> : null}
    <div className="flex flex-wrap items-center gap-1">
      {sortOptions.map((option) => (
        <FilterChip key={option.value} active={option.value === sortValue} onClick={() => onSortChange(option.value)}>
          {option.label}
          {option.count !== undefined ? <span className="ml-0.5 opacity-70">{option.count}</span> : null}
        </FilterChip>
      ))}
    </div>
    {filterOptions && filterOptions.length > 0 && onFilterChange ? (
      <>
        {filterLabel ? <span className="type-micro text-surface-500">{filterLabel}</span> : null}
        <div className="flex flex-wrap items-center gap-1">
          {filterOptions.map((option) => (
            <FilterChip
              key={option.value}
              active={option.value === (filterValue ?? 'all')}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
              {option.count !== undefined ? <span className="ml-0.5 opacity-70">{option.count}</span> : null}
            </FilterChip>
          ))}
        </div>
      </>
    ) : null}
    {extra}
  </div>
);

const FilterChip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      'h-5 rounded-md px-1.5 text-[10px] font-medium transition-colors',
      active
        ? 'bg-primary-500 text-white'
        : 'bg-surface-100 text-surface-500 hover:bg-surface-200 dark:bg-surface-800/60 dark:text-surface-400 dark:hover:bg-surface-700'
    )}
  >
    {children}
  </button>
);
