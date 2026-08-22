import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, FileText } from 'lucide-react';
import { useAppInfo } from '@/contexts';
import { useTranslation } from 'react-i18next';

export const TermsPage: React.FC = () => {
  const { t } = useTranslation(['terms']);
  const appInfo = useAppInfo();

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0a0a0b] relative overflow-hidden">
      {/* Ambient bg */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-amber-400/6 dark:bg-amber-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-rose-400/6 dark:bg-rose-500/4 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-12 relative">
        {/* Header */}
        <div className="mb-8">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors text-sm font-medium group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            {t('terms:backHome')}
          </Link>
        </div>

        {/* Content */}
        <div className="rounded-2xl bg-white dark:bg-[#111113]/80 border border-stone-200/80 dark:border-stone-700/50 p-7 sm:p-8 shadow-soft-lg">
          {/* Title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <h1 className="display-font text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              {t('terms:title')}
            </h1>
          </div>

          {/* Accent line */}
          <div className="accent-line mb-6" />

          {/* Terms content */}
          <div className="space-y-6 text-sm sm:text-base text-stone-700 dark:text-stone-300 leading-relaxed">
            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('terms:sections.welcomeTitle', { appName: appInfo.NAME })}</h2>
              <p>
                {t('terms:sections.welcomeP1', { appName: appInfo.NAME })}
                {t('terms:sections.welcomeP2')}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('terms:sections.whatWeProvideTitle')}</h2>
              <p>
                {t('terms:sections.whatWeProvideP1')}
                {t('terms:sections.whatWeProvideP2')}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('terms:sections.userResponsibilityTitle')}</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>{t('terms:sections.userResponsibility1')}</li>
                <li>{t('terms:sections.userResponsibility2')}</li>
                <li>{t('terms:sections.userResponsibility3')}</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('terms:sections.openSourceTitle')}</h2>
              <p>
                {t('terms:sections.openSourceP1')}
                {t('terms:sections.openSourceP2')}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('terms:sections.changesTitle')}</h2>
              <p>
                {t('terms:sections.changesP1')}
                {t('terms:sections.changesP2')}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('terms:sections.disclaimerTitle')}</h2>
              <p>
                {t('terms:sections.disclaimerP1')}
                {t('terms:sections.disclaimerP2')}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-stone-200 dark:border-stone-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
                <Shield className="w-4 h-4" />
                <span>{t('terms:footer', { year: new Date().getFullYear(), appName: appInfo.NAME })}</span>
              </div>
              <Link
                to="/privacy"
                className="text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium transition-colors"
              >
                {t('terms:viewPrivacy')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
