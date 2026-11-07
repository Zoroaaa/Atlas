import React, { useState } from 'react';
import { RefreshCw, Loader2, ChevronDown, ChevronRight, Flame } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useActresses } from '@/hooks';
import { JAV_ACTRESSES_DISPLAY } from '@/types';
import { FollowButton } from '@/components/follow/FollowButton';
import { PanelSection, PanelHeader, IconAction, CountBadge } from '@/components/workbench';

interface ActressesPanelProps {
  onActressClick: (name: string) => void;
}

export const ActressesPanel: React.FC<ActressesPanelProps> = ({ onActressClick }) => {
  const { t } = useTranslation(['jav']);
  const { data, isLoading, error, refresh } = useActresses();
  const [expanded, setExpanded] = useState(true);

  const items = (data?.items ?? []).slice(0, JAV_ACTRESSES_DISPLAY);
  if (!isLoading && (error || items.length === 0)) return null;

  return (
    <PanelSection>
      <PanelHeader
        icon={<Flame className="h-4 w-4 text-accent-500" />}
        title={t('jav:actresses.title')}
        count={items.length > 0 ? <CountBadge>{items.length}</CountBadge> : undefined}
        meta={t('jav:actresses.footerHint')}
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
          {isLoading ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-surface-400">
              <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
              <p className="type-micro">{t('jav:actresses.loadingActresses')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((actress, index) => (
                <div key={actress.name} className="relative">
                <button
                  type="button"
                  onClick={() => onActressClick(actress.name)}
                  className="min-h-16 w-full rounded-[10px] bg-surface-50/60 px-2.5 py-2 pr-8 text-left transition-colors hover:bg-surface-100 dark:bg-surface-900/40 dark:hover:bg-surface-800/60"
                  title={t('jav:actresses.viewWorksTitle', { name: actress.name })}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="type-micro w-4 shrink-0 text-right tabular-nums text-surface-400">{index + 1}</span>
                    <span className="truncate text-[12px] font-semibold text-surface-800 dark:text-surface-200">{actress.name}</span>
                  </span>
                  <span className="type-micro mt-1 flex items-center gap-2 pl-5 text-surface-500">
                    <span>{t('jav:actresses.followers', { count: actress.followers })}</span>
                    <span>{t('jav:actresses.works', { count: actress.works })}</span>
                  </span>
                </button>
                <FollowButton name={actress.name} variant="icon" className="absolute right-1 top-1" />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </PanelSection>
  );
};
