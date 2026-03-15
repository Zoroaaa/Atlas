import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { adminApi } from '@/services/api';
import type { Role } from '@/types';

export const RolesTab: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { adminApi.getRoles().then(setRoles).catch(() => {}).finally(() => setLoading(false)); }, []);

  return (
    <div className="space-y-4">
      {loading ? <div className="text-center py-8 text-surface-500">加载中...</div>
        : roles.map(role => (
          <div key={role.id} className="p-5 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary-500" />
                <span className="font-semibold text-surface-900 dark:text-surface-100">{role.displayName}</span>
                <span className="text-sm text-surface-500">({role.name})</span>
                {role.isSystem && <span className="px-2 py-0.5 text-xs bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400 rounded">系统内置</span>}
              </div>
              <span className="text-xs text-surface-500 bg-surface-50 dark:bg-surface-900 px-2 py-1 rounded">优先级 {role.priority}</span>
            </div>
            <p className="text-sm text-surface-600 dark:text-surface-400 mb-3">{role.description || '暂无描述'}</p>
            <div className="flex flex-wrap gap-1.5">
              {role.permissions.length > 0 ? role.permissions.map((p, i) => <span key={i} className="px-2 py-0.5 text-xs bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 rounded">{p}</span>) : <span className="text-xs text-surface-400">暂无自定义权限</span>}
            </div>
          </div>
        ))}
    </div>
  );
};
