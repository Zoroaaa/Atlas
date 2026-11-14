import React from 'react';
import {
  Bell,
  Clapperboard,
  Globe2,
  Layers,
  Server,
  UserRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CapabilityGridProps {
  showCommunity: boolean;
}

export const CapabilityGrid: React.FC<CapabilityGridProps> = ({ showCommunity }) => {
  const { t } = useTranslation(['home']);

  const items = [
    {
      icon: Layers,
      title: t('home:capabilities.categoriesTitle'),
      description: t('home:capabilities.categoriesDesc'),
    },
    {
      icon: Globe2,
      title: t('home:capabilities.multiSourceTitle'),
      description: t('home:capabilities.multiSourceDesc'),
    },
    {
      icon: Server,
      title: t('home:capabilities.sourceBoardTitle'),
      description: t('home:capabilities.sourceBoardDesc'),
    },
    {
      icon: Clapperboard,
      title: t('home:capabilities.javTitle'),
      description: t('home:capabilities.javDesc'),
    },
    {
      icon: Bell,
      title: t('home:capabilities.followTitle'),
      description: t('home:capabilities.followDesc'),
    },
    {
      icon: UserRound,
      title: t('home:capabilities.accountTitle'),
      description: showCommunity
        ? t('home:capabilities.accountDesc')
        : t('home:capabilities.accountDescNoCommunity'),
    },
  ];

  return (
    <section id="capabilities" className="home-section scroll-mt-20 border-t border-stone-200/60 dark:border-stone-800/60">
      <div className="home-container">
        <div className="max-w-3xl">
          <span className="home-eyebrow">{t('home:capabilities.eyebrow')}</span>
          <h2 className="display-font mt-3 text-balance text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
            {t('home:capabilities.title')}
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-stone-600 sm:text-base dark:text-stone-400">
            {t('home:capabilities.subtitle')}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-4">
          {items.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-stone-200/80 bg-white p-5 transition-colors hover:border-amber-200 dark:border-stone-800/80 dark:bg-[#111113] dark:hover:border-amber-800/60"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-400">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
