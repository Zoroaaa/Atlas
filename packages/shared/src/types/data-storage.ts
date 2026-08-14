/**
 * 数据存储管理模块共享类型定义
 * 持久化有效搜索结果，去重落库，多源合并，管理员可查阅
 */

// ==================== 基础枚举类型 ====================

export type DataRecordType = 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress';
export type DataRecordStatus = 'active' | 'hidden';
export type DataSourceType = 'detail' | 'magnet' | 'stream' | 'info';

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
}
