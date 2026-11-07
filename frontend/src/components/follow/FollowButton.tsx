import React from 'react';
import { Check, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useFollows, useFollowActions } from '@/hooks';

interface FollowButtonProps {
  name: string;
  /** JavBus 女优 key；只有名字时（如热门女优、影片演员）留空，由后端解析 */
  followKey?: string;
  avatar?: string;
  /** pill：带文字的小按钮（默认）；icon：仅 +/✓ 图标，用于很窄的位置 */
  variant?: 'pill' | 'icon';
  className?: string;
}

/** 关注/取消关注女优（与收藏的爱心区分：用 +关注 / 已关注）。未登录不显示。 */
export const FollowButton: React.FC<FollowButtonProps> = ({ name, followKey, avatar, variant = 'pill', className }) => {
  const { t } = useTranslation(['follow']);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useFollows();
  const { follow, unfollow } = useFollowActions();

  if (!isAuthenticated) return null;

  const existing = data?.follows.find((f) => (followKey && f.key === followKey) || f.name === name);
  const isFollowing = Boolean(existing);
  const pending = follow.isPending || unfollow.isPending;

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (pending) return;
    if (existing) unfollow.mutate(existing.key);
    else follow.mutate({ name, key: followKey, avatar });
  };

  const label = isFollowing ? t('follow:following') : t('follow:follow');
  const Icon = isFollowing ? Check : Plus;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={isFollowing}
      aria-label={`${label} ${name}`}
      title={`${label} ${name}`}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md text-[11px] font-medium leading-none transition-colors disabled:opacity-50',
        variant === 'pill' ? 'h-6 gap-0.5 px-1.5' : 'h-6 w-6',
        isFollowing
          ? 'bg-surface-100 text-surface-500 hover:bg-red-50 hover:text-red-500 dark:bg-surface-800 dark:text-surface-400 dark:hover:bg-red-900/20'
          : 'bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50',
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {variant === 'pill' ? <span>{label}</span> : null}
    </button>
  );
};
