import React from 'react';
import { Zap, Database, Settings, Globe, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface QuickActionsPanelProps {
  isAdmin: boolean;
  communityEnabled: boolean;
  layout?: 'vertical' | 'horizontal';
}

export const QuickActionsPanel: React.FC<QuickActionsPanelProps> = ({ 
  isAdmin, 
  communityEnabled,
  layout = 'vertical'
}) => {
  const navigate = useNavigate();

  if (layout === 'horizontal') {
    return (
      <div className="bg-white dark:bg-surface-900/80 rounded-2xl shadow-lg border border-surface-200/60 dark:border-surface-700/60 p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
        <div className="flex items-center gap-2 sm:gap-2.5 mb-2.5 sm:mb-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">快捷入口</span>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/dashboard/sources')}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium text-surface-700 dark:text-surface-300 border border-surface-200/60 dark:border-surface-700/60 hover:bg-surface-50 dark:hover:bg-surface-800/60 hover:border-primary-200 dark:hover:border-primary-800/60 transition-all active:scale-[0.99]"
          >
            <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-surface-400" />管理搜索源
          </button>
          <button
            onClick={() => navigate('/dashboard/settings')}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium text-surface-700 dark:text-surface-300 border border-surface-200/60 dark:border-surface-700/60 hover:bg-surface-50 dark:hover:bg-surface-800/60 hover:border-primary-200 dark:hover:border-primary-800/60 transition-all active:scale-[0.99]"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-surface-400" />系统设置
          </button>
          {communityEnabled && (
            <button
              onClick={() => navigate('/community')}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium text-surface-700 dark:text-surface-300 border border-surface-200/60 dark:border-surface-700/60 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 hover:text-emerald-700 dark:hover:text-emerald-400 transition-all active:scale-[0.99]"
            >
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-surface-400" />社区分享
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => navigate('/admin-panel')}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium text-surface-700 dark:text-surface-300 border border-surface-200/60 dark:border-surface-700/60 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 hover:text-red-700 dark:hover:text-red-400 transition-all active:scale-[0.99]"
            >
              <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-surface-400" />管理后台
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-surface-900/80 rounded-2xl shadow-lg border border-surface-200/60 dark:border-surface-700/60 p-3 sm:p-4 backdrop-blur-sm animate-fade-in" style={{ animationDelay: '250ms' }}>
      <div className="flex items-center gap-2 sm:gap-2.5 mb-2.5 sm:mb-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">快捷操作</span>
      </div>
      <div className="space-y-1.5 sm:space-y-2">
        <button
          onClick={() => navigate('/dashboard/sources')}
          className="w-full flex items-center gap-2 sm:gap-2.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium text-surface-700 dark:text-surface-300 border border-surface-200/60 dark:border-surface-700/60 hover:bg-surface-50 dark:hover:bg-surface-800/60 hover:border-primary-200 dark:hover:border-primary-800/60 transition-all text-left active:scale-[0.99]"
        >
          <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-surface-400" />管理搜索源
        </button>
        <button
          onClick={() => navigate('/dashboard/settings')}
          className="w-full flex items-center gap-2 sm:gap-2.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium text-surface-700 dark:text-surface-300 border border-surface-200/60 dark:border-surface-700/60 hover:bg-surface-50 dark:hover:bg-surface-800/60 hover:border-primary-200 dark:hover:border-primary-800/60 transition-all text-left active:scale-[0.99]"
        >
          <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-surface-400" />系统设置
        </button>
        {communityEnabled && (
          <button
            onClick={() => navigate('/community')}
            className="w-full flex items-center gap-2 sm:gap-2.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium text-surface-700 dark:text-surface-300 border border-surface-200/60 dark:border-surface-700/60 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 hover:text-emerald-700 dark:hover:text-emerald-400 transition-all text-left active:scale-[0.99]"
          >
            <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-surface-400" />社区分享
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => navigate('/admin-panel')}
            className="w-full flex items-center gap-2 sm:gap-2.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium text-surface-700 dark:text-surface-300 border border-surface-200/60 dark:border-surface-700/60 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 hover:text-red-700 dark:hover:text-red-400 transition-all text-left active:scale-[0.99]"
          >
            <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-surface-400" />管理后台
          </button>
        )}
      </div>
    </div>
  );
};
