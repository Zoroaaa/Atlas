import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Globe, Heart, Rss, Sparkles, Tags, Trophy, Users } from 'lucide-react';
import { useFollows } from '@/hooks';
import type { DiscoverSection } from './types';

interface MobileIdleHomeProps {
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

/**
 * 移动端未搜索首页：只保留高频入口与发现入口，不再内嵌任何内容栏目。
 */
export const MobileIdleHome: React.FC<MobileIdleHomeProps> = ({
  onOpenDiscover,
  favoritesTotal,
  historyTotal,
}) => {
  const { t } = useTranslation(['home', 'search', 'nav']);
  const navigate = useNavigate();
  const { data: follows } = useFollows();
  const unread = follows?.unread ?? 0;

  return (
    <div>
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

      <section className="mt-5 px-4 pb-4 sm:px-5">
        <div className="pb-2.5">
          <h2 className="type-section-title text-surface-900 dark:text-surface-100">
            {t('home:mobileHome.sections.discover')}
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <DiscoverItem icon={Sparkles} label={t('home:mobileHome.discoverPage.sections.recommend')} onClick={() => onOpenDiscover('recommend')} />
          <DiscoverItem icon={Trophy} label={t('home:mobileHome.discoverPage.sections.rankings')} onClick={() => onOpenDiscover('rankings')} />
          <DiscoverItem icon={Trophy} label={t('home:mobileHome.discoverPage.sections.top250')} onClick={() => onOpenDiscover('top250')} />
          <DiscoverItem icon={Tags} label={t('home:mobileHome.discoverPage.sections.genres')} onClick={() => onOpenDiscover('genres')} />
          <DiscoverItem icon={Users} label={t('home:mobileHome.discoverPage.sections.actresses')} onClick={() => onOpenDiscover('actresses')} />
          <DiscoverItem
            icon={Globe}
            label={t('nav:mobileMore.sources')}
            onClick={() => navigate('/main?tab=sources')}
          />
        </div>
      </section>
    </div>
  );
};
