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
  /** 周期标识；TOP250 不分周期时为 null */
  cycleKey: string | null;
  /** 是否为该周期终榜 */
  isFinal: boolean;
}

export interface RankingArchiveSnapshot {
  snapshotKey: string;
  sourceName: string;
  listType: RankingArchiveListType;
  section: string;
  year: number | null;
  snapshotAt: number;
  itemCount: number;
  /** 周期标识；TOP250 不分周期时为 null */
  cycleKey: string | null;
  /** 是否为该周期终榜 */
  isFinal: boolean;
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
  cycleKey?: string;
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
  retryExhausted: boolean;
  nextRetryAt: number;
}

export interface CoverStats {
  totalWithCover: number;
  ready: number;
  missing: number;
  failed: number;
  pending: number;
  readyBytes: number;
  /** 已耗尽重试的失败封面数（asset 维度） */
  retryExhausted: number;
  byType: CoverTypeStats[];
  recentFailures: CoverFailureItem[];
  enabled: boolean;
  /** 小时通道（每日补齐）是否开启 */
  hourlyEnabled: boolean;
  batchSize: number;
  r2Ready: boolean;
  publicBase: string | null;
}

// ── R2 管理看板（第二真相源） ────────────────────────────

export type R2ScanStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface R2ScanSummary {
  status: R2ScanStatus;
  scanId: string | null;
  pagesDone: number;
  objectsSeen: number;
  skippedKeys: number;
  startedAt: number | null;
  completedAt: number | null;
  nextScanAt: number;
  trigger: string;
  /** full = 全量校验轮次（会检测对象消失）；incremental = 只登记新对象 */
  mode: 'full' | 'incremental';
  lastError: string | null;
  /** 最近一次完整扫描的开始时间；没有完整轮次时为 null，此时账本差异不可用 */
  baselineAt: number | null;
}

export interface R2NamespaceStat {
  namespace: string;
  objects: number;
  bytes: number;
  registered: number;
  unregistered: number;
}

export interface R2AgeBucket {
  namespace: string;
  b0_30: number;
  b31_90: number;
  b91_180: number;
  b180p: number;
}

export interface R2DashboardStats {
  r2: { objects: number; bytes: number; unparsed: number };
  ledger: { ready: number; bytes: number };
  business: { recordsWithCover: number; distinctCoverHashes: number };
  diff: {
    unregistered: { count: number; bytes: number };
    ledgerMissing: { count: number; repairable: number; orphan: number };
    reclaimable: { days: number; count: number; bytes: number };
  };
  byNamespace: R2NamespaceStat[];
  ageBuckets: R2AgeBucket[];
  scan: R2ScanSummary | null;
  reclaim: { enabled: boolean; days: number };
  /** 快照生成时间；0 表示还没有快照 */
  snapshotAt: number;
  /** true = 还没有快照，统计数字不可用 */
  stale: boolean;
  generatedAt: number;
}

export interface R2ObjectRow {
  objectKey: string;
  /** null 表示 key 不符合命名规则，无法与账本关联 */
  urlHash: string | null;
  namespace: string;
  byteSize: number;
  uploadedAt: number;
  firstSeenAt: number;
  lastSeenAt: number;
  reclaimedAt: number | null;
  registered: boolean;
  ledgerStatus: string | null;
}

export interface R2ObjectsQuery {
  page?: number;
  pageSize?: number;
  namespace?: string;
  registered?: 'all' | 'yes' | 'no';
  status?: 'live' | 'reclaimed' | 'all';
  minAgeDays?: number;
  sort?: 'uploaded' | 'size';
}

/** 对象分页响应：total 为 null 表示后端本次没有计算（翻页时省一次全表扫描） */
export interface R2ObjectsPage {
  items: R2ObjectRow[];
  total: number | null;
  page: number;
  pageSize: number;
  totalPages: number | null;
  pageLimitHit: boolean;
}

export interface R2ReclaimPreview {
  days: number;
  namespace: string | null;
  candidates: number;
  bytes: number;
  oldestUploadedAt: number | null;
  hasMore: boolean;
}

export interface R2ReclaimResult {
  deleted: number;
  failed: number;
  bytesFreed: number;
  hasMore: boolean;
}
