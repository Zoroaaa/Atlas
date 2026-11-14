import React from 'react';
import { useTranslation } from 'react-i18next';

export const ScaleStrip: React.FC = () => {
  const { t } = useTranslation(['home']);

  const facts = [
    {
      value: t('home:scale.fact1Value'),
      label: t('home:scale.fact1Label'),
      description: t('home:scale.fact1Desc'),
    },
    {
      value: t('home:scale.fact2Value'),
      label: t('home:scale.fact2Label'),
      description: t('home:scale.fact2Desc'),
    },
    {
      value: t('home:scale.fact3Value'),
      label: t('home:scale.fact3Label'),
      description: t('home:scale.fact3Desc'),
    },
    {
      value: t('home:scale.fact4Value'),
      label: t('home:scale.fact4Label'),
      description: t('home:scale.fact4Desc'),
    },
  ];

  return (
    <section className="home-section border-t border-stone-200/60 dark:border-stone-800/60">
      <div className="home-container">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <span className="home-eyebrow">{t('home:scale.eyebrow')}</span>
            <h2 className="display-font mt-3 text-balance text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
              {t('home:scale.title')}
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-stone-500 dark:text-stone-400">{t('home:scale.subtitle')}</p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-stone-200/80 bg-white dark:border-stone-800/80 dark:bg-[#111113]">
          <div className="grid grid-cols-2 divide-x divide-y divide-stone-200/70 lg:grid-cols-4 lg:divide-y-0 dark:divide-stone-800/70">
            {facts.map((fact) => (
              <div key={fact.label} className="p-5 sm:p-6">
                <div className="display-font text-3xl font-bold tracking-tight text-stone-900 tabular-nums sm:text-4xl dark:text-white">
                  {fact.value}
                </div>
                <div className="mt-1 text-sm font-semibold text-amber-700 dark:text-amber-400">{fact.label}</div>
                <div className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{fact.description}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-stone-500 dark:text-stone-500">{t('home:scale.footnote')}</p>
      </div>
    </section>
  );
};
