import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Database,
  FileText,
  LockKeyhole,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const GITHUB_URL = 'https://github.com/Zoroaaa/Atlas';
const DEPLOY_URL = 'https://github.com/Zoroaaa/Atlas/blob/main/docs/deploy.md';

export const TrustSection: React.FC = () => {
  const { t } = useTranslation(['home']);

  const items = [
    {
      icon: FileText,
      title: t('home:trust.openSourceTitle'),
      description: t('home:trust.openSourceDesc'),
    },
    {
      icon: Server,
      title: t('home:trust.sameOriginTitle'),
      description: t('home:trust.sameOriginDesc'),
    },
    {
      icon: LockKeyhole,
      title: t('home:trust.accountTitle'),
      description: t('home:trust.accountDesc'),
    },
    {
      icon: ShieldCheck,
      title: t('home:trust.privacyTitle'),
      description: t('home:trust.privacyDesc'),
    },
    {
      icon: Database,
      title: t('home:trust.sourceTitle'),
      description: t('home:trust.sourceDesc'),
    },
    {
      icon: AlertTriangle,
      title: t('home:trust.ageTitle'),
      description: t('home:trust.ageDesc'),
    },
  ];

  return (
    <section className="home-section border-t border-stone-200/60 bg-stone-100/50 dark:border-stone-800/60 dark:bg-stone-900/20">
      <div className="home-container grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="min-w-0 lg:col-span-5">
          <span className="home-eyebrow">{t('home:trust.eyebrow')}</span>
          <h2 className="display-font mt-3 text-balance text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
            {t('home:trust.title')}
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-stone-600 dark:text-stone-400">{t('home:trust.body')}</p>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium">
            <Link to="/terms" className="inline-flex items-center gap-1.5 text-amber-700 hover:underline dark:text-amber-400">
              {t('home:trust.termsLink')}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link to="/privacy" className="inline-flex items-center gap-1.5 text-amber-700 hover:underline dark:text-amber-400">
              {t('home:trust.privacyLink')}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-amber-700 hover:underline dark:text-amber-400"
            >
              {t('home:trust.githubLink')}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <a
              href={DEPLOY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-amber-700 hover:underline dark:text-amber-400"
            >
              {t('home:trust.deployLink')}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-2xl border border-stone-200/80 bg-white p-4 dark:border-stone-800/80 dark:bg-[#111113]"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.5} aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-stone-600 dark:text-stone-400">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
