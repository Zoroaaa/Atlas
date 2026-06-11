import React, { useState, useEffect, useCallback } from 'react';
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
  PanelRightClose,
  X,
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

interface SourceTreeProps {
  majorCategoriesWithCategories: MajorCategoryWithCategories[];
  expandedMajorCategories: Set<string>;
  expandedCategories: Set<string>;
  batchCheckResults: BatchCheckResult;
  isProxyEnabled: boolean;
  onToggleMajorCategory: (id: string) => void;
  onToggleCategory: (id: string) => void;
  onCheckSingle: (sourceId: string) => void;
  getSiteTypeBadge: (siteType?: string) => string;
  getSiteTypeLabel: (siteType?: string) => string;
}

const SourceTree: React.FC<SourceTreeProps> = ({
  majorCategoriesWithCategories,
  expandedMajorCategories,
  expandedCategories,
  batchCheckResults,
  isProxyEnabled,
  onToggleMajorCategory,
  onToggleCategory,
  onCheckSingle,
  getSiteTypeBadge,
  getSiteTypeLabel,
}) => (
  <div className="space-y-1">
    {majorCategoriesWithCategories.map((majorCategory) => {
      const isMajorExpanded = expandedMajorCategories.has(majorCategory.id);
      const totalSources = majorCategory.categories.reduce((sum, c) => sum + c.sources.length, 0);
      const enabledSources = majorCategory.categories.reduce(
        (sum, c) => sum + c.sources.filter(s => s.userConfig?.isEnabled !== false).length, 0
      );

      return (
        <div key={majorCategory.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-b-0">
          <button
            onClick={() => onToggleMajorCategory(majorCategory.id)}
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2.5">
              <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isMajorExpanded ? 'rotate-90' : ''}`} />
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-md"
                style={{ backgroundColor: majorCategory.color || '#6366f1' }}
              >
                {majorCategory.icon ? (
                  <span className="text-base">{majorCategory.icon}</span>
                ) : (
                  <Database className="w-4 h-4" />
                )}
              </div>
              <div className="text-left">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{majorCategory.name}</span>
                <p className="text-xs text-slate-400">
                  {majorCategory.categories.length} 个分类 · {totalSources} 个搜索源
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg font-medium">
                {enabledSources}/{totalSources} 启用
              </span>
            </div>
          </button>

          {isMajorExpanded && (
            <div className="bg-slate-50/30 dark:bg-slate-900/20 ml-2">
              {majorCategory.categories.map((category) => {
                const isCategoryExpanded = expandedCategories.has(category.id);
                const categoryEnabledCount = category.sources.filter(s => s.userConfig?.isEnabled !== false).length;

                return (
                  <div key={category.id}>
                    <button
                      onClick={() => onToggleCategory(category.id)}
                      className="w-full flex items-center justify-between px-3 py-2 pl-8 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isCategoryExpanded ? 'rotate-90' : ''}`} />
                        <div
                          className="w-5 h-5 rounded-lg flex items-center justify-center text-white shadow-sm"
                          style={{ backgroundColor: category.color || '#8b5cf6' }}
                        >
                          {category.icon ? (
                            <span className="text-xs">{category.icon}</span>
                          ) : (
                            <FolderOpen className="w-3 h-3" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{category.name}</span>
                        <span className="text-xs text-slate-400">{category.sources.length} 个源</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {categoryEnabledCount}/{category.sources.length} 启用
                        </span>
                      </div>
                    </button>

                    {isCategoryExpanded && (
                      <div className="px-3 pb-2 pl-10">
                        <div className="grid grid-cols-1 gap-1.5">
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
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="flex items-start gap-1.5 min-w-0 flex-1">
                                    <SourceIcon icon={source.icon} name={sourceName} size="sm" />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className={`text-xs font-semibold ${isEnabled ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500'}`}>
                                          {sourceName}
                                        </span>
                                        <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${getSiteTypeBadge(source.siteType)}`}>
                                          {getSiteTypeLabel(source.siteType)}
                                        </span>
                                        <span className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded font-medium ${
                                          isEnabled
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                        }`}>
                                          {isEnabled ? <CheckCircle className="w-2 h-2" /> : <XCircle className="w-2 h-2" />}
                                          {isEnabled ? '启用' : '禁用'}
                                        </span>
                                        {checkResult && (() => {
                                          const colorClass = checkResult.available
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : checkResult.status === 'timeout'
                                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                              : checkResult.status === 'restricted'
                                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
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
                                              className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded font-medium ${colorClass}`}
                                              title={titleText}
                                            >
                                              {checkResult.available
                                                ? <><Zap className="w-2 h-2" />{label}</>
                                                : <><XCircle className="w-2 h-2" />{label}</>
                                              }
                                            </span>
                                          );
                                        })()}
                                      </div>
                                      {sourceSubtitle && (
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                          {sourceSubtitle}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      onClick={() => onCheckSingle(source.id)}
                                      className="p-1 rounded-lg text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all"
                                      title="健康检查"
                                    >
                                      <RefreshCw className="w-2.5 h-2.5" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const homepageUrl = source.homepageUrl || source.urlTemplate.replace('{keyword}', '');
                                        window.open(isProxyEnabled ? convertToProxyUrl(homepageUrl) : homepageUrl, '_blank');
                                      }}
                                      className="p-1 rounded-lg text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all"
                                      title="访问站点"
                                    >
                                      <ExternalLink className="w-2.5 h-2.5" />
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
);

interface SourcesSidebarProps {
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
  layoutMode?: 'sidebar' | 'panel';
  collapsible?: boolean;
  defaultExpanded?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export const SourcesSidebar: React.FC<SourcesSidebarProps> = ({
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
  layoutMode = 'sidebar',
  collapsible = true,
  defaultExpanded = true,
  collapsed: externalCollapsed,
  onCollapsedChange,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(!defaultExpanded);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);

  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;
  const toggleCollapsed = useCallback(() => {
    const next = !isCollapsed;
    if (onCollapsedChange) {
      onCollapsedChange(next);
    } else {
      setInternalCollapsed(next);
    }
  }, [isCollapsed, onCollapsedChange]);

  const enabledCount = allSources.filter(s => s.userConfig?.isEnabled !== false).length;

  // 快捷键支持：Ctrl/Cmd + S 切换侧边栏，Escape 关闭移动端抽屉
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (layoutMode === 'sidebar') {
          toggleCollapsed();
        }
      }
      if (e.key === 'Escape' && showMobileDrawer) {
        setShowMobileDrawer(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layoutMode, toggleCollapsed, showMobileDrawer]);

  // Panel 模式：保持原有折叠面板样式（向后兼容）
  if (layoutMode === 'panel') {
    return (
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
            <SourceTree
              majorCategoriesWithCategories={majorCategoriesWithCategories}
              expandedMajorCategories={expandedMajorCategories}
              expandedCategories={expandedCategories}
              batchCheckResults={batchCheckResults}
              isProxyEnabled={isProxyEnabled}
              onToggleMajorCategory={onToggleMajorCategory}
              onToggleCategory={onToggleCategory}
              onCheckSingle={onCheckSingle}
              getSiteTypeBadge={getSiteTypeBadge}
              getSiteTypeLabel={getSiteTypeLabel}
            />
          </div>
        )}
      </div>
    );
  }

  // Sidebar 模式：桌面端侧边栏 + 移动端抽屉
  return (
    <>
      {/* 桌面端侧边栏 */}
      <aside
        className={`hidden lg:block sources-sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`}
        role="complementary"
        aria-label="搜索源管理"
      >
        {/* 折叠时的窄条触发器 */}
        {collapsible && isCollapsed && (
          <button
            onClick={toggleCollapsed}
            className="sidebar-toggle-btn"
            aria-expanded={!isCollapsed}
            title="展开搜索源面板"
          >
            <Globe className="w-5 h-5" />
          </button>
        )}

        {/* 展开时的完整面板 */}
        {!isCollapsed && (
          <>
            {/* 头部区域 */}
            <header className="sidebar-header">
              <div className="flex items-center justify-between">
                <h3 className="sidebar-title">搜索源管理</h3>
                <div className="flex items-center gap-1.5">
                  {/* 批量检查按钮 */}
                  <button
                    onClick={onBatchCheck}
                    disabled={isBatchChecking}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-all disabled:opacity-50"
                  >
                    {isBatchChecking ? (
                      <><RefreshCw className="w-3 h-3 animate-spin" />检查中</>
                    ) : (
                      <><Activity className="w-3 h-3" />批量检查</>
                    )}
                  </button>

                  {/* 折叠按钮 */}
                  {collapsible && (
                    <button
                      onClick={toggleCollapsed}
                      className="icon-btn-sm"
                      aria-expanded={!isCollapsed}
                      title="折叠侧边栏 (Ctrl+S)"
                    >
                      <PanelRightClose className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* 统计信息 */}
              <div className="stats-row">
                <span>共 {allSources.length} 个源</span>
                <span>{enabledCount} 个启用</span>
              </div>
            </header>

            {/* 内容区：树形列表 */}
            <div className="sidebar-content">
              <SourceTree
                majorCategoriesWithCategories={majorCategoriesWithCategories}
                expandedMajorCategories={expandedMajorCategories}
                expandedCategories={expandedCategories}
                batchCheckResults={batchCheckResults}
                isProxyEnabled={isProxyEnabled}
                onToggleMajorCategory={onToggleMajorCategory}
                onToggleCategory={onToggleCategory}
                onCheckSingle={onCheckSingle}
                getSiteTypeBadge={getSiteTypeBadge}
                getSiteTypeLabel={getSiteTypeLabel}
              />
            </div>
          </>
        )}
      </aside>

      {/* 移动端：遮罩层 + 底部抽屉 */}
      {showMobileDrawer && (
        <>
          {/* 半透明遮罩 */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 lg:hidden"
            onClick={() => setShowMobileDrawer(false)}
          />

          {/* 底部抽屉 */}
          <div className="mobile-drawer open">
            <div className="drawer-header">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">搜索源管理</h3>
              <button
                onClick={() => setShowMobileDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 批量检查按钮（抽屉内） */}
            <div className="px-4 pt-3 pb-2">
              <button
                onClick={() => { onBatchCheck(); }}
                disabled={isBatchChecking}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-all disabled:opacity-50"
              >
                {isBatchChecking ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" />批量检查中...</>
                ) : (
                  <><Activity className="w-4 h-4" />批量检查所有源</>
                )}
              </button>
            </div>

            <div className="drawer-content">
              <SourceTree
                majorCategoriesWithCategories={majorCategoriesWithCategories}
                expandedMajorCategories={expandedMajorCategories}
                expandedCategories={expandedCategories}
                batchCheckResults={batchCheckResults}
                isProxyEnabled={isProxyEnabled}
                onToggleMajorCategory={onToggleMajorCategory}
                onToggleCategory={onToggleCategory}
                onCheckSingle={onCheckSingle}
                getSiteTypeBadge={getSiteTypeBadge}
                getSiteTypeLabel={getSiteTypeLabel}
              />
            </div>
          </div>
        </>
      )}

      {/* 移动端：浮动触发按钮 */}
      <button
        onClick={() => setShowMobileDrawer(true)}
        className="fixed bottom-20 right-4 z-40 lg:hidden
                   w-12 h-12 rounded-full bg-violet-500 text-white
                   shadow-lg shadow-violet-500/30
                   flex items-center justify-center
                   hover:bg-violet-600 active:scale-95 transition-all"
        aria-label="打开搜索源管理"
      >
        <Globe className="w-6 h-6" />
        {allSources.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full
                         bg-red-500 text-white text-xs flex items-center justify-center font-medium">
            {allSources.length > 99 ? '99+' : allSources.length}
          </span>
        )}
      </button>
    </>
  );
};

export default SourcesSidebar;
