import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Clock, Heart, Layers, Rss, Tags, Trophy, Users } from 'lucide-react';
import { useFollows, useJavRankings, useJavRecommendations } from '@/hooks';
import { reasonText } from '@/components/jav/recommendationReason';
import { MediaRail, RailCard, RailSkeleton } from './MediaRail';
import type { DiscoverSection } from './types';

interface MobileIdleHomeProps {
  onCodeClick: (code: string) => void;
  onOpenDiscover: (section: DiscoverSection) => void;
  favoritesTotal: number;
  historyTotal: number;
}

interface EntryCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  unit: string;
  badge?: number;
  onClick: () => void;
}

const EntryCard: React.FC<EntryCardProps> = ({ icon: Icon, label, value, unit, badge, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="relative overflow-hidden rounded-xl border border-surface-200/80 bg-white px-3 py-2.5 text-left shadow-sm transition-all active:scale-[0.985] dark:border-surface-800/80 dark:bg-surface-900/40"
  >
    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-surface-500">
      <Icon className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
      <span className="truncate">{label}</span>
    </span>
    <span className="mt-2 flex items-baseline gap-1">
      <span className="font-display text-[20px] font-bold leading-none tabular-nums text-surface-900 sm:text-[22px] dark:text-surface-100">
        {value}
      </span>
      <span className="whitespace-nowrap text-[9px] text-surface-400 sm:text-[10px]">{unit}</span>
    </span>
    {badge && badge > 0 ? (
      <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-md bg-rose-500 px-1 text-[9px] font-bold text-white">
        {badge > 99 ? '99+' : badge}
      </span>
    ) : null}
  </button>
);

interface DiscoverItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}

const DiscoverItem: React.FC<DiscoverItemProps> = ({ icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex flex-col items-start gap-2 rounded-xl border border-surface-200/80 bg-white px-2.5 py-2.5 text-left transition-all active:scale-[0.97] dark:border-surface-800/80 dark:bg-surface-900/40"
  >
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
      <Icon className="h-4 w-4" />
    </span>
    <span className="w-full truncate text-[11px] font-semibold text-surface-600 dark:text-surface-300">{label}</span>
  </button>
);

const formatUpdatedAt = (value: number): string => {
  if (!value) return '—';
  const date = new Date(value);
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const recommendationMeta = (item: { actors?: string[]; publisher?: string }): string | undefined =>
  item.actors?.[0] ?? item.publisher ?? undefined;

/**
 * 移动端未搜索首页：只做入口与预览。
 * 完整列表（推荐 / 榜单 / TOP250 / 标签 / 女优）在 /discover 二级页。
 */
export const MobileIdleHome: React.FC<MobileIdleHomeProps> = ({
  onCodeClick,
  onOpenDiscover,
  favoritesTotal,
  historyTotal,
}) => {
  const { t } = useTranslation(['home', 'jav']);
  const navigate = useNavigate();

  const { data: follows } = useFollows();
  const unread = follows?.unread ?? 0;

  const { data: recData, isLoading: recLoading } = useJavRecommendations({ variant: 'for-you' });
  const recItems = (recData?.items ?? []).slice(0, 8);
  const recTitle = recData?.mode === 'popular'
    ? t('jav:recommend.titlePopular')
    : t('jav:recommend.titleForYou');

  const { data: rankings, isLoading: rankingsLoading } = useJavRankings();
  const rankingItems = (rankings?.monthly?.censored ?? []).slice(0, 6);
  const rankingsUpdatedAt = rankings?.monthly?.updatedAt ?? 0;

  const moreLabel = t('home:mobileHome.viewMore');
  const rankingsMeta = `${t('jav:rankings.sourceLabel')} · ${formatUpdatedAt(rankingsUpdatedAt)}`;

  return (
    <div>
      {/* 高频入口：关注更新 / 收藏 / 历史 */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-3 sm:px-5">
        <EntryCard
          icon={Rss}
          label={t('home:mobileHome.entries.follow')}
          value={unread}
          unit={t('home:mobileHome.entries.followUnit')}
          badge={unread}
          onClick={() => navigate('/dashboard/follow-feed', { state: { from: '/main' } })}
        />
        <EntryCard
          icon={Heart}
          label={t('home:mobileHome.entries.favorites')}
          value={favoritesTotal}
          unit={t('home:mobileHome.entries.favoritesUnit')}
          onClick={() => navigate('/dashboard/favorites', { state: { from: '/main' } })}
        />
        <EntryCard
          icon={Clock}
          label={t('home:mobileHome.entries.history')}
          value={historyTotal}
          unit={t('home:mobileHome.entries.historyUnit')}
          onClick={() => navigate('/dashboard/history', { state: { from: '/main' } })}
        />
      </div>

      {/* 为你推荐 */}
      {recLoading || recItems.length > 0 ? (
        <MediaRail title={recTitle} moreLabel={moreLabel} onMore={() => onOpenDiscover('recommend')}>
          {recLoading
            ? Array.from({ length: 4 }).map((_, index) => <RailSkeleton key={index} />)
            : recItems.map((item) => (
                <RailCard
                  key={item.code}
                  code={item.code}
                  title={item.title}
                  cover={item.cover}
                  tag={reasonText(t, item)}
                  meta={recommendationMeta(item)}
                  onSelect={() => onCodeClick(item.code)}
                />
              ))}
        </MediaRail>
      ) : null}

      {/* 本月热榜 */}
      {rankingsLoading || rankingItems.length > 0 ? (
        <MediaRail title={t('jav:rankings.title')} moreLabel={moreLabel} onMore={() => onOpenDiscover('rankings')}>
          {rankingsLoading
            ? Array.from({ length: 4 }).map((_, index) => <RailSkeleton key={index} />)
            : rankingItems.map((item) => (
                <RailCard
                  key={item.code}
                  code={item.code}
                  title={item.title || item.code}
                  cover={item.cover}
                  rank={item.rank}
                  isNew={item.isNew}
                  meta={rankingsMeta}
                  onSelect={() => onCodeClick(item.code)}
                />
              ))}
        </MediaRail>
      ) : null}

      {/* 发现入口 */}
      <section className="mt-5 px-4 pb-4 sm:px-5">
        <div className="flex items-center gap-2 pb-2.5">
          <h2 className="type-section-title min-w-0 truncate text-surface-900 dark:text-surface-100">
            {t('home:mobileHome.sections.discover')}
          </h2>
          <button
            type="button"
            onClick={() => onOpenDiscover('recommend')}
            className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-semibold text-surface-500 transition-colors hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-300"
          >
            {t('home:mobileHome.viewAll')}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <DiscoverItem
            icon={Tags}
            label={t('home:mobileHome.discoverItems.genres')}
            onClick={() => onOpenDiscover('genres')}
          />
          <DiscoverItem
            icon={Trophy}
            label={t('home:mobileHome.discoverItems.top250')}
            onClick={() => onOpenDiscover('top250')}
          />
          <DiscoverItem
            icon={Users}
            label={t('home:mobileHome.discoverItems.actresses')}
            onClick={() => onOpenDiscover('actresses')}
          />
          <DiscoverItem
            icon={Layers}
            label={t('home:mobileHome.discoverItems.rankings')}
            onClick={() => onOpenDiscover('rankings')}
          />
        </div>
      </section>
    </div>
  );
};
