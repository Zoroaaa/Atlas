import React, { useState } from 'react';
import { RefreshCw, Loader2, ChevronDown, ChevronRight, Flame } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useActresses } from '@/hooks';
import { JAV_ACTRESSES_DISPLAY } from '@/types';
import { FollowButton } from '@/components/follow/FollowButton';
import { PanelSection, PanelHeader, IconAction, CountBadge } from '@/components/workbench';
import { Tooltip } from '@/components/ui';
import { pageActionClass } from './JavRankingsPanel';

interface ActressesPanelProps {
  onActressClick: (name: string) => void;
  /** page：作为独立页面内容渲染，不显示折叠头与面板外壳 */
  layout?: 'panel' | 'page';
}

export const ActressesPanel: React.FC<ActressesPanelProps> = ({ onActressClick, layout = 'panel' }) => {
  const { t } = useTranslation(['jav']);
  const { data, isLoading, error, refresh } = useActresses();
  const [expanded, setExpanded] = useState(true);

  const items = (data?.items ?? []).slice(0, JAV_ACTRESSES_DISPLAY);
  if (!isLoading && (error || items.length === 0)) return null;

  const body = isLoading ? (
    <div className="flex h-32 flex-col items-center justify-center gap-2 text-surface-400">
      <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
      <p className="type-micro">{t('jav:actresses.loadingActresses')}</p>
    </div>
  ) : (
    <div className={clsx('divide-y divide-surface-100 dark:divide-surface-800/70', layout === 'page' && 'sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0 lg:grid-cols-4')}>
      {items.map((actress, index) => (
        <div key={actress.name} className={clsx('flex items-center gap-2.5 py-2.5', layout === 'page' && 'border-b border-surface-100 dark:border-surface-800/70')}>
          <button
            type="button"
            onClick={() => onActressClick(actress.name)}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            title={t('jav:actresses.viewWorksTitle', { name: actress.name })}
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-100 text-[13px] font-semibold text-surface-500 dark:bg-surface-800 dark:text-surface-300"
              aria-hidden="true"
            >
              {actress.name.trim().charAt(0) || index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-surface-800 dark:text-surface-200">
                {actress.name}
              </span>
              <span className="type-micro mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-surface-500">
                <span className="tabular-nums text-surface-400">#{index + 1}</span>
                <span className="whitespace-nowrap">{t('jav:actresses.followers', { count: actress.followers })}</span>
                <span className="whitespace-nowrap">{t('jav:actresses.works', { count: actress.works })}</span>
              </span>
            </span>
          </button>
          <FollowButton name={actress.name} variant="icon" className="shrink-0" />
        </div>
      ))}
    </div>
  );

  if (layout === 'page') {
    return (
      <div>
        <div className="flex items-center justify-end pb-4">
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className={pageActionClass}
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            {t('jav:actresses.refresh')}
          </button>
        </div>
        {body}
      </div>
    );
  }

  return (
    <PanelSection>
      <PanelHeader
        icon={<Flame className="h-4 w-4 text-accent-500" />}
        title={t('jav:actresses.title')}
        count={items.length > 0 ? <CountBadge>{items.length}</CountBadge> : undefined}
        info={
          <Tooltip
            content={t('jav:actresses.footerHint')}
            label={t('jav:panelInfo.show')}
          />
        }
        onToggle={() => setExpanded((value) => !value)}
        expanded={expanded}
        ariaControls="main-actresses"
        actions={
          <>
            <IconAction
              icon={<RefreshCw className={clsx('h-3.5 w-3.5', isLoading && 'animate-spin')} />}
              label={t('jav:actresses.refresh')}
              onClick={refresh}
              disabled={isLoading}
            />
            {expanded ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
          </>
        }
      />

      {expanded ? (
        <div id="main-actresses" className="px-4 pb-4 sm:px-5 sm:pb-5">
          {body}
        </div>
      ) : null}
    </PanelSection>
  );
};
