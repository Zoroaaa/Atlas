import React, { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import type { SearchTabType } from '@/types/source';
import { UnifiedNavBar } from '@/components/layout';
import { Panel, Segmented } from '@/components/workbench';
import {
  ActressesPanel,
  JavGenrePanel,
  JavRankingsPanel,
  JavRecommendationsPanel,
  JavTop250Panel,
} from '@/components/jav';
import { DISCOVER_SECTIONS, isDiscoverSection } from '@/components/home-mobile';
import type { DiscoverSection } from '@/components/home-mobile';

/**
 * 移动端「发现」二级页：承载原首页纵向堆叠的完整列表。
 * 桌面端保持首页双栏不变，本页仅作为移动端入口的落点。
 */
export const DiscoverPage: React.FC = () => {
  const { t } = useTranslation(['home']);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();
  const isAdmin = isAuthenticated && user != null && (user.role === 'admin' || user.role === 'super_admin');

  const sectionParam = searchParams.get('section');
  const section: DiscoverSection = isDiscoverSection(sectionParam) ? sectionParam : 'recommend';

  const handleSectionChange = useCallback((next: DiscoverSection) => {
    setSearchParams({ section: next }, { replace: true });
  }, [setSearchParams]);

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

  return (
    <div className="min-h-screen page-bg pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <UnifiedNavBar
        activeTab="jav"
        onTabChange={handleTabChange}
        isAuthenticated={isAuthenticated}
        user={user}
        isAdmin={isAdmin}
      />

      <main className="mx-auto w-full max-w-[900px] px-3 py-3 sm:px-6 sm:py-5">
        <div className="flex items-center gap-1 pb-3">
          <button
            type="button"
            onClick={() => navigate('/main')}
            className="inline-flex flex-none items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-100 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-surface-100"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            <span>{t('home:mobileHome.discoverPage.back')}</span>
          </button>
          <h1 className="type-page-title min-w-0 truncate text-heading">
            {t('home:mobileHome.discoverPage.title')}
          </h1>
        </div>

        <div className="h-scroll pb-3">
          <Segmented
            value={section}
            onChange={handleSectionChange}
            ariaLabel={t('home:mobileHome.discoverPage.title')}
            options={DISCOVER_SECTIONS.map((key) => ({ value: key, label: sectionLabels[key] }))}
          />
        </div>

        <Panel>
          {section === 'recommend' ? <JavRecommendationsPanel variant="for-you" onCodeClick={goSearch} /> : null}
          {section === 'rankings' ? <JavRankingsPanel onCodeClick={goSearch} /> : null}
          {section === 'top250' ? <JavTop250Panel onCodeClick={goSearch} /> : null}
          {section === 'genres' ? <JavGenrePanel onCodeClick={goSearch} /> : null}
          {section === 'actresses' ? <ActressesPanel onActressClick={goActress} /> : null}
        </Panel>
      </main>
    </div>
  );
};

export default DiscoverPage;
