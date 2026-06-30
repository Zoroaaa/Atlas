import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { adminApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { actionLabels } from './shared';

export const TrendsTab: React.FC = () => {
  const toast = useToast();
  const [trends, setTrends] = useState<any>(null);
  const [behavior, setBehavior] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try { const [t, b] = await Promise.all([adminApi.getDashboardTrends(days), adminApi.getUserBehavior(days)]); setTrends(t); setBehavior(b); }
      catch { toast.error('加载趋势数据失败'); } finally { setLoading(false); }
    };
    load();
  }, [days, toast]);

  const MiniChart: React.FC<{ data: { date: string; count: number }[]; color: string; title: string }> = ({ data, color, title }) => {
    const maxVal = Math.max(...data.map(d => d.count), 1);
    return (
      <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
        <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-3 text-sm">{title}</h3>
        <div className="flex items-end gap-1 h-20">
          {data.map((item, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center group relative" title={`${item.date}: ${item.count}`}>
              <div className={clsx('w-full rounded-sm transition-all hover:opacity-80', color)} style={{ height: `${Math.max((item.count / maxVal) * 100, 2)}%`, minHeight: '2px' }} />
              {data.length <= 14 && idx % Math.ceil(data.length / 7) === 0 && (
                <span className="text-[9px] text-surface-400 mt-0.5 truncate">{item.date.slice(5)}</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-surface-400 mt-2">
          <span>最小: {Math.min(...data.map(d => d.count))}</span>
          <span>最大: {Math.max(...data.map(d => d.count))}</span>
          <span>总计: {data.reduce((s, d) => s + d.count, 0)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        {[7, 14, 30].map(d => <button key={d} onClick={() => setDays(d)} className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', days === d ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800')}>近{d}天</button>)}
      </div>

      {loading ? <div className="text-center py-12 text-surface-500">加载中...</div> : (
        <>
          {trends && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MiniChart data={trends.userRegistrations || []} color="bg-amber-400 dark:bg-amber-500" title="用户注册趋势" />
              <MiniChart data={trends.dailySearches || []} color="bg-green-400 dark:bg-green-500" title="每日搜索趋势" />
              <MiniChart data={(trends.dailyLogins || []).map((d: any) => ({ date: d.date, count: d.success ?? d.total }))} color="bg-rose-400 dark:bg-rose-500" title="每日登录（成功）" />
              <MiniChart data={trends.dailyActiveUsers || []} color="bg-orange-400 dark:bg-orange-500" title="每日活跃用户" />
            </div>
          )}
          {behavior && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">操作类型分布</h3>
                <div className="space-y-2">
                  {(behavior.actionsByType || []).slice(0, 8).map((item: any) => {
                    const total = behavior.actionsByType.reduce((s: number, i: any) => s + i.count, 0);
                    const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                    return (
                      <div key={item.action} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-surface-600 dark:text-surface-400 truncate">{actionLabels[item.action] || item.action}</div>
                        <div className="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2"><div className="bg-primary-500 h-2 rounded-full" style={{ width: `${pct}%` }} /></div>
                        <div className="w-8 text-right text-xs font-medium text-surface-700 dark:text-surface-300">{pct}%</div>
                        <div className="w-10 text-right text-xs text-surface-500">{item.count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">最活跃用户 Top 10</h3>
                <div className="space-y-2">
                  {(behavior.topActiveUsers || []).slice(0, 10).map((user: any, idx: number) => (
                    <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50">
                      <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0', idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-stone-100 text-stone-700' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400')}>{idx + 1}</div>
                      <div className="flex-1 min-w-0"><div className="font-medium text-sm text-surface-900 dark:text-surface-100 truncate">{user.username}</div></div>
                      <div className="text-sm font-bold text-primary-600 dark:text-primary-400 shrink-0">{user.action_count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
