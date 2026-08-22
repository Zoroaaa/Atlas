import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Lock } from 'lucide-react';
import { useAppInfo } from '@/contexts';
import { useTranslation } from 'react-i18next';

export const PrivacyPage: React.FC = () => {
  const { t } = useTranslation(['privacy']);
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
            {t('privacy:backHome')}
          </Link>
        </div>

        {/* Content */}
        <div className="rounded-2xl bg-white dark:bg-[#111113]/80 border border-stone-200/80 dark:border-stone-700/50 p-7 sm:p-8 shadow-soft-lg">
          {/* Title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <h1 className="display-font text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              {t('privacy:title')}
            </h1>
          </div>

          {/* Accent line */}
          <div className="accent-line mb-6" />

          {/* Privacy content */}
          <div className="space-y-6 text-sm sm:text-base text-stone-700 dark:text-stone-300 leading-relaxed">
            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('privacy:sections.valuePrivacyTitle')}</h2>
              <p>
                {t('privacy:sections.valuePrivacyP1', { appName: appInfo.NAME })}
                {t('privacy:sections.valuePrivacyP2')}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('privacy:sections.collectInfoTitle')}</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>{t('privacy:sections.collectInfo1')}</li>
                <li>{t('privacy:sections.collectInfo2')}</li>
                <li>{t('privacy:sections.collectInfo3')}</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('privacy:sections.useInfoTitle')}</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>{t('privacy:sections.useInfo1')}</li>
                <li>{t('privacy:sections.useInfo2')}</li>
                <li>{t('privacy:sections.useInfo3')}</li>
                <li>{t('privacy:sections.useInfo4')}</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('privacy:sections.noShareTitle')}</h2>
              <p>
                {t('privacy:sections.noShareP1')}
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>{t('privacy:sections.noShare1')}</li>
                <li>{t('privacy:sections.noShare2')}</li>
                <li>{t('privacy:sections.noShare3')}</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('privacy:sections.protectInfoTitle')}</h2>
              <p>
                {t('privacy:sections.protectInfoP1')}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('privacy:sections.dataRetentionTitle')}</h2>
              <p>
                {t('privacy:sections.dataRetentionP1')}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('privacy:sections.yourRightsTitle')}</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>{t('privacy:sections.yourRights1')}</li>
                <li>{t('privacy:sections.yourRights2')}</li>
                <li>{t('privacy:sections.yourRights3')}</li>
                <li>{t('privacy:sections.yourRights4')}</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">{t('privacy:sections.policyUpdatesTitle')}</h2>
              <p>
                {t('privacy:sections.policyUpdatesP1')}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-stone-200 dark:border-stone-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
                <Shield className="w-4 h-4" />
                <span>{t('privacy:footer', { year: new Date().getFullYear(), appName: appInfo.NAME })}</span>
              </div>
              <Link
                to="/terms"
                className="text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium transition-colors"
              >
                {t('privacy:viewTerms')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
