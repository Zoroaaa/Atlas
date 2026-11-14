import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, UserPlus, Search, BookmarkPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StartSectionProps {
  enableRegistration: boolean;
}

export const StartSection: React.FC<StartSectionProps> = ({ enableRegistration }) => {
  const { t } = useTranslation(['home']);

  const steps = [
    {
      icon: UserPlus,
      title: t('home:start.step1Title'),
      description: t('home:start.step1Desc'),
    },
    {
      icon: Search,
      title: t('home:start.step2Title'),
      description: t('home:start.step2Desc'),
    },
    {
      icon: BookmarkPlus,
      title: t('home:start.step3Title'),
      description: t('home:start.step3Desc'),
    },
  ];

  const primaryTo = enableRegistration ? '/register' : '/login';
  const primaryLabel = enableRegistration ? t('home:start.primaryCta') : t('home:start.primaryCtaLogin');

  return (
    <section className="home-section border-t border-stone-200/60 dark:border-stone-800/60">
      <div className="home-container">
        <div className="rounded-3xl border border-stone-200/80 bg-white p-6 sm:p-8 lg:p-10 dark:border-stone-800/80 dark:bg-[#111113]">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="min-w-0 lg:col-span-5">
              <span className="home-eyebrow">{t('home:start.eyebrow')}</span>
              <h2 className="display-font mt-3 text-balance text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
                {t('home:start.title')}
              </h2>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to={primaryTo}
                  className="btn-gradient inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold sm:text-base"
                >
                  {primaryLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-stone-200 px-6 py-3 text-sm font-semibold text-stone-700 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-stone-700 dark:text-stone-300 dark:hover:border-amber-700 dark:hover:text-amber-400 sm:text-base"
                >
                  {t('home:start.secondaryCta')}
                </Link>
              </div>

              <p className="mt-4 text-xs leading-5 text-stone-500 dark:text-stone-500">
                <Link to="/help" className="font-medium text-amber-700 underline-offset-4 hover:underline dark:text-amber-400">
                  {t('home:start.microcopy')}
                </Link>
              </p>
            </div>

            <div className="min-w-0 lg:col-span-7">
              <div className="space-y-3">
                {steps.map(({ icon: Icon, title, description }, index) => (
                  <div
                    key={title}
                    className="flex gap-4 rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4 dark:border-stone-800/80 dark:bg-stone-900/30"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                      <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="display-font text-[11px] font-bold text-amber-600 tabular-nums dark:text-amber-400">
                          0{index + 1}
                        </span>
                        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-stone-600 dark:text-stone-400">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
