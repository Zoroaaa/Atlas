import React from 'react';
import {
  Globe,
  Database,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Activity,
  RefreshCw,
  ExternalLink,
  Zap,
  XCircle,
  CheckCircle,
} from 'lucide-react';
import { SourceIcon } from '@/components/ui';
import { convertToProxyUrl } from '@/services/proxy';
import type { SearchSource, UserSourceConfig, MajorCategory, Category } from '@/types';

interface SourceWithUserConfig extends SearchSource {
  userConfig?: UserSourceConfig | null;
}

interface CategoryWithSources extends Category {
  sources: SourceWithUserConfig[];
}

interface MajorCategoryWithCategories extends MajorCategory {
  categories: CategoryWithSources[];
}

type BatchCheckResult = Record<string, {
  status: string;
  available: boolean;
  responseTime: number;
  error: string | null;
}>;

interface SourcesPanelProps {
  show: boolean;
  allSources: SourceWithUserConfig[];
  majorCategoriesWithCategories: MajorCategoryWithCategories[];
  expandedMajorCategories: Set<string>;
  expandedCategories: Set<string>;
  batchCheckResults: BatchCheckResult;
  isBatchChecking: boolean;
  isProxyEnabled: boolean;
  onToggle: () => void;
  onToggleMajorCategory: (id: string) => void;
  onToggleCategory: (id: string) => void;
  onBatchCheck: () => void;
  onCheckSingle: (sourceId: string) => void;
  getSiteTypeBadge: (siteType?: string) => string;
  getSiteTypeLabel: (siteType?: string) => string;
}

export const SourcesPanel: React.FC<SourcesPanelProps> = ({
  show,
  allSources,
  majorCategoriesWithCategories,
  expandedMajorCategories,
  expandedCategories,
  batchCheckResults,
  isBatchChecking,
  isProxyEnabled,
  onToggle,
  onToggleMajorCategory,
  onToggleCategory,
  onBatchCheck,
  onCheckSingle,
  getSiteTypeBadge,
  getSiteTypeLabel,
}) => (
  <div className="collapsible-section animate-fade-in" style={{ animationDelay: '200ms' }}>
    <button onClick={onToggle} className="collapsible-header">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-600 dark:text-violet-400" />
        </div>
        <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">搜索源管理</span>
        <span className="px-2 py-0.5 text-xs font-semibold bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full">
          {allSources.length}
        </span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        {show && (
          <button
            onClick={(e) => { e.stopPropagation(); onBatchCheck(); }}
            disabled={isBatchChecking}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-all disabled:opacity-50"
          >
            {isBatchChecking ? (
              <><RefreshCw className="w-3 h-3 animate-spin" />检查中</>
            ) : (
              <><Activity className="w-3 h-3" />批量检查</>
            )}
          </button>
        )}
        {show ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
      </div>
    </button>

    {show && (
      <div className="border-t border-surface-100 dark:border-surface-800 max-h-[400px] sm:max-h-[600px] overflow-y-auto scrollbar-thin">
        {majorCategoriesWithCategories.map((majorCategory) => {
          const isMajorExpanded = expandedMajorCategories.has(majorCategory.id);
          const totalSources = majorCategory.categories.reduce((sum, c) => sum + c.sources.length, 0);
          const enabledSources = majorCategory.categories.reduce(
            (sum, c) => sum + c.sources.filter(s => s.userConfig?.isEnabled !== false).length, 0
          );

          return (
            <div key={majorCategory.id} className="border-b border-surface-50 dark:border-surface-800/60 last:border-b-0">
              <button
                onClick={() => onToggleMajorCategory(majorCategory.id)}
                className="w-full flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3.5 hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors"
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <ChevronRight className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-surface-400 transition-transform duration-200 ${isMajorExpanded ? 'rotate-90' : ''}`} />
                  <div
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-white shadow-md"
                    style={{ backgroundColor: majorCategory.color || '#6366f1' }}
                  >
                    {majorCategory.icon ? (
                      <span className="text-base sm:text-lg">{majorCategory.icon}</span>
                    ) : (
                      <Database className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </div>
                  <div className="text-left">
                    <span className="text-xs sm:text-sm font-semibold text-surface-800 dark:text-surface-200">{majorCategory.name}</span>
                    <p className="text-[10px] sm:text-xs text-surface-400">
                      {majorCategory.categories.length} 个分类 · {totalSources} 个搜索源
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {majorCategory.requiresKeyword ? (
                    <span className="text-[10px] sm:text-xs px-2 py-1 bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400 rounded-lg font-medium">
                      {enabledSources}/{totalSources} 启用
                    </span>
                  ) : (
                    <span className="text-[10px] sm:text-xs px-2 py-1 bg-surface-100 dark:bg-surface-800 text-surface-400 dark:text-surface-500 rounded-lg font-medium">
                      浏览型
                    </span>
                  )}
                </div>
              </button>

              {isMajorExpanded && (
                <div className="bg-surface-50/30 dark:bg-surface-900/20">
                  {majorCategory.categories.map((category) => {
                    const isCategoryExpanded = expandedCategories.has(category.id);
                    const categoryEnabledCount = category.sources.filter(s => s.userConfig?.isEnabled !== false).length;

                    return (
                      <div key={category.id}>
                        <button
                          onClick={() => onToggleCategory(category.id)}
                          className="w-full flex items-center justify-between px-3 sm:px-5 py-2 sm:py-2.5 pl-8 sm:pl-12 hover:bg-surface-100/50 dark:hover:bg-surface-800/30 transition-colors"
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2.5">
                            <ChevronRight className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-surface-400 transition-transform duration-200 ${isCategoryExpanded ? 'rotate-90' : ''}`} />
                            <div
                              className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center text-white shadow-sm"
                              style={{ backgroundColor: category.color || '#8b5cf6' }}
                            >
                              {category.icon ? (
                                <span className="text-xs sm:text-sm">{category.icon}</span>
                              ) : (
                                <FolderOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              )}
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-surface-700 dark:text-surface-300">{category.name}</span>
                            <span className="text-[10px] sm:text-xs text-surface-400">{category.sources.length} 个源</span>
                          </div>
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            {majorCategory.requiresKeyword ? (
                              <span className="text-[10px] sm:text-xs text-surface-500 dark:text-surface-400">
                                {categoryEnabledCount}/{category.sources.length} 启用
                              </span>
                            ) : (
                              <span className="text-[10px] sm:text-xs text-surface-400 dark:text-surface-500">不参与搜索</span>
                            )}
                          </div>
                        </button>

                        {isCategoryExpanded && (
                          <div className="px-3 sm:px-4 pb-2 sm:pb-3 pl-10 sm:pl-16">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
                              {category.sources.map((source) => {
                                const isEnabled = source.userConfig?.isEnabled !== false;
                                const sourceName = source.userConfig?.customName || source.name;
                                const sourceSubtitle = source.userConfig?.customSubtitle || source.subtitle;
                                const checkResult = batchCheckResults[source.id];

                                return (
                                  <div
                                    key={source.id}
                                    className={`source-tree-item ${isEnabled ? 'enabled' : 'disabled'}`}
                                  >
                                    <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                      <div className="flex items-start gap-1.5 sm:gap-2 min-w-0 flex-1">
                                        <SourceIcon icon={source.icon} name={sourceName} size="sm" />
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                                            <span className={`text-[10px] sm:text-xs font-semibold ${isEnabled ? 'text-surface-800 dark:text-surface-200' : 'text-surface-500'}`}>
                                              {sourceName}
                                            </span>
                                            <span className={`text-[9px] sm:text-[10px] px-1 py-0.5 rounded font-medium ${getSiteTypeBadge(source.siteType)}`}>
                                              {getSiteTypeLabel(source.siteType)}
                                            </span>
                                            {majorCategory.requiresKeyword && (
                                              <span className={`flex items-center gap-0.5 text-[9px] sm:text-[10px] px-1 py-0.5 rounded font-medium ${
                                                isEnabled
                                                  ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                                                  : 'bg-surface-200 text-surface-500 dark:bg-surface-700 dark:text-surface-400'
                                              }`}>
                                                {isEnabled ? <CheckCircle className="w-2 h-2 sm:w-2.5 sm:h-2.5" /> : <XCircle className="w-2 h-2 sm:w-2.5 sm:h-2.5" />}
                                                {isEnabled ? '启用' : '禁用'}
                                              </span>
                                            )}
                                            {checkResult && (() => {
                                              const colorClass = checkResult.available
                                                ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                                                : checkResult.status === 'timeout'
                                                  ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
                                                  : checkResult.status === 'restricted'
                                                    ? 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'
                                                    : 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400';
                                              const label = checkResult.available
                                                ? checkResult.status === 'restricted'
                                                  ? `受限 ${checkResult.responseTime}ms`
                                                  : `${checkResult.responseTime}ms`
                                                : checkResult.status === 'timeout' ? '超时'
                                                  : checkResult.status === 'offline' ? '离线' : '异常';
                                              const titleText = checkResult.available
                                                ? checkResult.status === 'restricted'
                                                  ? `服务器在线（访问受限），响应 ${checkResult.responseTime}ms`
                                                  : `可正常访问，响应时间 ${checkResult.responseTime}ms`
                                                : checkResult.error || '无法访问';
                                              return (
                                                <span
                                                  className={`flex items-center gap-0.5 text-[9px] sm:text-[10px] px-1 py-0.5 rounded font-medium ${colorClass}`}
                                                  title={titleText}
                                                >
                                                  {checkResult.available
                                                    ? <><Zap className="w-2 h-2 sm:w-2.5 sm:h-2.5" />{label}</>
                                                    : <><XCircle className="w-2 h-2 sm:w-2.5 sm:h-2.5" />{label}</>
                                                  }
                                                </span>
                                              );
                                            })()}
                                          </div>
                                          {sourceSubtitle && (
                                            <p className="text-[9px] sm:text-[10px] text-surface-500 dark:text-surface-400 mt-0.5 truncate">
                                              {sourceSubtitle}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        <button
                                          onClick={() => onCheckSingle(source.id)}
                                          className="p-1 rounded-lg text-surface-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
                                          title="健康检查"
                                        >
                                          <RefreshCw className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            const homepageUrl = source.homepageUrl || source.urlTemplate.replace('{keyword}', '');
                                            window.open(isProxyEnabled ? convertToProxyUrl(homepageUrl) : homepageUrl, '_blank');
                                          }}
                                          className="p-1 rounded-lg text-surface-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
                                          title="访问站点"
                                        >
                                          <ExternalLink className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);
