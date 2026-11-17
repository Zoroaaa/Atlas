import type { JavDetailStatus, JavDetailFieldName } from '@codeseek/shared';

// 从 @codeseek/shared 导入核心类型
export type {
  DataRecordType,
  DataRecordStatus,
  DataSourceType,
  DataRecordSource,
  DataRecord,
  DataRecordDetail,
  DataStorageStats,
  DataStorageTrends,
  DataRecordsQuery,
  JavDetailFieldName,
  JavDetailStatus,
  JavDetailJobFilter,
  JavDetailStats,
  JavDetailJob,
  JavDetailFailure,
  JavDetailJobView,
} from '@codeseek/shared';

// 榜单归档（管理端）
export type RankingArchiveListType = 'weekly' | 'monthly' | 'top250' | 'yearly';
export type RankingArchiveSection = 'censored' | 'uncensored' | 'western' | 'fc2' | 'all';

export interface RankingArchiveEntry {
  id: string;
  snapshotKey: string;
  snapshotAt: number;
  sourceName: string;
  listType: RankingArchiveListType;
  section: string;
  year: number | null;
  rank: number;
  code: string;
  title: string;
  cover: string | null;
  score: string | null;
  url: string | null;
  recordId: string | null;
  detailCompleted: boolean;
  detailStatus: JavDetailStatus | null;
  detailMissing: JavDetailFieldName[];
}

export interface RankingArchiveSnapshot {
  snapshotKey: string;
  sourceName: string;
  listType: RankingArchiveListType;
  section: string;
  year: number | null;
  snapshotAt: number;
  itemCount: number;
}

export interface RankingArchiveMeta {
  totals: { snapshots: number; entries: number; works: number };
  channels: Array<{
    listType: string;
    section: string;
    year: number | null;
    snapshots: number;
    entries: number;
    latestAt: number;
  }>;
  years: number[];
}

export interface RankingArchiveQuery {
  listType?: RankingArchiveListType;
  section?: RankingArchiveSection;
  year?: number;
  snapshotKey?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// 前端特有的响应类型
export interface DataRecordsResponse {
  items: import('@codeseek/shared').DataRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  missingFields?: import('@codeseek/shared').JavDetailFieldName[];
}

// 封面管理（R2 回填）
export type CoverNamespace = 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'person' | 'misc';

export interface CoverTypeStats {
  type: string;
  total: number;
  ready: number;
  missing: number;
  failed: number;
  pending: number;
}

export interface CoverFailureItem {
  url: string;
  namespace: CoverNamespace;
  status: 'missing' | 'failed';
  lastError: string | null;
  attempts: number;
  nextRetryAt: number;
}

export interface CoverStats {
  totalWithCover: number;
  ready: number;
  missing: number;
  failed: number;
  pending: number;
  readyBytes: number;
  byType: CoverTypeStats[];
  recentFailures: CoverFailureItem[];
  enabled: boolean;
  batchSize: number;
  r2Ready: boolean;
  publicBase: string | null;
}
