import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppInfo } from '@/contexts';

const GITHUB_URL = 'https://github.com/Zoroaaa/Atlas';
const DEPLOY_URL = 'https://github.com/Zoroaaa/Atlas/blob/main/docs/deploy.md';
const CHANGELOG_URL = 'https://github.com/Zoroaaa/Atlas/blob/main/docs/CHANGELOG.md';
const RELEASES_URL = 'https://github.com/Zoroaaa/Atlas/releases';
const ISSUES_URL = 'https://github.com/Zoroaaa/Atlas/issues';

interface SiteFooterProps {
  enableRegistration: boolean;
}

interface FooterLink {
  label: string;
  to?: string;
  href?: string;
}

export const SiteFooter: React.FC<SiteFooterProps> = ({ enableRegistration }) => {
  const { t } = useTranslation(['home']);
  const { VERSION } = useAppInfo();
  const year = new Date().getFullYear();

  const groups: Array<{ title: string; links: FooterLink[] }> = [
    {
      title: t('home:footer.siteGroup'),
      links: [
        { label: t('home:footer.help'), to: '/help' },
        { label: t('home:footer.terms'), to: '/terms' },
        { label: t('home:footer.privacy'), to: '/privacy' },
        { label: t('home:footer.feedback'), href: ISSUES_URL },
      ],
    },
    {
      title: t('home:footer.projectGroup'),
      links: [
        { label: t('home:footer.github'), href: GITHUB_URL },
        { label: t('home:footer.deploy'), href: DEPLOY_URL },
        { label: t('home:footer.changelog'), href: CHANGELOG_URL },
        { label: t('home:footer.client'), href: RELEASES_URL },
      ],
    },
    {
      title: t('home:footer.accountGroup'),
      links: enableRegistration
        ? [
            { label: t('home:footer.login'), to: '/login' },
            { label: t('home:footer.register'), to: '/register' },
          ]
        : [{ label: t('home:footer.login'), to: '/login' }],
    },
  ];

  return (
    <footer className="border-t border-stone-800 bg-[#0c0a09] text-stone-400">
      <div className="home-container py-12 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <img src="/logo.svg" alt="Atlas" className="h-9 w-9 rounded-xl" />
              <span className="display-font text-xl font-bold text-white">Atlas</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-stone-400">{t('home:footer.tagline')}</p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-stone-300 transition-colors hover:text-white"
            >
              <Github className="h-4 w-4" aria-hidden="true" />
              {t('home:footer.github')}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {groups.map((group) => (
              <nav key={group.title} aria-label={group.title}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{group.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {link.to ? (
                        <Link to={link.to} className="text-sm text-stone-400 transition-colors hover:text-white">
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-stone-400 transition-colors hover:text-white"
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-stone-800 pt-6 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-xs leading-5 text-stone-500">
            {t('home:footer.copyright', { year, version: VERSION })}
          </p>
          <p className="max-w-2xl text-xs leading-5 text-stone-500">{t('home:footer.disclaimer')}</p>
        </div>
      </div>
    </footer>
  );
};
