/**
 * 数据存储 · 数据浏览
 *
 * 本地库记录列表、筛选、详情弹窗与单条操作。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Database, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dataStorageApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/hooks/useNotification';
import { Pagination } from '../shared';
import type {
  DataRecord,
  DataRecordDetail,
  DataRecordSource,
  DataRecordType,
  JavDetailFieldName,
} from '@/types';
import {
  DETAIL_FIELD_KEYS,
  RecordCard,
  StoragePageHeader,
  TYPE_FILTERS,
  toArray,
} from './shared';
import { RecordDetailModal } from './RecordDetailModal';

export const RecordsPage: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const toast = useToast();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const [records, setRecords] = useState<DataRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'' | DataRecordType>('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'hidden' | ''>('');
  const [search, setSearch] = useState('');
  const [detailFilter, setDetailFilter] = useState<'' | 'complete' | 'incomplete' | 'error'>('');
  const [missingFilters, setMissingFilters] = useState<JavDetailFieldName[]>([]);
  const [retryFilter, setRetryFilter] = useState<'' | 'yes' | 'no'>('');

  const [detail, setDetail] = useState<DataRecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailAction, setDetailAction] = useState<'reset' | 'fetch' | null>(null);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const r = await dataStorageApi.getRecords({
        page,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
        detail: detailFilter || undefined,
        missing: missingFilters.length > 0 ? missingFilters.join(',') : undefined,
        retry: retryFilter || undefined,
      });
      setRecords(toArray<DataRecord>(r.items));
      setTotal(r.total);
      setTotalPages(r.totalPages || 1);
    } catch {
      toast.error(t('admin:dataStorage.loadRecordsFailed'));
    } finally {
      setRecordsLoading(false);
    }
  }, [page, typeFilter, statusFilter, search, detailFilter, missingFilters, retryFilter, toast, t]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const normalizeDetailRecord = (raw: DataRecordDetail): DataRecordDetail => ({
    ...raw,
    tags: toArray<string>(raw.tags),
    sources: toArray<DataRecordSource>(raw.sources),
    detailMissing: toArray<JavDetailFieldName>(raw.detailMissing),
  });

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const raw = await dataStorageApi.getRecord(id);
      if (!raw) {
        setDetail(null);
        return;
      }
      setDetail(normalizeDetailRecord(raw));
    } catch {
      toast.error(t('admin:dataStorage.loadDetailFailed'));
    } finally {
      setDetailLoading(false);
    }
  };

  const reloadDetail = async (id: string) => {
    try {
      const raw = await dataStorageApi.getRecord(id);
      if (raw) setDetail(normalizeDetailRecord(raw));
    } catch {
      /* 列表已刷新，详情刷新失败不重复弹错 */
    }
  };

  const handleResetRetry = async (id: string) => {
    setDetailAction('reset');
    try {
      await dataStorageApi.resetRecordDetailRetry(id);
      toast.success(t('admin:dataStorage.resetRetryToast'));
      await Promise.all([reloadDetail(id), loadRecords()]);
    } catch {
      toast.error(t('admin:dataStorage.actionFailed'));
    } finally {
      setDetailAction(null);
    }
  };

  const handleFetchDetail = async (id: string) => {
    setDetailAction('fetch');
    try {
      const result = await dataStorageApi.fetchRecordDetail(id);
      if (result?.ok === false) {
        toast.error(t('admin:dataStorage.fetchDetailFailed'));
      } else {
        toast.success(t('admin:dataStorage.fetchDetailToast'));
      }
      await Promise.all([reloadDetail(id), loadRecords()]);
    } catch {
      toast.error(t('admin:dataStorage.actionFailed'));
    } finally {
      setDetailAction(null);
    }
  };

  const handleToggleStatus = async (record: DataRecord | DataRecordDetail) => {
    const next = record.status === 'active' ? 'hidden' : 'active';
    try {
      await dataStorageApi.updateRecordStatus(record.id, next);
      toast.success(next === 'hidden' ? t('admin:dataStorage.hiddenToast') : t('admin:dataStorage.shownToast'));
      loadRecords();
      if (detail && detail.id === record.id) {
        setDetail({ ...detail, status: next });
      }
    } catch {
      toast.error(t('admin:dataStorage.opFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('admin:dataStorage.deleteConfirm'))) return;
    try {
      await dataStorageApi.deleteRecord(id);
      toast.success(t('admin:dataStorage.deleteSuccessToast'));
      setDetail(null);
      loadRecords();
    } catch {
      toast.error(t('admin:dataStorage.deleteFailedToast'));
    }
  };

  return (
    <div className="space-y-4">
      <StoragePageHeader
        title={t('admin:dataStorage.page.recordsTitle')}
        description={t('admin:dataStorage.page.recordsDesc')}
        actions={
          <Button variant="outline" size="sm" onClick={loadRecords} disabled={recordsLoading}>
            <RefreshCw className={recordsLoading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
            <span className="ml-1">{t('admin:dataStorage.refresh')}</span>
          </Button>
        }
      />

      {/* 筛选区 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((tf) => (
            <button
              key={tf.key || 'all'}
              onClick={() => {
                setTypeFilter(tf.key);
                setPage(1);
              }}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                typeFilter === tf.key
                  ? 'bg-rose-500 text-white'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600'
              )}
            >
              {t(tf.label)}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-1 sm:max-w-2xl sm:ml-auto">
          <select
            value={detailFilter}
            onChange={(e) => {
              const next = e.target.value as '' | 'complete' | 'incomplete' | 'error';
              setDetailFilter(next);
              if (next === 'complete') setMissingFilters([]);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg text-sm bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            <option value="">{t('admin:dataStorage.detailFilter.all')}</option>
            <option value="complete">{t('admin:dataStorage.detailFilter.complete')}</option>
            <option value="incomplete">{t('admin:dataStorage.detailFilter.incomplete')}</option>
            <option value="error">{t('admin:dataStorage.detailFilter.error')}</option>
          </select>
          <select
            value={retryFilter}
            onChange={(e) => {
              setRetryFilter(e.target.value as '' | 'yes' | 'no');
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg text-sm bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            <option value="">{t('admin:dataStorage.retryFilter.all')}</option>
            <option value="yes">{t('admin:dataStorage.retryFilter.yes')}</option>
            <option value="no">{t('admin:dataStorage.retryFilter.no')}</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'active' | 'hidden' | '');
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg text-sm bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            <option value="">{t('admin:dataStorage.filter.allStatus')}</option>
            <option value="active">{t('admin:dataStorage.filter.statusActive')}</option>
            <option value="hidden">{t('admin:dataStorage.filter.statusHidden')}</option>
          </select>
          <Input
            placeholder={t('admin:dataStorage.filter.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* 缺失字段筛选（点击后自动切到 JAV + 详情不完整） */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-surface-400 mr-1">{t('admin:dataStorage.missingFilterLabel')}</span>
        {DETAIL_FIELD_KEYS.map((field) => {
          const active = missingFilters.includes(field);
          return (
            <button
              key={field}
              onClick={() => {
                setTypeFilter('jav');
                setDetailFilter('incomplete');
                setMissingFilters((prev) =>
                  prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
                );
                setPage(1);
              }}
              className={clsx(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                active
                  ? 'bg-amber-500 text-white'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600'
              )}
            >
              {t(`admin:dataStorage.detailField.${field}`)}
            </button>
          );
        })}
        {(detailFilter || missingFilters.length > 0 || retryFilter) && (
          <button
            onClick={() => {
              setDetailFilter('');
              setMissingFilters([]);
              setRetryFilter('');
              setPage(1);
            }}
            className="px-2.5 py-1 rounded-lg text-xs text-surface-500 hover:text-rose-500"
          >
            {t('admin:dataStorage.filter.all')}
          </button>
        )}
      </div>

      <div className="text-sm text-surface-500">{t('admin:dataStorage.totalRecords', { count: total.toLocaleString() })}</div>

      {/* 记录卡片网格 */}
      {recordsLoading ? (
        <div className="text-center py-16 text-surface-500">{t('admin:dataStorage.loading')}</div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-surface-500">
          <Database className="w-12 h-12 mx-auto mb-3 text-surface-300 dark:text-surface-700" />
          <p>{t('admin:dataStorage.recordsEmpty')}</p>
          <p className="text-xs mt-1">{t('admin:dataStorage.recordsEmptyHint')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {records.map((r) => (
              <RecordCard
                key={r.id}
                record={r}
                onClick={() => openDetail(r.id)}
                onToggleStatus={() => handleToggleStatus(r)}
              />
            ))}
          </div>
          <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}

      <RecordDetailModal
        detail={detail}
        loading={detailLoading}
        action={detailAction}
        isSuperAdmin={isSuperAdmin}
        onClose={() => setDetail(null)}
        onResetRetry={handleResetRetry}
        onFetchDetail={handleFetchDetail}
        onToggleStatus={handleToggleStatus}
        onDelete={handleDelete}
      />
    </div>
  );
};
