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

export const libraryApi = {
  /** 本地库里已采集的 JAV 详情（含磁力）；只读本地，不访问外部站点 */
  getJavDetail: async (code: string): Promise<LibraryLookup> => {
    const res = await apiClient.get<{ success: boolean; data: LibraryLookup }>(`/jav/library/${encodeURIComponent(code)}`);
    return res.data;
  },
};
