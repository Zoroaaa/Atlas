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
} from '@codeseek/shared';

// 前端特有的响应类型
export interface DataRecordsResponse {
  items: import('@codeseek/shared').DataRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
