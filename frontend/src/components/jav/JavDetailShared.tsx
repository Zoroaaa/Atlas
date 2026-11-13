import React from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Chip } from '@/components/workbench';
import { FollowButton } from '@/components/follow/FollowButton';

/**
 * 导演 / 制作商 / 发行商 / 系列 / 标签共用的实体链接文字样式。
 * 搜索详情卡片、历史与收藏详情卡片统一引用这里，避免三处各写一份。
 */
export const JAV_ENTITY_LINK_CLASS =
  'text-primary-600 underline decoration-dotted underline-offset-2 transition-colors hover:text-primary-500 dark:text-primary-300';

/** 可点击标签：视觉与导演/制作商/发行商/系列完全一致（黄色文字 + 虚线下划线） */
export const JavTagButton: React.FC<{
  tag: string;
  onClick: () => void;
  className?: string;
}> = ({ tag, onClick, className }) => {
  const { t } = useTranslation(['jav']);
  return (
    <button
      type="button"
      onClick={onClick}
      title={tag}
      aria-label={t('jav:entity.openTagWorks', { name: tag })}
      className={clsx('break-all text-left text-xs', JAV_ENTITY_LINK_CLASS, className)}
    >
      {tag}
    </button>
  );
};

/**
 * 详情卡片里的演员列表：红字红底 + 底部红色下划线，旁挂关注按钮。
 *
 * 搜索结果详情（JavDetailPanel）与历史/收藏详情（LibraryDetailModal）共用，
 * 关注态、已关注展示、取消关注全部走同一个 FollowButton。
 * 点击演员复用现有的女优搜索卡片路径（onActressClick）。
 */
export const JavActressList: React.FC<{
  actresses: string[];
  onActressClick?: (name: string) => void;
  className?: string;
}> = ({ actresses, onActressClick, className }) => {
  const { t } = useTranslation(['jav']);
  const names = Array.from(new Set(actresses.filter((name) => name.trim() !== '')));

  return (
    <div className={clsx('flex flex-wrap items-center gap-1.5', className)}>
      {names.map((name) => (
        <span key={name} className="inline-flex items-center gap-1">
          {onActressClick ? (
            <button
              type="button"
              onClick={() => onActressClick(name)}
              title={name}
              aria-label={t('jav:detail.viewActressWorks', { name })}
              className="rounded-md border-b-2 border-accent-500 transition-all hover:border-accent-600 hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              <Chip tone="accent" size="xs">{name}</Chip>
            </button>
          ) : (
            <Chip tone="accent" size="xs">{name}</Chip>
          )}
          <FollowButton name={name} />
        </span>
      ))}
    </div>
  );
};
