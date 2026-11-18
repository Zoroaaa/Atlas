/**
 * JAV 详情共享片段：实体链接样式、可点击标签、演员列表与在线播放入口。
 *
 * 搜索详情（JavDetailPanel）与历史/收藏详情（LibraryDetailModal）共用，避免同一套展示逻辑写两遍。
 */
import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ChevronRight, ExternalLink, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Chip } from '@/components/workbench';
import { Modal } from '@/components/ui';
import { FollowButton } from '@/components/follow/FollowButton';
import { JAV_PLAY_PLATFORMS, buildJavPlayUrl } from '@/config/javPlayPlatforms';

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

/**
 * 番号在线播放入口：入口横条 + 平台选择弹窗。
 *
 * 搜索结果详情（JavDetailPanel）与历史/收藏详情（LibraryDetailModal）共用，
 * 番号为空时不渲染，避免生成无效链接。
 */
export const JavPlayOnlineEntry: React.FC<{ code?: string; className?: string }> = ({ code, className }) => {
  const { t } = useTranslation(['jav']);
  const [open, setOpen] = useState(false);
  const playCode = code?.trim();
  if (!playCode) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-xl border border-surface-200 bg-surface-50 px-3.5 py-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-surface-700 dark:bg-surface-800/60 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-500/10 text-success-600 dark:text-success-400">
          <Play className="h-4 w-4 fill-current" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-surface-900 dark:text-surface-100">
            {t('jav:detail.playOnline')}
          </span>
          <span className="block truncate text-[11px] text-surface-500 dark:text-surface-400">
            {t('jav:detail.playOnlineEntryHint', {
              platforms: JAV_PLAY_PLATFORMS.map((platform) => platform.name).join(' / '),
            })}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-surface-400 transition-transform group-hover:translate-x-0.5" />
      </button>

      <Modal
        isOpen={open && !!playCode}
        onClose={() => setOpen(false)}
        title={t('jav:detail.playOnlineTitle')}
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-xs text-surface-500 dark:text-surface-400">
            {t('jav:detail.playOnlineHint', { code: playCode })}
          </p>
          <div className="space-y-1.5">
            {JAV_PLAY_PLATFORMS.map((platform) => {
              const url = buildJavPlayUrl(platform, playCode);
              if (!url) return null;
              return (
                <a
                  key={platform.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-surface-200 px-3 py-2.5 text-sm text-surface-700 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-surface-700 dark:text-surface-200 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
                >
                  <span className="font-medium">{platform.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-surface-400" />
                </a>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
};
