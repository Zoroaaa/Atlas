import React from 'react';
import clsx from 'clsx';
import {
  Bell,
  Check,
  FolderHeart,
  History,
  MessageSquare,
  Radio,
  Server,
  UserRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FeatureShowcaseProps {
  showCommunity: boolean;
}

const PreviewShell: React.FC<{ title: string; children: React.ReactNode; badge?: React.ReactNode }> = ({
  title,
  children,
  badge,
}) => (
  <div className="home-frame rounded-3xl border border-stone-200/80 bg-white p-2.5 dark:border-stone-800/80 dark:bg-[#111113]">
    <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-stone-50 dark:border-stone-800/80 dark:bg-[#0b0b0d]">
      <div className="flex items-center gap-2 border-b border-stone-200/70 px-4 py-3 dark:border-stone-800/80">
        <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
        <span className="text-xs font-medium text-stone-600 dark:text-stone-300">{title}</span>
        {badge ? <span className="ml-auto">{badge}</span> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  </div>
);

const SourceBoardPreview: React.FC = () => {
  const { t } = useTranslation(['home']);

  const sources = [
    { name: 'JavBus', category: t('home:hero.catJav') },
    { name: 'JavDB', category: t('home:hero.catJav') },
    { name: 'Mikan', category: t('home:hero.catAnime') },
    { name: 'MissAV', category: t('home:hero.catJav') },
  ];

  return (
    <PreviewShell
      title={t('home:preview.sourceBoard')}
      badge={
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-teal-600 dark:text-teal-400">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
          {t('home:preview.online')}
        </span>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {[t('home:hero.catJav'), t('home:hero.catAnime'), t('home:hero.catMovie'), t('home:hero.catManga'), t('home:hero.catNovel')].map(
          (category, index) => (
            <span
              key={category}
              className={clsx(
                'rounded-lg px-2 py-1 text-[10px] font-medium',
                index === 0
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400'
                  : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
              )}
            >
              {category}
            </span>
          )
        )}
      </div>

      <div className="mt-4 space-y-2">
        {sources.map((source) => (
          <div
            key={source.name}
            className="flex items-center gap-3 rounded-xl border border-stone-200/70 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900/50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-[10px] font-bold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              {source.name.slice(0, 1)}
            </span>
            <span className="text-xs font-medium text-stone-700 dark:text-stone-300">{source.name}</span>
            <span className="hidden text-[10px] text-stone-400 sm:inline">{source.category}</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-medium text-teal-600 dark:text-teal-400">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
              {t('home:preview.available')}
            </span>
            <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">
              {t('home:preview.enabled')}
            </span>
          </div>
        ))}
      </div>
    </PreviewShell>
  );
};

const JavDetailPreview: React.FC = () => {
  const { t } = useTranslation(['home']);

  return (
    <PreviewShell
      title={t('home:preview.javDetail')}
      badge={<span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">SONE-520</span>}
    >
      <div className="flex gap-3">
        <div className="h-24 w-[68px] shrink-0 rounded-xl bg-gradient-to-br from-stone-200 to-stone-300 dark:from-stone-800 dark:to-stone-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="h-3 w-4/5 rounded bg-stone-300 dark:bg-stone-700" aria-hidden="true" />
          <div className="mt-2 h-2.5 w-3/5 rounded bg-stone-200 dark:bg-stone-800" aria-hidden="true" />
          <div className="mt-4 flex flex-wrap gap-1.5">
            {[t('home:preview.director'), t('home:preview.studio'), t('home:preview.series'), t('home:preview.tag')].map((label) => (
              <span key={label} className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 underline-offset-2 dark:bg-amber-500/10 dark:text-amber-400">
                {label}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[t('home:preview.actressA'), t('home:preview.actressB')].map((label) => (
              <span key={label} className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 underline decoration-rose-400 underline-offset-2 dark:bg-rose-500/10 dark:text-rose-400">
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-stone-200/70 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900/50">
        <div className="flex items-center gap-2">
          <Server className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
          <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400">{t('home:preview.magnet')}</span>
          <span className="ml-auto text-[10px] text-teal-600 dark:text-teal-400">{t('home:preview.available')}</span>
        </div>
      </div>
    </PreviewShell>
  );
};

const InboxPreview: React.FC = () => {
  const { t } = useTranslation(['home']);

  const items = [
    { icon: Radio, label: t('home:preview.inboxFollow'), time: '09:24' },
    { icon: MessageSquare, label: t('home:preview.inboxCommunity'), time: '09:12' },
    { icon: Bell, label: t('home:preview.inboxAnnouncement'), time: t('home:preview.yesterday') },
  ];

  return (
    <PreviewShell
      title={t('home:preview.inbox')}
      badge={<span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">3</span>}
    >
      <div className="space-y-2">
        {items.map(({ icon: Icon, label, time }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-stone-200/70 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900/50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-stone-700 dark:text-stone-300">{label}</span>
            <span className="ml-auto text-[10px] text-stone-400">{time}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-stone-100/80 px-3 py-2 dark:bg-stone-800/50">
        <span className="text-[10px] text-stone-500 dark:text-stone-400">{t('home:preview.unread')}</span>
        <span className="text-[10px] font-semibold text-stone-700 dark:text-stone-300">3</span>
      </div>
    </PreviewShell>
  );
};

const AccountPreview: React.FC = () => {
  const { t } = useTranslation(['home']);

  const rows = [
    { icon: FolderHeart, label: t('home:preview.favorites'), meta: '12' },
    { icon: History, label: t('home:preview.history'), meta: '46' },
    { icon: UserRound, label: t('home:preview.community'), meta: '9' },
  ];

  return (
    <PreviewShell
      title={t('home:preview.account')}
      badge={
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-teal-600 dark:text-teal-400">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
          {t('home:preview.synced')}
        </span>
      }
    >
      <div className="flex gap-1.5">
        {[t('home:preview.favorites'), t('home:preview.history'), t('home:preview.community')].map((tab, index) => (
          <span
            key={tab}
            className={clsx(
              'rounded-lg px-2.5 py-1 text-[10px] font-medium',
              index === 0
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400'
                : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
            )}
          >
            {tab}
          </span>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {rows.map(({ icon: Icon, label, meta }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-stone-200/70 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900/50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
              <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-stone-700 dark:text-stone-300">{label}</span>
            <span className="ml-auto text-[10px] text-stone-400">{meta}</span>
          </div>
        ))}
      </div>
    </PreviewShell>
  );
};

export const FeatureShowcase: React.FC<FeatureShowcaseProps> = ({ showCommunity }) => {
  const { t } = useTranslation(['home']);

  const features = [
    {
      id: 'search',
      title: t('home:features.searchTitle'),
      body: t('home:features.searchBody'),
      points: [
        t('home:features.searchPoint1'),
        t('home:features.searchPoint2'),
        t('home:features.searchPoint3'),
        t('home:features.searchPoint4'),
      ],
      caption: t('home:features.searchCaption'),
      preview: <SourceBoardPreview />,
    },
    {
      id: 'jav',
      title: t('home:features.javTitle'),
      body: t('home:features.javBody'),
      points: [
        t('home:features.javPoint1'),
        t('home:features.javPoint2'),
        t('home:features.javPoint3'),
        t('home:features.javPoint4'),
      ],
      caption: t('home:features.javCaption'),
      preview: <JavDetailPreview />,
    },
    {
      id: 'follow',
      title: t('home:features.followTitle'),
      body: t('home:features.followBody'),
      points: [
        t('home:features.followPoint1'),
        t('home:features.followPoint2'),
        t('home:features.followPoint3'),
      ],
      caption: t('home:features.followCaption'),
      preview: <InboxPreview />,
    },
    {
      id: 'account',
      title: showCommunity ? t('home:features.accountTitle') : t('home:features.accountTitleNoCommunity'),
      body: showCommunity ? t('home:features.accountBody') : t('home:features.accountBodyNoCommunity'),
      points: showCommunity
        ? [
            t('home:features.accountPoint1'),
            t('home:features.accountPoint2'),
            t('home:features.accountPoint3'),
          ]
        : [t('home:features.accountPoint1'), t('home:features.accountPoint2')],
      caption: showCommunity
        ? t('home:features.accountCaption')
        : t('home:features.accountCaptionNoCommunity'),
      preview: <AccountPreview />,
    },
  ];

  return (
    <section className="home-section border-t border-stone-200/60 dark:border-stone-800/60">
      <div className="home-container">
        <div className="max-w-3xl">
          <span className="home-eyebrow">{t('home:features.eyebrow')}</span>
          <h2 className="display-font mt-3 text-balance text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
            {t('home:features.title')}
          </h2>
        </div>

        <div className="mt-12 space-y-16 lg:mt-16 lg:space-y-24">
          {features.map((feature, index) => {
            const reversed = index % 2 === 1;
            return (
              <article
                key={feature.id}
                className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12"
              >
                <div className={clsx('min-w-0 lg:col-span-5', reversed && 'lg:order-2 lg:col-start-8')}>
                  <div className="flex items-center gap-3">
                    <span className="display-font text-sm font-bold text-amber-600 tabular-nums dark:text-amber-400">
                      0{index + 1}
                    </span>
                    <span className="h-px w-8 bg-stone-200 dark:bg-stone-700" aria-hidden="true" />
                  </div>
                  <h3 className="display-font mt-3 text-balance text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl dark:text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-4 text-[15px] leading-7 text-stone-600 dark:text-stone-400">{feature.body}</p>

                  <ul className="mt-5 space-y-2.5">
                    {feature.points.map((point) => (
                      <li key={point} className="flex gap-2.5 text-sm leading-6 text-stone-600 dark:text-stone-400">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} aria-hidden="true" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={clsx('min-w-0 lg:col-span-7', reversed && 'lg:order-1 lg:col-start-1')}>
                  {feature.preview}
                  <p className="mt-3 text-xs leading-5 text-stone-500 dark:text-stone-500">{feature.caption}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
