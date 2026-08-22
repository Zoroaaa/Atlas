import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2, CheckCircle } from 'lucide-react';
import { adminApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from 'react-i18next';

interface CleanupResult {
  oldPasswordResetLogs: number;
  oldActions: number;
  oldSecurityEvents: number;
}

export const CleanupTab: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  const handleCleanup = async () => {
    if (!confirm(t('admin:cleanup.confirm'))) return;
    setLoading(true);
    try {
      setResult(await adminApi.cleanup());
      toast.success(t('admin:cleanup.successToast'));
    } catch {
      toast.error(t('admin:cleanup.failedToast'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-orange-700 dark:text-orange-400 mb-2">{t('admin:cleanup.noticeTitle')}</h3>
            <p className="text-sm text-orange-600 dark:text-orange-400/80 mb-2">
              {t('admin:cleanup.autoCleanDesc')}
            </p>
            <ul className="text-sm text-orange-600 dark:text-orange-400/80 space-y-1 mb-3">
              <li>{t('admin:cleanup.autoCleanSessions')}</li>
              <li>{t('admin:cleanup.autoCleanEmailVerifications')}</li>
              <li>{t('admin:cleanup.autoCleanLockouts')}</li>
            </ul>
            <p className="text-sm text-orange-600 dark:text-orange-400/80 mb-2">
              {t('admin:cleanup.retentionDesc')}
            </p>
            <ul className="text-sm text-orange-600 dark:text-orange-400/80 space-y-1">
              <li>{t('admin:cleanup.retentionPassword')}</li>
              <li>{t('admin:cleanup.retentionActions')}</li>
              <li>{t('admin:cleanup.retentionSecurity')}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <Button variant="primary" onClick={handleCleanup} disabled={loading}>
          {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
          {loading ? t('admin:cleanup.executing') : t('admin:cleanup.execute')}
        </Button>
      </div>

      {result && (
        <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
          <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            {t('admin:cleanup.resultTitle')}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              [t('admin:cleanup.resultPassword'), result.oldPasswordResetLogs],
              [t('admin:cleanup.resultActions'), result.oldActions],
              [t('admin:cleanup.resultSecurity'), result.oldSecurityEvents],
            ].map(([label, value]) => (
              <div key={label as string} className="bg-surface-50 dark:bg-surface-900 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-surface-900 dark:text-surface-100">{value}</div>
                <div className="text-xs text-surface-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
