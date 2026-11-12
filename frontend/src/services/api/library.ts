import { apiClient } from './client';

export interface LibraryMagnet {
  name: string;
  magnet: string;
  size?: string;
  date?: string;
  isHD?: boolean;
}

export interface LibraryJavDetail {
  code: string;
  title: string;
  cover?: string;
  releaseDate?: string;
  duration?: string;
  publisher?: string;
  director?: string;
  maker?: string;
  series?: string;
  tags: string[];
  actresses: string[];
  detailUrl?: string;
  magnets: LibraryMagnet[];
}

export interface LibraryLookup {
  found: boolean;
  detailCompleted: boolean;
  detail?: LibraryJavDetail;
}

export type LibraryRecordType = 'jav' | 'anime' | 'movie' | 'manga' | 'novel';

export interface LibraryRecordSource {
  sourceName: string;
  sourceType: string | null;
  sourceUrl: string | null;
  sourceData: Record<string, unknown>;
}

export interface LibraryRecord {
  id: string;
  recordType: LibraryRecordType;
  title: string;
  cover?: string;
  code?: string;
  actors: string[];
  duration?: string;
  releaseDate?: string;
  publisher?: string;
  tags: string[];
  rating?: string;
  detailCompleted: boolean;
  contentData: Record<string, unknown>;
  sources: LibraryRecordSource[];
  firstSeenAt: number;
  lastUpdatedAt: number;
}

export interface LibraryRecordLookup {
  found: boolean;
  record?: LibraryRecord;
}

export interface LibraryRecordQuery {
  type?: string;
  code?: string;
  url?: string;
  title?: string;
}

export const libraryApi = {
  /** 本地库里已采集的 JAV 详情（含磁力）；只读本地，不访问外部站点 */
  getJavDetail: async (code: string): Promise<LibraryLookup> => {
    const res = await apiClient.get<{ success: boolean; data: LibraryLookup }>(`/jav/library/${encodeURIComponent(code)}`);
    return res.data;
  },

  /** 按类别 + code/url/标题读取单条本地库记录（历史/收藏的详情卡片） */
  getRecord: async (query: LibraryRecordQuery): Promise<LibraryRecordLookup> => {
    const params = new URLSearchParams();
    if (query.type) params.set('type', query.type);
    if (query.code) params.set('code', query.code);
    if (query.url) params.set('url', query.url);
    if (query.title) params.set('title', query.title);
    const res = await apiClient.get<{ success: boolean; data: LibraryRecordLookup }>(
      `/library/record?${params.toString()}`
    );
    return res.data;
  },
};
