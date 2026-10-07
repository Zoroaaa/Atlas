import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { Trophy, Search, Heart, LogIn, Users, RefreshCw, Crown, MoreHorizontal, Zap, Activity } from 'lucide-react';
import { adminApi } from '@/services/api';
import type { ActivityRanking, ActivityRankingEntry, ActivityRankingMetric, ActivityRankingPeriod } from '@/services/api/admin';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from 'react-i18next';
import { TableWrapper, formatRelativeTime } from './shared';

type Period = ActivityRankingPeriod;
type Metric = ActivityRankingMetric;

const PERIODS: Period[] = ['today', 'week', 'month', 'all'];
const METRICS: Metric[] = ['overall', 'search', 'favorite'];

/** 各维度的主题配色与取值函数（榜单主指标） */
const metricTheme: Record<Metric, { icon: React.ElementType; accent: string; bar: string; value: (e: ActivityRankingEntry) => number }> = {
  overall: { icon: Trophy, accent: 'text-amber-500', bar: 'bg-gradient-to-r from-amber-400 to-orange-500', value: e => e.score },
  search: { icon: Search, accent: 'text-sky-500', bar: 'bg-gradient-to-r from-sky-400 to-blue-500', value: e => e.searches },
  favorite: { icon: Heart, accent: 'text-rose-500', bar: 'bg-gradient-to-r from-rose-400 to-pink-500', value: e => e.favorites },
};

/** 前三名奖牌配色 */
const podiumTheme = [
  { ring: 'from-amber-300 to-yellow-500', label: 'text-amber-600 dark:text-amber-400' },
  { ring: 'from-slate-300 to-slate-500', label: 'text-slate-500 dark:text-slate-300' },
  { ring: 'from-orange-300 to-amber-700', label: 'text-orange-600 dark:text-orange-400' },
];

export const ActivityRankingTab: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
  const [data, setData] = useState<ActivityRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('week');
  const [metric, setMetric] = useState<Metric>('overall');
  const [limit, setLimit] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.getActivityRanking({ period, limit }));
    } catch {
      toast.error(t('admin:activityRanking.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [period, limit, toast, t]);

  useEffect(() => { load(); }, [load]);

  const entries = data?.rankings[metric] || [];
  const theme = metricTheme[metric];
  const topValue = entries.length > 0 ? theme.value(entries[0]) : 0;

  return (
    <div className="space-y-5">
      {/* 时间范围 / 榜单维度 / Top-N */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', period === p ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800')}>
              {t(`admin:activityRanking.period.${p}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1.5 p-1 rounded-xl bg-surface-100 dark:bg-surface-800">
            {METRICS.map(m => {
              const Icon = metricTheme[m].icon;
              return (
                <button key={m} onClick={() => setMetric(m)} className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all', metric === m ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300')}>
                  <Icon className={clsx('w-4 h-4', metric === m && metricTheme[m].accent)} />
                  {t(`admin:activityRanking.metric.${m}`)}
                </button>
              );
            })}
          </div>
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm">
            {[20, 50, 100].map(n => <option key={n} value={n}>{t('admin:activityRanking.topN', { count: n })}</option>)}
          </select>
          <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-surface-200 dark:border-surface-700 text-surface-500 hover:text-primary-600 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors disabled:opacity-50" title={t('admin:activityRanking.refresh')}>
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-surface-500">{t('admin:activityRanking.loading')}</div>
      ) : data ? (
        <>
          {/* 周期总览 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Users, label: t('admin:activityRanking.card.activeUsers'), value: data.summary.activeUsers, color: 'from-violet-500 to-purple-600' },
              { icon: Search, label: t('admin:activityRanking.card.totalSearches'), value: data.summary.totalSearches, color: 'from-sky-500 to-blue-600' },
              { icon: Heart, label: t('admin:activityRanking.card.totalFavorites'), value: data.summary.totalFavorites, color: 'from-rose-500 to-pink-600' },
              { icon: LogIn, label: t('admin:activityRanking.card.totalLogins'), value: data.summary.totalLogins, color: 'from-emerald-500 to-green-600' },
            ].map(c => (
              <div key={c.label} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-4 flex items-center gap-3">
                <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br', c.color)}>
                  <c.icon className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{c.label}</p>
                  <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{c.value.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 前三名领奖台 */}
          {entries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {entries.slice(0, 3).map((e, i) => {
                const p = podiumTheme[i];
                const medal = i === 0 ? null : i === 1 ? '🥈' : '🥉';
                const isCrown = i === 0;
                return (
                  <div key={e.userId} className={clsx(
                    'relative rounded-2xl border p-5 text-center overflow-hidden',
                    'bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700',
                    isCrown && 'sm:-mt-2 sm:pb-7 shadow-lg',
                    !isCrown && 'sm:mt-2'
                  )}>
                    <div className={clsx('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', p.ring)} />
                    <div className={clsx('absolute -right-8 -top-8 w-28 h-28 rounded-full bg-gradient-to-br opacity-10', p.ring)} />
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                      {isCrown ? <Crown className="w-4 h-4 text-amber-500" /> : <span className="text-lg leading-none">{medal}</span>}
                      <span className={clsx('text-xs font-bold uppercase tracking-wider', p.label)}>{t('admin:activityRanking.podium.rank', { count: e.rank })}</span>
                    </div>
                    <div className={clsx('w-14 h-14 mx-auto rounded-full bg-gradient-to-br flex items-center justify-center text-white text-lg font-bold shadow-md mb-3', p.ring)}>
                      {e.username.charAt(0).toUpperCase()}
                    </div>
                    <p className="font-semibold text-surface-900 dark:text-surface-100 truncate" title={e.username}>{e.username}</p>
                    <p className="text-xs text-surface-500 truncate">{e.roleDisplayName}</p>
                    <div className="mt-3 flex items-baseline justify-center gap-1.5">
                      <span className={clsx('text-3xl font-extrabold tabular-nums', theme.accent)}>{theme.value(e).toLocaleString()}</span>
                      <span className="text-xs text-surface-400">{t(`admin:activityRanking.metric.${metric}`)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-surface-500 dark:text-surface-400">
                      <span className="inline-flex items-center gap-1"><Search className="w-3 h-3 text-sky-500" />{e.searches.toLocaleString()}</span>
                      <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3 text-rose-500" />{e.favorites.toLocaleString()}</span>
                      <span className="inline-flex items-center gap-1"><LogIn className="w-3 h-3 text-emerald-500" />{e.logins.toLocaleString()}</span>
                    </div>
                    {!e.isActive && (
                      <span className="mt-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">{t('admin:activityRanking.statusInactive')}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 完整榜单 */}
          <TableWrapper>
            <table className="w-full text-sm">
              <thead className="bg-surface-50 dark:bg-surface-900">
                <tr>
                  {[
                    t('admin:activityRanking.table.colRank'),
                    t('admin:activityRanking.table.colUser'),
                    t('admin:activityRanking.table.colSearches'),
                    t('admin:activityRanking.table.colFavorites'),
                    t('admin:activityRanking.table.colLogins'),
                    t('admin:activityRanking.table.colOthers'),
                    t(`admin:activityRanking.metricValue.${metric}`),
                    t('admin:activityRanking.table.colLastActive'),
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                {entries.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-surface-500">{t('admin:activityRanking.table.empty')}</td></tr>
                ) : entries.map(e => {
                  const v = theme.value(e);
                  const pct = topValue > 0 ? Math.max((v / topValue) * 100, 2) : 0;
                  return (
                    <tr key={e.userId} className={clsx('hover:bg-surface-50 dark:hover:bg-surface-700/50', e.rank <= 3 && 'bg-amber-50/40 dark:bg-amber-900/5')}>
                      <td className="px-4 py-3">
                        {e.rank <= 3 ? (
                          <span className={clsx('inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white bg-gradient-to-br', podiumTheme[e.rank - 1].ring)}>
                            {e.rank}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold text-surface-500 bg-surface-100 dark:bg-surface-700">{e.rank}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0', e.rank <= 3 ? clsx('bg-gradient-to-br text-white', podiumTheme[e.rank - 1].ring) : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300')}>
                            {e.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-surface-900 dark:text-surface-100 truncate">{e.username}</span>
                              {!e.isActive && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 shrink-0">{t('admin:activityRanking.statusInactive')}</span>}
                            </div>
                            <div className="text-xs text-surface-500 truncate">{e.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="font-semibold text-sky-600 dark:text-sky-400 tabular-nums">{e.searches.toLocaleString()}</span></td>
                      <td className="px-4 py-3"><span className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">{e.favorites.toLocaleString()}</span></td>
                      <td className="px-4 py-3"><span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{e.logins.toLocaleString()}</span></td>
                      <td className="px-4 py-3 text-surface-500 tabular-nums hidden md:table-cell">{e.otherActions.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2 overflow-hidden">
                            <div className={clsx('h-2 rounded-full transition-all', theme.bar)} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={clsx('text-xs font-bold tabular-nums shrink-0', theme.accent)}>{v.toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-surface-500 whitespace-nowrap hidden lg:table-cell">{e.lastActiveAt ? formatRelativeTime(e.lastActiveAt) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>

          {/* 计分规则说明 */}
          <div className="flex items-center gap-2 text-xs text-surface-400 dark:text-surface-500">
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>
              {t('admin:activityRanking.scoreFormula', data.weights)}
              <span className="mx-1.5">·</span>
              <Activity className="w-3 h-3 inline-block mr-1 -mt-0.5" />
              {t('admin:activityRanking.periodNote')}
            </span>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-surface-500">
          <MoreHorizontal className="w-6 h-6 mx-auto mb-2 text-surface-300" />
          {t('admin:activityRanking.table.empty')}
        </div>
      )}
    </div>
  );
};
