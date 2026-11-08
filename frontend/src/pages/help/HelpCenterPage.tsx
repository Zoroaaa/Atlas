import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  ChevronDown,
  Info,
  List,
  Search,
  X,
} from 'lucide-react';
import { Button, Card, EmptyState, Input } from '@/components/ui';
import {
  DEFAULT_HELP_CATEGORY,
  HELP_CATEGORIES,
  HELP_SECTION_CATEGORY,
  HELP_SECTION_IDS,
} from './helpContent';

interface HelpSectionContent {
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  features: string[];
  steps: string[];
  caveats: string[];
}

type Translate = (key: string, options?: Record<string, unknown>) => unknown;

const readArray = (t: Translate, key: string): string[] => {
  const value = t(key, { returnObjects: true });
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

export const HelpCenterPage: React.FC = () => {
  const { t } = useTranslation(['help']);
  const navigate = useNavigate();
  const location = useLocation();

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(DEFAULT_HELP_CATEGORY);
  const [activeSectionId, setActiveSectionId] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const hashSectionId = useMemo(
    () => decodeURIComponent(location.hash.replace(/^#/, '')),
    [location.hash]
  );

  // 深链接：/help#section-id 直接定位到对应分类与章节
  useEffect(() => {
    if (!hashSectionId || !HELP_SECTION_CATEGORY[hashSectionId]) return;
    setQuery('');
    setActiveCategory(HELP_SECTION_CATEGORY[hashSectionId]);
    setActiveSectionId(hashSectionId);
  }, [hashSectionId]);

  useEffect(() => {
    if (!hashSectionId || query.trim()) return;
    const timer = window.setTimeout(() => {
      document.getElementById(hashSectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [hashSectionId, query]);

  const translate = t as unknown as Translate;

  const sections: HelpSectionContent[] = HELP_SECTION_IDS.map((id) => ({
    id,
    categoryId: HELP_SECTION_CATEGORY[id],
    title: String(translate(`help:sections.${id}.title`)),
    summary: String(translate(`help:sections.${id}.summary`)),
    features: readArray(translate, `help:sections.${id}.features`),
    steps: readArray(translate, `help:sections.${id}.steps`),
    caveats: readArray(translate, `help:sections.${id}.caveats`),
  }));

  const normalizedQuery = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!normalizedQuery) return [];
    return sections.filter((section) =>
      [
        section.title,
        section.summary,
        ...section.features,
        ...section.steps,
        ...section.caveats,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [normalizedQuery, sections]);

  const resultGroups = useMemo(
    () =>
      HELP_CATEGORIES.map((category) => ({
        category,
        items: matches.filter((section) => section.categoryId === category.id),
      })).filter((group) => group.items.length > 0),
    [matches]
  );

  const activeCategoryDef = useMemo(
    () => HELP_CATEGORIES.find((category) => category.id === activeCategory) ?? HELP_CATEGORIES[0],
    [activeCategory]
  );

  const activeSections = useMemo(
    () => sections.filter((section) => section.categoryId === activeCategoryDef.id),
    [sections, activeCategoryDef.id]
  );

  const goToSection = useCallback(
    (sectionId: string) => {
      setQuery('');
      setActiveCategory(HELP_SECTION_CATEGORY[sectionId] ?? DEFAULT_HELP_CATEGORY);
      setActiveSectionId(sectionId);
      setMobileNavOpen(false);
      if (location.hash === `#${sectionId}`) {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        navigate({ pathname: '/help', hash: sectionId });
      }
    },
    [location.hash, navigate]
  );

  const selectCategory = useCallback(
    (categoryId: string) => {
      setQuery('');
      setActiveCategory(categoryId);
      setActiveSectionId('');
      setMobileNavOpen(false);
      if (location.hash) {
        navigate('/help');
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [location.hash, navigate]
  );

  const renderNav = () => (
    <nav aria-label={t('help:page.toc')}>
      <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400 dark:text-stone-600">
        {t('help:page.toc')}
      </p>
      <ul className="space-y-1">
        {HELP_CATEGORIES.map((category) => {
          const Icon = category.icon;
          const isActive = !normalizedQuery && category.id === activeCategoryDef.id;
          return (
            <li key={category.id}>
              <button
                type="button"
                onClick={() => selectCategory(category.id)}
                aria-expanded={isActive}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'
                )}
              >
                <Icon className={clsx('h-4 w-4 shrink-0', isActive ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400')} />
                <span className="flex-1 text-left">{t(`help:categories.${category.id}.title`)}</span>
                <ChevronDown
                  className={clsx(
                    'h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform',
                    isActive && 'rotate-180'
                  )}
                />
              </button>

              {isActive ? (
                <ul className="my-1 ml-5 space-y-0.5 border-l border-stone-200 pl-2 dark:border-stone-700">
                  {category.sections.map((sectionId) => (
                    <li key={sectionId}>
                      <button
                        type="button"
                        onClick={() => goToSection(sectionId)}
                        aria-current={activeSectionId === sectionId ? 'true' : undefined}
                        className={clsx(
                          'w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors',
                          activeSectionId === sectionId
                            ? 'bg-amber-100/70 font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                            : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200'
                        )}
                      >
                        {t(`help:sections.${sectionId}.title`)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const renderSection = (section: HelpSectionContent, showCategory = false) => {
    const category = HELP_CATEGORIES.find((item) => item.id === section.categoryId);
    const isActive = activeSectionId === section.id;

    return (
      <Card
        key={section.id}
        padding="lg"
        className={clsx(
          'transition-all duration-200',
          isActive && 'ring-2 ring-amber-400/70 dark:ring-amber-500/50'
        )}
      >
        <article id={section.id} className="scroll-mt-24">
          {showCategory && category ? (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              {t(`help:categories.${category.id}.title`)}
            </p>
          ) : null}

          <h2
            id={`${section.id}-title`}
            className="display-font text-lg font-bold tracking-tight text-stone-900 dark:text-stone-100 sm:text-xl"
          >
            {section.title}
          </h2>

          {section.summary ? (
            <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300 sm:text-[15px]">
              {section.summary}
            </p>
          ) : null}

          {section.features.length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                {t('help:page.features')}
              </h3>
              <ul className="space-y-2">
                {section.features.map((feature, index) => (
                  <li key={`${section.id}-feature-${index}`} className="flex gap-2.5 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/80" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {section.steps.length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                {t('help:page.steps')}
              </h3>
              <ol className="space-y-2.5">
                {section.steps.map((step, index) => (
                  <li key={`${section.id}-step-${index}`} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {section.caveats.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3.5 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <Info className="h-3.5 w-3.5 shrink-0" />
                {t('help:page.caveats')}
              </h3>
              <ul className="space-y-1.5">
                {section.caveats.map((caveat, index) => (
                  <li key={`${section.id}-caveat-${index}`} className="flex gap-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                    <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-amber-500/80" />
                    <span>{caveat}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      </Card>
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] page-bg">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">

        {/* 页面头部 */}
        <header className="mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            <Search className="h-3 w-3" />
            {t('help:page.badge')}
          </div>
          <h1 className="display-font mt-3 text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100 sm:text-3xl">
            {t('help:page.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            {t('help:page.subtitle')}
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="w-full sm:max-w-md">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('help:page.searchPlaceholder')}
                leftIcon={<Search className="h-4 w-4" />}
                rightIcon={
                  query ? (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label={t('help:page.clearSearch')}
                      className="rounded p-0.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : undefined
                }
                fullWidth
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              leftIcon={<List className="h-4 w-4" />}
              onClick={() => setMobileNavOpen(true)}
            >
              {t('help:page.openToc')}
            </Button>
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">

          {/* 桌面端左侧分类导航 */}
          <aside className="hidden lg:block">
            <div
              className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-stone-200/80 bg-white/80 p-3 shadow-sm backdrop-blur-sm dark:border-stone-700/50 dark:bg-stone-900/70"
              style={{ scrollbarWidth: 'thin' }}
            >
              {renderNav()}
            </div>
          </aside>

          {/* 右侧内容区 */}
          <main className="min-w-0">
            {normalizedQuery ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    {t('help:page.searchResultCount', { total: matches.length })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                  >
                    {t('help:page.clearSearch')}
                  </button>
                </div>

                {resultGroups.length === 0 ? (
                  <Card padding="lg">
                    <EmptyState
                      icon={<Search className="h-10 w-10" />}
                      title={t('help:page.noResultsTitle')}
                      description={t('help:page.noResultsDesc', { query: query.trim() })}
                      action={
                        <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                          {t('help:page.clearSearch')}
                        </Button>
                      }
                    />
                  </Card>
                ) : (
                  resultGroups.map((group) => {
                    const Icon = group.category.icon;
                    return (
                      <section key={group.category.id} className="space-y-3">
                        <div className="flex items-center gap-2 px-1">
                          <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">
                            {t(`help:categories.${group.category.id}.title`)}
                          </h2>
                          <span className="text-[11px] text-stone-400">({group.items.length})</span>
                        </div>
                        {group.items.map((section) => renderSection(section, true))}
                      </section>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-stone-200/80 bg-gradient-to-br from-white to-amber-50/50 p-5 dark:border-stone-700/50 dark:from-stone-900/80 dark:to-amber-500/5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#d4a853] to-[#f59e0b] text-white shadow-md shadow-amber-500/25">
                      {React.createElement(activeCategoryDef.icon, { className: 'h-5 w-5' })}
                    </div>
                    <div className="min-w-0">
                      <h2 className="display-font text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                        {t(`help:categories.${activeCategoryDef.id}.title`)}
                      </h2>
                      <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                        {t(`help:categories.${activeCategoryDef.id}.description`)}
                      </p>
                      <p className="mt-2 text-[11px] text-stone-400 dark:text-stone-500">
                        {t('help:page.sectionCount', { total: activeSections.length })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {activeSections.map((section) => renderSection(section))}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* 移动端目录抽屉 */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-2xl dark:bg-stone-900">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {t('help:page.toc')}
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label={t('help:page.closeToc')}
                className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderNav()}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default HelpCenterPage;
