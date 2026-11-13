import React from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FollowEntityType, FollowItem } from '@/types';

const ENTITY_TYPE_ORDER: FollowEntityType[] = ['actress', 'director', 'studio', 'label', 'series', 'tag'];

interface FollowFeedToolbarProps {
  follows: FollowItem[];
  /** 当前筛选的关注对象 watch key；空字符串表示全部 */
  filterKey: string;
  onFilterKeyChange: (key: string) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  /** 已提交搜索关键词（非空时展示「返回动态」） */
  activeKeyword: string;
  className?: string;
}

/**
 * 关注动态工具栏：按关注对象（女优/导演/制作商/发行商/系列/标签）筛选 + 关键词集合搜索。
 * 主页与个人中心共用，避免两处实现不一致。
 */
export const FollowFeedToolbar: React.FC<FollowFeedToolbarProps> = ({
  follows,
  filterKey,
  onFilterKeyChange,
  keyword,
  onKeywordChange,
  onSearch,
  onClearSearch,
  activeKeyword,
  className,
}) => {
  const { t } = useTranslation(['follow']);

  const groups = ENTITY_TYPE_ORDER
    .map((type) => ({
      type,
      items: follows.filter((f) => f.entityType === type),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-center ${className ?? ''}`}>
      <select
        value={filterKey}
        onChange={(event) => onFilterKeyChange(event.target.value)}
        aria-label={t('follow:filterLabel')}
        className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-[12px] text-surface-900 focus:ring-2 focus:ring-primary-500 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
      >
        <option value="">{t('follow:filterAllEntities')}</option>
        {groups.map((group) => (
          <optgroup key={group.type} label={t(`follow:entityTypes.${group.type}`)}>
            {group.items.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <form
        className="flex min-w-0 flex-1 items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
          <input
            type="search"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder={t('follow:searchPlaceholder')}
            aria-label={t('follow:searchPlaceholder')}
            className="w-full rounded-lg border border-surface-300 bg-white py-1.5 pl-8 pr-8 text-[12px] text-surface-900 placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
          />
          {keyword ? (
            <button
              type="button"
              onClick={() => onKeywordChange('')}
              aria-label={t('common:buttons.clear')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-primary-600"
        >
          {t('follow:searchAction')}
        </button>
        {activeKeyword ? (
          <button
            type="button"
            onClick={onClearSearch}
            className="shrink-0 rounded-lg px-2 py-1.5 text-[12px] text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-800"
          >
            {t('follow:searchClear')}
          </button>
        ) : null}
      </form>
    </div>
  );
};
