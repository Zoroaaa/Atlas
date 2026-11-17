import React, { useCallback } from 'react';
import clsx from 'clsx';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Sparkles, Tags, TrendingUp, Trophy, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useIsDesktop } from '@/hooks';
import type { SearchTabType } from '@/types/source';
import { UnifiedNavBar, AppShell } from '@/components/layout';
import {
  ActressesPanel,
  JavGenrePanel,
  JavRankingsPanel,
  JavRecommendationsPanel,
  JavTop250Panel,
} from '@/components/jav';
import { isDiscoverSection } from '@/components/home-mobile';import type { DiscoverSection } from '@/components/home-mobile';

/**
 * 发现页：推荐 / 最近热播 / TOP250 / 标签 / 女优各占一个独立页面。
 * 路由为 /discover/:section，桌面端由 AppShell 承载，移动端保留返回栏。
 */
export const DiscoverPage: React.FC = () => {
  const { t } = useTranslation(['home']);
  const navigate = useNavigate();
  const { section: routeSection } = useParams();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();
  const isDesktop = useIsDesktop();
  const isAdmin = isAuthenticated && user != null && (user.role === 'admin' || user.role === 'super_admin');

  const querySection = searchParams.get('section');
  const section: DiscoverSection = isDiscoverSection(routeSection ?? '')
    ? (routeSection as DiscoverSection)
    : isDiscoverSection(querySection)
      ? (querySection as DiscoverSection)
      : 'recommend';

  const handleTabChange = useCallback((tab: SearchTabType) => {
    if (tab === 'community') { navigate('/community'); return; }
    navigate(`/main?tab=${tab}`);
  }, [navigate]);

  const goSearch = useCallback((code: string) => {
    navigate(`/main?tab=jav&q=${encodeURIComponent(code)}`);
  }, [navigate]);

  const goActress = useCallback((name: string) => {
    navigate(`/main?tab=jav&sub=actress&q=${encodeURIComponent(name)}`);
  }, [navigate]);

  const sectionLabels: Record<DiscoverSection, string> = {
    recommend: t('home:mobileHome.discoverPage.sections.recommend'),
    rankings: t('home:mobileHome.discoverPage.sections.rankings'),
    top250: t('home:mobileHome.discoverPage.sections.top250'),
    genres: t('home:mobileHome.discoverPage.sections.genres'),
    actresses: t('home:mobileHome.discoverPage.sections.actresses'),
  };

  const sectionDescriptions: Record<DiscoverSection, string> = {
    recommend: t('home:mobileHome.discoverPage.descriptions.recommend'),
    rankings: t('home:mobileHome.discoverPage.descriptions.rankings'),
    top250: t('home:mobileHome.discoverPage.descriptions.top250'),
    genres: t('home:mobileHome.discoverPage.descriptions.genres'),
    actresses: t('home:mobileHome.discoverPage.descriptions.actresses'),
  };

  const sectionMeta: Record<DiscoverSection, { icon: React.ComponentType<{ className?: string }>; gradient: string }> = {
    recommend: { icon: Sparkles, gradient: 'from-primary-500 to-accent-500 shadow-primary-500/25' },
    rankings: { icon: TrendingUp, gradient: 'from-orange-500 to-amber-500 shadow-orange-500/25' },
    top250: { icon: Trophy, gradient: 'from-amber-500 to-yellow-500 shadow-amber-500/25' },
    genres: { icon: Tags, gradient: 'from-purple-500 to-indigo-500 shadow-purple-500/25' },
    actresses: { icon: Users, gradient: 'from-rose-500 to-pink-500 shadow-rose-500/25' },
  };

  const activeMeta = sectionMeta[section];
  const ActiveIcon = activeMeta.icon;

  return (
    <AppShell onSearchTabChange={handleTabChange}>
      <div className={clsx('page-bg', !isDesktop && 'min-h-screen pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0')}>
        {!isDesktop ? (
          <UnifiedNavBar
            activeTab="jav"
            onTabChange={handleTabChange}
            isAuthenticated={isAuthenticated}
            user={user}
            isAdmin={isAdmin}
          />
        ) : null}

        <main className="mx-auto w-full max-w-[1280px] px-4 py-4 sm:px-8 sm:py-7">
          {!isDesktop ? (
            <div className="flex items-center gap-1 pb-3">
              <button
                type="button"
                onClick={() => navigate('/main')}
                className="inline-flex flex-none items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-100 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-surface-100"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                <span>{t('home:mobileHome.discoverPage.back')}</span>
              </button>
            </div>
          ) : null}

          <div className="mb-5 flex items-center gap-3">
            <div className={clsx('flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-gradient-to-br shadow-lg', activeMeta.gradient)}>
              <ActiveIcon className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-100">
                {sectionLabels[section]}
              </h1>
              <p className="mt-0.5 text-sm text-surface-500 dark:text-surface-400">
                {sectionDescriptions[section]}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-surface-200/70 bg-white p-5 shadow-sm dark:border-surface-800/70 dark:bg-[#111113] sm:p-6">
            {section === 'recommend' ? <JavRecommendationsPanel variant="for-you" layout="page" onCodeClick={goSearch} /> : null}
            {section === 'rankings' ? <JavRankingsPanel layout="page" onCodeClick={goSearch} /> : null}
            {section === 'top250' ? <JavTop250Panel layout="page" onCodeClick={goSearch} /> : null}
            {section === 'genres' ? <JavGenrePanel layout="page" onCodeClick={goSearch} /> : null}
            {section === 'actresses' ? <ActressesPanel layout="page" onActressClick={goActress} /> : null}
          </div>
        </main>
      </div>
    </AppShell>
  );
};

export default DiscoverPage;
