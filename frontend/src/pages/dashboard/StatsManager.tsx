import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Search,
  Heart,
  Clock,
  BarChart2,
  Target,
  Calendar,
  Zap,
  RefreshCw,
  Tag,
  Globe,
  Award,
} from 'lucide-react';
import { Card, Loading, Badge, EmptyState, Button } from '@/components/ui';
import { userApi } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SearchHistoryItem, FavoriteItem } from '@/types';

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

type TFunc = (key: string, options?: Record<string, unknown>) => string;

const getUserLevel = (total: number, t: TFunc): { label: string; color: string; next: number } => {
  if (total < 10)  return { label: t('dashboard:stats.userLevel.beginner'),   color: 'from-stone-400 to-stone-500',     next: 10  };
  if (total < 50)  return { label: t('dashboard:stats.userLevel.skilled'),   color: 'from-green-400 to-emerald-500',   next: 50  };
  if (total < 200) return { label: t('dashboard:stats.userLevel.professional'),   color: 'from-amber-400 to-amber-500',     next: 200 };
  if (total < 500) return { label: t('dashboard:stats.userLevel.expert'),   color: 'from-rose-400 to-rose-500',       next: 500 };
  return             { label: t('dashboard:stats.userLevel.master'),   color: 'from-amber-400 to-orange-500',    next: Infinity };
};

const getLast30DaysLabels = () => {
  const labels: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return labels;
};

const getLast7DaysLabels = (t: TFunc) => {
  const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const weekPrefix = t('dashboard:stats.weekPrefix');
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(`${weekPrefix}${t(`dashboard:stats.weekdays.${weekdayKeys[d.getDay()]}`)}`);
  }
  return labels;
};

// ─── 子组件 ───────────────────────────────────────────────────────────────────

const StatMiniCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  gradient: string;
  sub?: string;
}> = ({ icon, label, value, gradient, sub }) => (
  <div className="flex items-center gap-4 p-4 bg-surface-50 dark:bg-surface-800/60 rounded-xl border border-surface-200/60 dark:border-surface-700/40 hover:shadow-md transition-all">
    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-md flex-shrink-0`}>
      {icon}
    </div>
    <div>
      <p className="text-xs text-surface-500 dark:text-surface-400">{label}</p>
      <p className="text-xl font-bold text-surface-900 dark:text-surface-100 leading-tight">{value}</p>
      {sub && <p className="text-xs text-surface-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// 简易柱状图
const BarChart: React.FC<{
  data: number[];
  labels: string[];
  color: string;
  height?: number;
  t: TFunc;
}> = ({ data, labels, color, height = 80, t }) => {
  const max = Math.max(...data, 1);
  const showEvery = Math.ceil(labels.length / 10);
  const labelHeight = 16;
  const gap = 2;
  const chartHeight = height - labelHeight - gap;

  return (
    <div className="flex items-end gap-0.5 w-full" style={{ height }}>
      {data.map((val, i) => {
        const barHeight = max > 0 && val > 0
          ? Math.max((val / max) * chartHeight, 4)
          : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
              <div className="bg-surface-900 dark:bg-surface-100 text-surface-100 dark:text-surface-900 text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg">
                {t('dashboard:stats.barTooltip', { label: labels[i], count: val })}
              </div>
            </div>
            <div
              className={`w-full rounded-t transition-all duration-500 ${color}`}
              style={{ height: barHeight }}
            />
            {i % showEvery === 0 && (
              <span className="text-[9px] text-surface-400 dark:text-surface-500 truncate w-full text-center">
                {labels[i]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

// 热力格子
const HeatmapCell: React.FC<{ value: number; max: number; label: string; sublabel?: string; t: TFunc }> = ({
  value, max, label, sublabel, t,
}) => {
  const intensity = max > 0 ? value / max : 0;
  const bg =
    intensity === 0 ? 'bg-surface-100 dark:bg-surface-800 border-surface-200 dark:border-surface-700'
    : intensity < 0.25 ? 'bg-primary-100 dark:bg-primary-900/40 border-primary-200 dark:border-primary-800'
    : intensity < 0.5  ? 'bg-primary-200 dark:bg-primary-800/60 border-primary-300 dark:border-primary-700'
    : intensity < 0.75 ? 'bg-primary-400 dark:bg-primary-600/80 border-primary-400 dark:border-primary-600'
    : 'bg-primary-600 dark:bg-primary-500 border-primary-600 dark:border-primary-500';
  const text = intensity > 0.5 ? 'text-white' : 'text-surface-700 dark:text-surface-300';

  return (
    <div className={`flex-1 rounded-lg border p-3 flex flex-col items-center gap-1 transition-all hover:scale-105 cursor-default ${bg} group relative`}>
      <div className={`absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none`}>
        <div className="bg-surface-900 dark:bg-surface-100 text-surface-100 dark:text-surface-900 text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg">
          {t('dashboard:stats.heatmapTooltip', { label, count: value })}
        </div>
      </div>
      <span className={`text-xs font-medium ${text}`}>{label}</span>
      <span className={`text-lg font-bold ${text}`}>{value}</span>
      {sublabel && <span className={`text-[9px] ${text} opacity-70`}>{sublabel}</span>}
    </div>
  );
};

// 关键词云
const KeywordCloud: React.FC<{ keywords: Array<{ keyword: string; count: number }>; t: TFunc }> = ({ keywords, t }) => {
  if (keywords.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-surface-400 dark:text-surface-500 text-sm">
        {t('dashboard:stats.noSearchData')}
      </div>
    );
  }
  const max = Math.max(...keywords.map(k => k.count));
  const min = Math.min(...keywords.map(k => k.count));
  const range = max - min || 1;
  return (
    <div className="flex flex-wrap gap-2 py-2">
      {keywords.map(({ keyword, count }) => {
        const ratio = (count - min) / range;
        const size = 11 + Math.round(ratio * 14); // 11px~25px
        const opacity = 0.55 + ratio * 0.45;
        const colors = [
          'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30',
          'text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/30',
          'text-success-600 dark:text-success-400 hover:bg-success-50 dark:hover:bg-success-900/30',
          'text-warning-600 dark:text-warning-400 hover:bg-warning-50 dark:hover:bg-warning-900/30',
        ];
        const colorClass = colors[keyword.charCodeAt(0) % colors.length];
        return (
          <span
            key={keyword}
            className={`cursor-pointer px-2 py-0.5 rounded-full font-medium transition-all ${colorClass} border border-transparent hover:border-current`}
            style={{ fontSize: size, opacity }}
            title={t('dashboard:stats.searchCountTitle', { count })}
          >
            {keyword}
          </span>
        );
      })}
    </div>
  );
};

// 搜索源使用条
const SourceUsageBar: React.FC<{
  name: string;
  count: number;
  total: number;
  rank: number;
  t: TFunc;
}> = ({ name, count, total, rank, t }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const rankColors = ['from-amber-400 to-yellow-500', 'from-stone-300 to-stone-400', 'from-amber-600 to-amber-700'];
  const barColor = rank <= 3 ? 'bg-gradient-to-r from-primary-500 to-primary-400' : 'bg-gradient-to-r from-surface-400 to-surface-300 dark:from-surface-600 dark:to-surface-500';

  return (
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br ${rankColors[rank - 1] || 'from-surface-400 to-surface-500'} flex-shrink-0`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">{name}</span>
          <span className="text-xs text-surface-500 ml-2 flex-shrink-0">{t('dashboard:stats.sourceUsageCount', { count, percent: pct })}</span>
        </div>
        <div className="h-2 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// 用户等级卡
const UserLevelCard: React.FC<{ totalActions: number; t: TFunc }> = ({ totalActions, t }) => {
  const level = getUserLevel(totalActions, t);
  const prevThreshold = totalActions < 10 ? 0 : totalActions < 50 ? 10 : totalActions < 200 ? 50 : totalActions < 500 ? 200 : 500;
  const nextThreshold = level.next === Infinity ? totalActions : level.next;
  const progress = level.next === Infinity ? 100 : Math.min(100, Math.round(((totalActions - prevThreshold) / (nextThreshold - prevThreshold)) * 100));

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${level.color} p-5 text-white shadow-lg`}>
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
      <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-black/10 translate-y-6 -translate-x-4" />
      <div className="relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-white/70 font-medium">{t('dashboard:stats.userLevelLabel')}</p>
            <p className="text-xl font-bold">{level.label}</p>
          </div>
        </div>
        <div className="mt-2">
          <div className="flex justify-between text-xs text-white/70 mb-1">
            <span>{t('dashboard:stats.totalActionsCount', { count: totalActions })}</span>
            {level.next !== Infinity && <span>{t('dashboard:stats.toNextLevel', { count: level.next - totalActions })}</span>}
            {level.next === Infinity && <span>{t('dashboard:stats.maxLevelReached')}</span>}
          </div>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white/60 transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export const StatsManager: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['dashboard']);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [serverStats, setServerStats] = useState<{ totalSearches: number; topSources: Array<{ source: string; count: number }> } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [histRes, favRes, statsRes] = await Promise.allSettled([
        userApi.getSearchHistory(500),
        userApi.getFavorites(),
        userApi.getSearchStats(),
      ]);

      if (histRes.status === 'fulfilled' && histRes.value.success && histRes.value.data) {
        setHistory(histRes.value.data.history || []);
      }
      if (favRes.status === 'fulfilled' && favRes.value.success && favRes.value.data) {
        setFavorites(favRes.value.data.favorites || []);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value.success && statsRes.value.data) {
        setServerStats(statsRes.value.data);
      }
    } catch (e) {
      console.error('Stats load error', e);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadData();
      setIsLoading(false);
    };
    init();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  // ── 计算统计 ──
  const now = Date.now();

  const last30Days = Array(30).fill(0);
  const last7Days = Array(7).fill(0);

  history.forEach(item => {
    const daysDiff = Math.floor((now - item.createdAt) / 86400000);
    if (daysDiff < 30) last30Days[29 - daysDiff]++;
    if (daysDiff < 7) last7Days[6 - daysDiff]++;
  });

  const todayCount = last7Days[6];
  const weekCount = last7Days.reduce((a, b) => a + b, 0);

  const uniqueKeywords = new Set(history.map(h => h.query)).size;
  const activeDays = new Set(history.map(h => new Date(h.createdAt).toDateString())).size;

  // 关键词词频
  const kwFreq: Record<string, number> = {};
  history.forEach(h => {
    const kw = h.query?.trim();
    if (kw) kwFreq[kw] = (kwFreq[kw] || 0) + 1;
  });
  const topKeywords = Object.entries(kwFreq)
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  // 搜索源分布
  const srcFreq: Record<string, number> = {};
  history.forEach(h => {
    const src = h.source || 'unknown';
    srcFreq[src] = (srcFreq[src] || 0) + 1;
  });
  const totalSrcSearches = history.length;
  const topSources = Object.entries(srcFreq)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const totalActions = history.length + favorites.length;
  const week7Labels = getLast7DaysLabels(t);
  const month30Labels = getLast30DaysLabels();

  const maxWeek = Math.max(...last7Days, 1);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="lg" text={t('dashboard:stats.loading')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 页头 ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center shadow-lg shadow-amber-500/25">
            <BarChart2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">{t('dashboard:stats.title')}</h2>
            <p className="text-surface-500 dark:text-surface-400">{t('dashboard:stats.subtitle')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} isLoading={isRefreshing} leftIcon={<RefreshCw className="w-4 h-4" />}>
          {t('dashboard:stats.refresh')}
        </Button>
      </div>

      {/* ── 用户等级 + 基础统计 ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <UserLevelCard totalActions={totalActions} t={t} />
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatMiniCard
            icon={<Search className="w-5 h-5" />}
            label={t('dashboard:stats.statCards.totalSearches')}
            value={serverStats?.totalSearches ?? history.length}
            gradient="from-primary-500 to-primary-600"
            sub={t('dashboard:stats.statCards.todayCount', { count: todayCount })}
          />
          <StatMiniCard
            icon={<Calendar className="w-5 h-5" />}
            label={t('dashboard:stats.statCards.weeklySearches')}
            value={weekCount}
            gradient="from-accent-500 to-accent-600"
            sub={t('dashboard:stats.statCards.activeDays', { count: activeDays })}
          />
          <StatMiniCard
            icon={<Target className="w-5 h-5" />}
            label={t('dashboard:stats.statCards.uniqueKeywords')}
            value={uniqueKeywords}
            gradient="from-cyan-500 to-teal-600"
          />
          <StatMiniCard
            icon={<Heart className="w-5 h-5" />}
            label={t('dashboard:stats.statCards.totalFavorites')}
            value={favorites.length}
            gradient="from-error-500 to-pink-600"
            sub={t('dashboard:stats.statCards.clickToManage')}
          />
          <StatMiniCard
            icon={<Clock className="w-5 h-5" />}
            label={t('dashboard:stats.statCards.activeDaysCount')}
            value={activeDays}
            gradient="from-success-500 to-emerald-600"
          />
          <StatMiniCard
            icon={<Zap className="w-5 h-5" />}
            label={t('dashboard:stats.statCards.dailyAverage')}
            value={activeDays > 0 ? Math.round(history.length / activeDays) : 0}
            gradient="from-warning-500 to-orange-600"
            sub={t('dashboard:stats.statCards.perActiveDay')}
          />
        </div>
      </div>

      {/* ── 30天趋势图 ── */}
      <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </div>
          <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{t('dashboard:stats.trend30Days')}</h3>
        </div>
        {history.length > 0 ? (
          <BarChart
            data={last30Days}
            labels={month30Labels}
            color="bg-gradient-to-t from-primary-600 to-primary-400 dark:from-primary-500 dark:to-primary-300"
            height={100}
            t={t}
          />
        ) : (
          <div className="flex items-center justify-center h-24 text-surface-400 text-sm">{t('dashboard:stats.noSearchData')}</div>
        )}
      </Card>

      {/* ── 一周热力图 ── */}
      <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-accent-600 dark:text-accent-400" />
          </div>
          <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{t('dashboard:stats.weekHeatmap')}</h3>
        </div>
        <div className="flex gap-2">
          {last7Days.map((val, i) => (
            <HeatmapCell key={i} value={val} max={maxWeek} label={week7Labels[i]} t={t} />
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── 关键词云 ── */}
        <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
              <Tag className="w-4 h-4 text-success-600 dark:text-success-400" />
            </div>
            <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{t('dashboard:stats.hotKeywords')}</h3>
            <Badge variant="outline" className="ml-auto text-xs">{t('dashboard:stats.keywordsCount', { count: topKeywords.length })}</Badge>
          </div>
          {topKeywords.length > 0 ? (
            <KeywordCloud keywords={topKeywords} t={t} />
          ) : (
            <EmptyState
              icon={<Tag className="w-10 h-10" />}
              title={t('dashboard:stats.noKeywordsTitle')}
              description={t('dashboard:stats.noKeywordsDesc')}
            />
          )}
        </Card>

        {/* ── 搜索源分布 ── */}
        <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center">
              <Globe className="w-4 h-4 text-warning-600 dark:text-warning-400" />
            </div>
            <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{t('dashboard:stats.sourceDistribution')}</h3>
          </div>
          {topSources.length > 0 ? (
            <div className="space-y-3">
              {topSources.map((src, i) => (
                <SourceUsageBar
                  key={src.source}
                  name={src.source === 'unknown' ? t('dashboard:stats.unknownSource') : src.source}
                  count={src.count}
                  total={totalSrcSearches}
                  rank={i + 1}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Globe className="w-10 h-10" />}
              title={t('dashboard:stats.noSourceDataTitle')}
              description={t('dashboard:stats.noSourceDataDesc')}
            />
          )}
        </Card>
      </div>

      {/* ── 最近高频搜索 Top10 ── */}
      {topKeywords.length > 0 && (
        <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-error-100 dark:bg-error-900/30 flex items-center justify-center">
              <Search className="w-4 h-4 text-error-600 dark:text-error-400" />
            </div>
            <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{t('dashboard:stats.searchRanking')}</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {topKeywords.slice(0, 10).map((kw, i) => (
              <div
                key={kw.keyword}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors cursor-pointer group"
                onClick={() => navigate(`/?q=${encodeURIComponent(kw.keyword)}`)}
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                  : i === 1 ? 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                  : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                  : 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-400'
                }`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-surface-800 dark:text-surface-200 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {kw.keyword}
                </span>
                <span className="text-xs text-surface-400 dark:text-surface-500 flex-shrink-0">{t('dashboard:stats.searchCountTitle', { count: kw.count })}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default StatsManager;
