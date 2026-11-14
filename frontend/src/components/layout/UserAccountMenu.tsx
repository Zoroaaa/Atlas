/**
 * UserAccountMenu - 桌面端头像下拉
 * 个人中心、社区、管理看板、设置、退出登录统一收敛到这里；
 * 手机端底部「我的」已承担导航入口，由调用方决定是否渲染本组件。
 */
import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, userMenuItems } from '@/components/ui';
import { useAuthStore } from '@/stores';

export interface UserAccountMenuProps {
  isAuthenticated: boolean;
  user?: { username?: string; role?: string } | null;
  isAdmin: boolean;
}

export const UserAccountMenu: React.FC<UserAccountMenuProps> = ({ isAuthenticated, user, isAdmin }) => {
  const { t } = useTranslation(['nav']);
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  return (
    <DropdownMenu
      trigger={
        <button className="flex h-10 items-center gap-2 rounded-xl px-2 text-stone-700 transition-all duration-200 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800">
          {isAuthenticated ? (
            <>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#d4a853] to-[#f59e0b] text-xs font-semibold text-white shadow-sm">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="hidden text-sm font-medium sm:inline">{user?.username}</span>
              <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
            </>
          ) : (
            <>
              <User className="h-4 w-4" />
              <span className="hidden text-sm font-medium sm:inline">{t('nav:userMenu.login')}</span>
            </>
          )}
        </button>
      }
      items={
        isAuthenticated
          ? userMenuItems(t, navigate, handleLogout, { isAdmin })
          : [
              { id: 'login', label: t('nav:userMenu.login'), icon: <User className="w-4 h-4" />, onClick: () => navigate('/login') },
              { id: 'register', label: t('nav:userMenu.register'), icon: <User className="w-4 h-4" />, onClick: () => navigate('/register') },
            ]
      }
      triggerMode="click"
      align="right"
      showArrow={false}
    />
  );
};
