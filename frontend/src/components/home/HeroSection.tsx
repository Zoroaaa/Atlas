import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface HeroSectionProps {
  enableRegistration: boolean;
}

/** 首屏右侧的产品框：用真实界面的结构表达源站看板，而不是抽象插画 */
const HeroProductFrame: React.FC = () => {
  const { t } = useTranslation(['home']);

  const sources = [
    { name: 'JavBus', status: t('home:preview.available') },
    { name: 'JavDB', status: t('home:preview.available') },
    { name: 'Mikan', status: t('home:preview.available') },
    { name: 'MissAV', status: t('home:preview.available') },
  ];

  return (
    <div className="home-frame relative rounded-3xl border border-stone-200/80 bg-white/90 p-2.5 backdrop-blur dark:border-stone-800 dark:bg-[#111113]/90">
      <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-stone-50 dark:border-stone-800/80 dark:bg-[#0b0b0d]">
        <div className="flex items-center gap-2 border-b border-stone-200/70 px-4 py-3 dark:border-stone-800/80">
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-700" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-700" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-700" aria-hidden="true" />
          <span className="ml-2 text-xs font-medium text-stone-600 dark:text-stone-300">
            {t('home:preview.sourceBoard')}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-teal-600 dark:text-teal-400">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
            {t('home:preview.online')}
          </span>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: '5', label: t('home:preview.categories') },
              { value: t('home:preview.multi'), label: t('home:preview.sources') },
              { value: t('home:preview.checkable'), label: t('home:preview.health') },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-stone-200/80 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900/60"
              >
                <div className="display-font text-lg font-bold text-stone-900 tabular-nums dark:text-stone-100">
                  {item.value}
                </div>
                <div className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400">{item.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {sources.map((source) => (
              <div
                key={source.name}
                className="flex items-center gap-3 rounded-xl border border-stone-200/70 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900/50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-[11px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  {source.name.slice(0, 1)}
                </span>
                <span className="text-xs font-medium text-stone-700 dark:text-stone-300">{source.name}</span>
                <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-medium text-teal-600 dark:text-teal-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
                  {source.status}
                </span>
                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                  {t('home:preview.enabled')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const HeroSection: React.FC<HeroSectionProps> = ({ enableRegistration }) => {
  const { t } = useTranslation(['home']);

  const primaryTo = enableRegistration ? '/register' : '/login';
  const primaryLabel = enableRegistration ? t('home:hero.primaryCta') : t('home:hero.primaryCtaLogin');

  const categories = [
    t('home:hero.catJav'),
    t('home:hero.catAnime'),
    t('home:hero.catMovie'),
    t('home:hero.catManga'),
    t('home:hero.catNovel'),
  ];

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(212,168,83,0.14),transparent_70%)] dark:bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(212,168,83,0.1),transparent_70%)]"
      />
      <div className="home-container relative grid items-center gap-12 pb-16 pt-14 sm:pt-20 lg:grid-cols-12 lg:gap-10 lg:pb-24 lg:pt-24">
        <div className="min-w-0 lg:col-span-7">
          <span className="home-eyebrow">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('home:hero.eyebrow')}
          </span>

          <h1 className="display-font mt-5 max-w-[18ch] text-balance text-[clamp(2rem,5vw,4rem)] font-bold leading-[1.06] tracking-tight text-stone-900 dark:text-white">
            {t('home:hero.headline')}
          </h1>
          <span
            aria-hidden="true"
            className="mt-6 block h-[3px] w-16 rounded-full bg-gradient-to-r from-[#d4a853] to-[#e11d48]"
          />

          <p className="mt-6 max-w-2xl text-[15px] leading-7 text-stone-600 sm:text-base dark:text-stone-400">
            {t('home:hero.subhead')}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to={primaryTo}
              className="btn-gradient inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold sm:text-base"
            >
              {primaryLabel}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href="#capabilities"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-stone-200 bg-white/70 px-6 py-3 text-sm font-semibold text-stone-700 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-300 dark:hover:border-amber-700 dark:hover:text-amber-400 sm:text-base"
            >
              {t('home:hero.secondaryCta')}
            </a>
          </div>

          <p className="mt-4 text-xs leading-5 text-stone-500 dark:text-stone-500">{t('home:hero.microcopy')}</p>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            {categories.map((category) => (
              <span
                key={category}
                className="rounded-full border border-stone-200/80 bg-white/60 px-3 py-1.5 text-xs font-medium text-stone-600 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-400"
              >
                {category}
              </span>
            ))}
          </div>

          <p className="mt-4 text-xs text-stone-500 dark:text-stone-500">
            <Link to="/login" className="font-medium text-amber-700 underline-offset-4 hover:underline dark:text-amber-400">
              {t('home:hero.loginCta')}
            </Link>
          </p>
        </div>

        <div className="min-w-0 lg:col-span-5">
          <HeroProductFrame />
        </div>
      </div>
    </section>
  );
};
