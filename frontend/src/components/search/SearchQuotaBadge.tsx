/**
 * 搜索配额徽标
 *
 * 搜索页常驻展示当前档位与窗口用量，问号浮层说明各档位晋升条件。
 * 数据源 /search/quota；refreshKey 变化时立即刷新（搜索完成由父组件递增）。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { searchApi } from '@/services/api';
import type { SearchQuotaData, SearchTierInfo, SearchTierRequirement } from '@/services/api';

interface SearchQuotaBadgeProps {
  /** 变化时立即重新拉取配额（搜索完成后由父组件 +1） */
  refreshKey?: number;
}

/** 档位名称走 i18n，后端 label 仅用于错误提示 */
function tierName(t: (key: string) => string, tier: number | null): string {
  return tier ? t(`quota.tier${tier}`) : '';
}

function limitText(tier: SearchTierInfo, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const minute = tier.limits.find((l) => l.unit === 'minute')?.max ?? 0;
  const hour = tier.limits.find((l) => l.unit === 'hour')?.max ?? 0;
  const day = tier.limits.find((l) => l.unit === 'day')?.max ?? 0;
  return t('quota.limitSummary', { minute, hour, day });
}

function requirementLabel(t: (key: string) => string, key: SearchTierRequirement['key']): string {
  if (key === 'accountAgeDays') return t('quota.reqAccountAge');
  if (key === 'activeDays') return t('quota.reqActiveDays');
  return t('quota.reqTotalSearches');
}

export const SearchQuotaBadge: React.FC<SearchQuotaBadgeProps> = ({ refreshKey = 0 }) => {
  const { t } = useTranslation('search');
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [data, setData] = useState<SearchQuotaData | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await searchApi.getQuota();
      if (res.success && res.data) setData(res.data);
    } catch {
      // 配额展示失败不影响搜索主流程，静默跳过
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setData(null);
      return;
    }
    void load();
  }, [load, refreshKey, isAuthenticated]);

  // 用量窗口按分钟滚动，页面可见时每分钟同步一次
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load, isAuthenticated]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!isAuthenticated || !data) return null;

  if (data.unlimited) {
    return (
      <div className="mt-2 ml-1 text-[11px] text-surface-500 dark:text-surface-400">
        {t('quota.unlimited')}
      </div>
    );
  }

  const minute = data.limits.find((l) => l.unit === 'minute');
  const day = data.limits.find((l) => l.unit === 'day');
  const nextTier = data.next;

  return (
    <div ref={containerRef} className="relative mt-2 ml-1 flex items-center gap-1.5 text-[11px] text-surface-500 dark:text-surface-400">
      <button
        type="button"
        aria-label={t('quota.label')}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="shrink-0 text-surface-400 hover:text-primary-500 dark:text-surface-500 dark:hover:text-primary-400 transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      <span className="text-primary-600 dark:text-primary-400 font-medium">
        {t('quota.tierTag', { name: tierName(t, data.tier), tier: data.tier })}
      </span>
      {minute && (
        <span>· {t('quota.minuteUsage', { count: minute.count, max: minute.max })}</span>
      )}
      {day && (
        <span className="hidden sm:inline">· {t('quota.dayUsage', { count: day.count, max: day.max })}</span>
      )}

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[19rem] rounded-xl border border-surface-200/70 bg-white p-3 text-left shadow-xl shadow-surface-900/10 dark:border-surface-700/70 dark:bg-[#17171a]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-heading">{t('quota.label')}</span>
            <span className="text-[11px] text-surface-400">{t('quota.tierTag', { name: tierName(t, data.tier), tier: data.tier })}</span>
          </div>

          <div className="mb-3 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-surface-500 dark:text-surface-400">
            {data.limits.map((limit) => (
              <span key={limit.unit}>
                {t(`quota.${limit.unit}Usage`, { count: limit.count, max: limit.max })}
              </span>
            ))}
          </div>

          <div className="mb-1.5 text-[11px] font-medium text-heading">{t('quota.upgradeTitle')}</div>
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5">
            {data.tiers.map((tier) => {
              const active = tier.tier === data.tier;
              const rule = tier.minTotalSearches > 0
                ? t('quota.ruleLineTotal', { age: tier.minAccountAgeDays, active: tier.minActiveDays, total: tier.minTotalSearches })
                : t('quota.ruleLine', { age: tier.minAccountAgeDays, active: tier.minActiveDays });
              return (
                <React.Fragment key={tier.tier}>
                  <span className={active ? 'font-semibold text-primary-600 dark:text-primary-400' : 'text-surface-500'}>
                    {tierName(t, tier.tier)} L{tier.tier}
                  </span>
                  <span className="text-surface-500 dark:text-surface-400">
                    {tier.tier === 1 ? t('quota.baseRule') : rule}
                    <span className="ml-1 text-surface-400 dark:text-surface-500">{limitText(tier, t)}</span>
                  </span>
                </React.Fragment>
              );
            })}
          </div>

          <div className="mt-2 border-t border-surface-200/60 pt-2 text-[11px] text-surface-400 dark:border-surface-700/60 dark:text-surface-500">
            {t('quota.activeDayHint')}
          </div>

          {nextTier && (
            <div className="mt-2 text-[11px] text-surface-500 dark:text-surface-400">
              <span className="font-medium text-heading">{t('quota.nextTier')}</span>{' '}
              {nextTier.requirements.map((req, i) => (
                <span key={req.key}>
                  {i > 0 && '、'}
                  {requirementLabel(t, req.key)}
                  <span className={req.current >= req.target ? 'text-primary-600 dark:text-primary-400' : ''}>
                    {' '}{req.current}/{req.target}
                  </span>
                </span>
              ))}
            </div>
          )}
          {!nextTier && <div className="mt-2 text-[11px] text-surface-500 dark:text-surface-400">{t('quota.maxTier')}</div>}
        </div>
      )}
    </div>
  );
};
