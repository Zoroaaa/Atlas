import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2, CheckCircle, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { adminApi } from '@/services/api';
import type { CleanupResult, CleanupTargetPreview } from '@/services/api/admin';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useNotification';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { TableWrapper } from './shared';

/** 数据清理：预览各目标可清理数量，勾选后由超级管理员执行 */
export const CleanupTab: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === 'super_admin';

  const [targets, setTargets] = useState<CleanupTargetPreview[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const data = await adminApi.previewCleanup();
      setTargets(data.items);
    } catch {
      toast.error(t('admin:cleanup.previewFailed'));
    } finally {
      setLoadingPreview(false);
    }
  }, [toast, t]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const allSelected = targets.length > 0 && selected.size === targets.length;
  const selectedCount = useMemo(
    () => targets.filter((item) => selected.has(item.key)).reduce((sum, item) => sum + item.count, 0),
    [targets, selected]
  );

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(targets.map((item) => item.key)));
  };

  const handleCleanup = async () => {
    if (!isSuperAdmin || selected.size === 0) return;
    if (!confirm(t('admin:cleanup.confirmSelected', { count: selectedCount }))) return;
    setExecuting(true);
    try {
      const data = await adminApi.cleanup([...selected]);
      setResult(data);
      toast.success(t('admin:cleanup.successToast'));
      await loadPreview();
    } catch {
      toast.error(t('admin:cleanup.failedToast'));
    } finally {
      setExecuting(false);
    }
  };

  const retentionText = (days: number) =>
    days > 0 ? t('admin:cleanup.retentionDays', { count: days }) : t('admin:cleanup.expiredOnly');

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-orange-700 dark:text-orange-400 mb-2">{t('admin:cleanup.noticeTitle')}</h3>
            <p className="text-sm text-orange-600 dark:text-orange-400/80 mb-2">{t('admin:cleanup.autoCleanDesc')}</p>
            <ul className="text-sm text-orange-600 dark:text-orange-400/80 space-y-1 mb-3">
              <li>{t('admin:cleanup.autoCleanSessions')}</li>
              <li>{t('admin:cleanup.autoCleanEmailVerifications')}</li>
              <li>{t('admin:cleanup.autoCleanLockouts')}</li>
            </ul>
            <p className="text-sm text-orange-600 dark:text-orange-400/80">{t('admin:cleanup.retentionDesc')}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadPreview} disabled={loadingPreview}>
            <RefreshCw className={clsx('w-4 h-4 mr-2', loadingPreview && 'animate-spin')} />
            {t('admin:cleanup.refreshPreview')}
          </Button>
          <span className="text-sm text-surface-500">
            {t('admin:cleanup.selectedCount', { count: selectedCount })}
          </span>
        </div>
        <Button
          variant="primary"
          onClick={handleCleanup}
          disabled={!isSuperAdmin || executing || selected.size === 0}
          title={!isSuperAdmin ? t('admin:cleanup.superAdminOnly') : undefined}
        >
          {executing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
          {executing ? t('admin:cleanup.executing') : t('admin:cleanup.executeSelected')}
        </Button>
      </div>

      {!isSuperAdmin && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <ShieldAlert className="w-4 h-4" />
          {t('admin:cleanup.superAdminOnly')}
        </div>
      )}

      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  aria-label={t('admin:cleanup.selectAll')}
                  checked={allSelected}
                  disabled={!isSuperAdmin || targets.length === 0}
                  onChange={toggleAll}
                  className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                />
              </th>
              {[
                t('admin:cleanup.table.target'),
                t('admin:cleanup.table.mode'),
                t('admin:cleanup.table.retention'),
                t('admin:cleanup.table.count'),
              ].map((label) => (
                <th key={label} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400 whitespace-nowrap">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loadingPreview ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-surface-500">{t('admin:cleanup.previewLoading')}</td></tr>
            ) : targets.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-surface-500">{t('admin:cleanup.empty')}</td></tr>
            ) : targets.map((item) => (
              <tr key={item.key} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={t(`admin:cleanup.targets.${item.key}`)}
                    checked={selected.has(item.key)}
                    disabled={!isSuperAdmin}
                    onChange={() => toggle(item.key)}
                    className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-surface-900 dark:text-surface-100">
                  {t(`admin:cleanup.targets.${item.key}`)}
                </td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    'inline-flex px-2 py-0.5 rounded text-xs font-medium',
                    item.mode === 'auto'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
                  )}>
                    {item.mode === 'auto' ? t('admin:cleanup.modeAuto') : t('admin:cleanup.modeManual')}
                  </span>
                </td>
                <td className="px-4 py-3 text-surface-500 whitespace-nowrap">{retentionText(item.retentionDays)}</td>
                <td className="px-4 py-3">
                  <span className={clsx('font-semibold tabular-nums', item.count > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-surface-400')}>
                    {item.count.toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrapper>

      {result && (
        <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
          <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            {t('admin:cleanup.resultTitle')}
          </h3>
          <div className="space-y-2">
            {result.results.map((item) => (
              <div key={item.key} className="flex items-center justify-between text-sm">
                <span className="text-surface-600 dark:text-surface-300">{t(`admin:cleanup.targets.${item.key}`)}</span>
                <span className="font-semibold tabular-nums text-surface-900 dark:text-surface-100">
                  {t('admin:cleanup.resultDeleted', { count: item.deleted })}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-surface-100 dark:border-surface-700 pt-2 text-sm">
              <span className="font-medium text-surface-700 dark:text-surface-200">{t('admin:cleanup.resultTotal')}</span>
              <span className="font-bold tabular-nums text-surface-900 dark:text-surface-100">
                {t('admin:cleanup.resultDeleted', { count: result.total })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
