/**
 * 数据存储管理模块共享类型定义
 * 持久化有效搜索结果，去重落库，多源合并，管理员可查阅
 */

// ==================== 基础枚举类型 ====================

export type DataRecordType = 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress';
export type DataRecordStatus = 'active' | 'hidden';
export type DataSourceType = 'detail' | 'magnet' | 'stream' | 'info';

/** JAV 详情关键字段（完整度按这四个字段判断） */
export type JavDetailFieldName = 'director' | 'maker' | 'publisher' | 'magnets';
export type JavDetailStatus = 'pending' | 'complete' | 'partial' | 'absent' | 'error';

// ==================== 核心实体类型 ====================

/** 数据来源链接（多源合并子表） */
export interface DataRecordSource {
  id: string;
  recordId: string;
  sourceName: string;
  sourceType?: string;
  sourceUrl?: string;
  sourceData: string; // JSON
  createdAt: number;
}

/** 数据记录（规范化资源主表） */
export interface DataRecord {
  id: string;
  recordType: DataRecordType;
  dedupKey: string;
  title: string;
  cover?: string;
  code?: string;
  actors?: string;
  duration?: string;
  releaseDate?: string;
  publisher?: string;
  tags: string[];
  rating?: string;
  contentData: string; // JSON 字符串，类型特定完整数据
  detailCompleted: boolean;
  /** JAV 字段级完整度状态（非 JAV 记录为 null） */
  detailStatus?: JavDetailStatus | null;
  /** 缺失的关键字段 */
  detailMissing?: JavDetailFieldName[];
  detailAttempts?: number;
  detailTransientFailures?: number;
  detailNextRetryAt?: number;
  detailRetryExhausted?: boolean;
  detailLastError?: string | null;
  detailFetchedAt?: number | null;
  status: DataRecordStatus;
  sourceCount: number;
  firstSeenAt: number;
  lastUpdatedAt: number;
}

/** 数据记录详情（含来源子表） */
export interface DataRecordDetail extends DataRecord {
  sources: DataRecordSource[];
}

// ==================== 统计类型 ====================

/** 数据存储统计概览 */
export interface DataStorageStats {
  totalRecords: number;
  byType: Array<{ type: string; count: number }>;
  detailCompletionRate: number; // 百分比，0-100
  addedToday: number;
  addedThisWeek: number;
  addedThisMonth: number;
  recordsOverTime: Array<{ date: string; count: number }>;
  topTags: Array<{ tag: string; count: number }>;
  topSources: Array<{ source_name: string; count: number }>;
  hiddenCount: number;
  javDetail?: JavDetailStats;
}

/** JAV 字段级完整度统计 */
export interface JavDetailStats {
  total: number;
  complete: number;
  partial: number;
  absent: number;
  error: number;
  pending: number;
  missing: Record<JavDetailFieldName, number>;
}

/** JAV 详情批量补全任务 */
export interface JavDetailJob {
  id: string;
  status: 'running' | 'done';
  batch_size: number;
  total: number;
  processed: number;
  completed: number;
  partial: number;
  absent: number;
  transient_failed: number;
  skipped: number;
  last_error: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
}

export interface JavDetailFailure {
  id: string;
  code: string | null;
  title: string;
  status: JavDetailStatus;
  missing: JavDetailFieldName[];
  lastError: string | null;
  nextRetryAt: number;
  attempts: number;
  transientFailures: number;
  retryExhausted: boolean;
}

export interface JavDetailJobView {
  job: JavDetailJob | null;
  pending: number;
  due: number;
  scheduled: number;
  /** 运行时开关：false 时分钟 cron 跳过推进，任务保持原状等待恢复 */
  enabled: boolean;
  stats: JavDetailStats;
  recentFailures: JavDetailFailure[];
}

/** 趋势数据 */
export interface DataStorageTrends {
  days: number;
  recordsOverTime: Array<{ date: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
}

// ==================== 请求参数类型 ====================

export interface DataRecordsQuery {
  page?: number;
  pageSize?: number;
  type?: DataRecordType;
  status?: DataRecordStatus;
  search?: string;
  /** 详情完整度筛选 */
  detail?: 'complete' | 'incomplete';
  /** 缺失字段筛选（逗号分隔，OR 关系） */
  missing?: string;
}
