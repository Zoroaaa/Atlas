/**
 * 数据浏览 · 单条记录详情弹窗
 */
import React from 'react';
import { clsx } from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Film,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, ProxyImage } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/hooks/useNotification';
import { getProxyImageUrl } from '@/utils';
import { formatRelativeTime } from '../shared';
import type { DataRecordDetail } from '@/types';
import {
  DETAIL_STATUS_STYLE,
  SourceLinkRow,
  TYPE_META,
  detailStatusLabel,
  errorCodeLabel,
  parseActors,
  toArray,
} from './shared';

interface RecordDetailModalProps {
  detail: DataRecordDetail | null;
  loading: boolean;
  action: 'reset' | 'fetch' | null;
  isSuperAdmin: boolean;
  onClose: () => void;
  onResetRetry: (id: string) => void;
  onFetchDetail: (id: string) => void;
  onToggleStatus: (record: DataRecordDetail) => void;
  onDelete: (id: string) => void;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
  detail,
  loading,
  action,
  isSuperAdmin,
  onClose,
  onResetRetry,
  onFetchDetail,
  onToggleStatus,
  onDelete,
}) => {
  const { t } = useTranslation(['admin']);
  const toast = useToast();

  const copyToClipboard = async (text: string, label = t('admin:dataStorage.copyDefaultLabel')) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('admin:dataStorage.copiedToast', { label }));
    } catch {
      toast.error(t('admin:dataStorage.copyFailedToast'));
    }
  };

  return (
    <Modal
      isOpen={!!detail || loading}
      onClose={() => {
        if (!loading) onClose();
      }}
      title={t('admin:dataStorage.detailModalTitle')}
      size="full"
    >
      {loading ? (
        <div className="text-center py-16 text-surface-500">{t('admin:dataStorage.loading')}</div>
      ) : detail ? (
        <div className="space-y-5">
          {/* 头部：封面 + 基础信息 */}
          <div className="flex flex-col gap-4 sm:flex-row">
            {detail.cover ? (
              <ProxyImage
                src={getProxyImageUrl(detail.cover)}
                alt={detail.title}
                className="w-full shrink-0 self-start object-contain rounded-lg bg-surface-100 dark:bg-surface-700 sm:w-48"
              />
            ) : (
              <div className="flex aspect-video w-full shrink-0 self-start items-center justify-center rounded-lg bg-surface-100 dark:bg-surface-700 sm:w-48">
                <Film className="w-8 h-8 text-surface-300 dark:text-surface-600" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2 flex-wrap mb-2">
                {TYPE_META[detail.recordType] && (
                  <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', TYPE_META[detail.recordType].color)}>
                    {TYPE_META[detail.recordType].icon}
                    {t(TYPE_META[detail.recordType].label)}
                  </span>
                )}
                {detail.detailStatus ? (
                  <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', DETAIL_STATUS_STYLE[detail.detailStatus])}>
                    {detail.detailStatus === 'complete' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {detailStatusLabel(t, detail.detailStatus)}
                  </span>
                ) : detail.detailCompleted ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle2 className="w-3 h-3" />
                    {t('admin:dataStorage.detailComplete')}
                  </span>
                ) : null}
                {detail.status === 'hidden' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                    <EyeOff className="w-3 h-3" />
                    {t('admin:dataStorage.detailHidden')}
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-surface-900 dark:text-surface-100 break-words">{detail.title}</h3>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500 dark:text-surface-400">
                {detail.code && <span>{t('admin:dataStorage.codeLabel')}<span className="font-mono text-surface-700 dark:text-surface-300">{detail.code}</span></span>}
                {detail.releaseDate && <span>{t('admin:dataStorage.releaseLabel')}{detail.releaseDate}</span>}
                {detail.duration && <span>{t('admin:dataStorage.durationLabel')}{detail.duration}</span>}
                {detail.publisher && <span>{t('admin:dataStorage.publisherLabel')}{detail.publisher}</span>}
                {detail.sourceCount > 0 && <span>{t('admin:dataStorage.sourceCountLabel')}{detail.sourceCount}</span>}
              </div>
              <div className="mt-1 text-xs text-surface-400">
                {t('admin:dataStorage.firstSeen', { time: formatRelativeTime(detail.firstSeenAt) })} · {t('admin:dataStorage.updatedAt', { time: formatRelativeTime(detail.lastUpdatedAt) })}
              </div>
            </div>
          </div>

          {/* 详情完整度与重试状态 */}
          {detail.recordType === 'jav' && detail.detailStatus && (
            <div className="rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                  {t('admin:dataStorage.detailStatusLabel')}
                </span>
                {(detail.detailMissing?.length ?? 0) > 0 && (
                  <span className="inline-flex flex-wrap items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    {t('admin:dataStorage.missingFieldsLabel')}
                    {detail.detailMissing!.map((field) => (
                      <span key={field} className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20">
                        {t(`admin:dataStorage.detailField.${field}`)}
                      </span>
                    ))}
                  </span>
                )}
                {detail.detailRetryExhausted && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                    {t('admin:dataStorage.detailNoRetry')}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-surface-400">{t('admin:dataStorage.detailAttemptsLabel')}</div>
                  <div className="font-semibold text-surface-700 dark:text-surface-300">{detail.detailAttempts ?? 0} / 3</div>
                </div>
                <div>
                  <div className="text-surface-400">{t('admin:dataStorage.detailTransientLabel')}</div>
                  <div className="font-semibold text-surface-700 dark:text-surface-300">{detail.detailTransientFailures ?? 0}</div>
                </div>
                <div>
                  <div className="text-surface-400">{t('admin:dataStorage.detailNextRetryLabel')}</div>
                  <div className="font-semibold text-surface-700 dark:text-surface-300">
                    {detail.detailRetryExhausted
                      ? t('admin:dataStorage.detailNoRetry')
                      : detail.detailNextRetryAt && detail.detailNextRetryAt > Date.now()
                        ? formatRelativeTime(detail.detailNextRetryAt)
                        : '—'}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-surface-400">{t('admin:dataStorage.detailLastErrorLabel')}</div>
                  <div className="font-semibold text-surface-700 dark:text-surface-300 truncate">
                    {detail.detailLastError ? errorCodeLabel(t, detail.detailLastError) : '—'}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onResetRetry(detail.id)}
                  disabled={action !== null}
                >
                  {action === 'reset'
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                  <span className="ml-1">{t('admin:dataStorage.resetRetryBtn')}</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onFetchDetail(detail.id)}
                  disabled={action !== null}
                >
                  {action === 'fetch'
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Search className="w-3.5 h-3.5" />}
                  <span className="ml-1">{t('admin:dataStorage.fetchDetailBtn')}</span>
                </Button>
              </div>
            </div>
          )}

          {/* 演员 */}
          {detail.actors && (
            <div>
              <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1.5">{t('admin:dataStorage.actorsLabel')}</h4>
              <div className="flex flex-wrap gap-1.5">
                {parseActors(detail.actors).map((a, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md text-xs bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 标签 */}
          {toArray<string>(detail.tags).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1.5">{t('admin:dataStorage.tagsLabel')}</h4>
              <div className="flex flex-wrap gap-1.5">
                {toArray<string>(detail.tags).map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md text-xs bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 来源链接 */}
          {detail.sources && detail.sources.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1.5">
                {t('admin:dataStorage.sourceLinksLabel', { count: detail.sources.length })}
              </h4>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {detail.sources.map((s) => {
                  let extra = '';
                  try {
                    const d = JSON.parse(s.sourceData);
                    if (d.size) extra = d.size;
                    if (d.isHD) extra += ' · HD';
                  } catch {
                    /* ignore */
                  }
                  return (
                    <SourceLinkRow
                      key={s.id}
                      source={s}
                      extra={extra}
                      onCopy={copyToClipboard}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* 完整数据 JSON */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-surface-700 dark:text-surface-300 hover:text-rose-600">
              {t('admin:dataStorage.rawData')}
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-surface-900 text-surface-100 dark:bg-black/40 text-xs overflow-x-auto max-h-80 font-mono">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(detail.contentData), null, 2);
                } catch {
                  return detail.contentData;
                }
              })()}
            </pre>
          </details>

          {/* 操作 */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-200 dark:border-surface-700">
            <Button variant="outline" size="sm" onClick={() => onToggleStatus(detail)}>
              <EyeOff className="w-3.5 h-3.5" />
              <span className="ml-1">{detail.status === 'active' ? t('admin:dataStorage.hideBtn') : t('admin:dataStorage.showBtn')}</span>
            </Button>
            {isSuperAdmin && (
              <Button variant="outline" size="sm" onClick={() => onDelete(detail.id)} className="text-red-600 dark:text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
                <span className="ml-1">{t('admin:dataStorage.deleteBtn')}</span>
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
};
