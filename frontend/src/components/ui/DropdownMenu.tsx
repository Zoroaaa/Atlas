/**
 * DropdownMenu - 通用下拉菜单组件
 * 支持点击/悬停触发、键盘导航、动画效果、深色模式
 */
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';

/* ── 类型定义 ── */

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: MenuItem[];
  triggerMode?: 'click' | 'hover';
  align?: 'left' | 'right';
  showArrow?: boolean;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

/* ── 菜单项组件 ── */

const DropdownMenuItem = memo<{
  item: MenuItem;
  index: number;
  isActive: boolean;
  onFocus: () => void;
  onSelect: () => void;
}>(({ item, index, isActive, onFocus, onSelect }) => {
  // 分隔线
  if (item.divider) {
    return (
      <div
        role="separator"
        className="my-1.5 border-t border-slate-100 dark:border-slate-800"
      />
    );
  }

  const baseClasses = clsx(
    'w-full px-3 py-2 text-sm rounded-lg mx-1',
    'flex items-center gap-2.5',
    'transition-colors duration-150',
    'focus:outline-none',
    // 普通状态
    item.disabled
      ? 'opacity-50 cursor-not-allowed pointer-events-none'
      : item.danger
        ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
    // 焦点状态
    isActive && !item.disabled && 'bg-slate-100 dark:bg-slate-800'
  );

  const content = (
    <>
      {/* 左侧图标 */}
      {item.icon && (
        <span className="w-4 h-4 flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0">
          {item.icon}
        </span>
      )}
      {/* 标签 */}
      <span className="flex-1 text-left">{item.label}</span>
      {/* 徽章 */}
      {item.badge !== undefined && (
        <span className={clsx(
          'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium rounded-full',
          item.danger
            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
        )}>
          {item.badge}
        </span>
      )}
    </>
  );

  // 如果有 href，渲染为 Link
  if (item.href && !item.disabled) {
    return (
      <Link
        key={item.id || index}
        to={item.href}
        role="menuitem"
        tabIndex={isActive ? 0 : -1}
        className={baseClasses}
        onFocus={onFocus}
        onClick={(e) => {
          e.preventDefault();
          onSelect();
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      key={item.id || index}
      type="button"
      role="menuitem"
      tabIndex={isActive ? 0 : -1}
      disabled={item.disabled}
      className={baseClasses}
      onFocus={onFocus}
      onClick={() => !item.disabled && onSelect()}
    >
      {content}
    </button>
  );
});

DropdownMenuItem.displayName = 'DropdownMenuItem';

/* ── 主组件 ── */

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  triggerMode = 'click',
  align = 'right',
  showArrow = true,
  className,
  onOpenChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isClosing, setIsClosing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // 过滤出可交互的菜单项（排除分隔线）
  const interactiveItems = items.filter(item => !item.divider);

  // 打开菜单
  const openMenu = useCallback(() => {
    if (isOpen) return;
    setIsOpen(true);
    setIsClosing(false);
    setActiveIndex(-1);
    onOpenChange?.(true);
  }, [isOpen, onOpenChange]);

  // 关闭菜单（带动画）
  const closeMenu = useCallback(() => {
    if (!isOpen || isClosing) return; // 防止重复调用导致多个 setTimeout
    setIsClosing(true);
    onOpenChange?.(false);

    // 动画结束后完全关闭
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setActiveIndex(-1);
    }, 100);
  }, [isOpen, isClosing, onOpenChange]);

  // 切换菜单
  const toggleMenu = useCallback(() => {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }, [isOpen, openMenu, closeMenu]);

  // 处理菜单项选择
  const handleItemSelect = useCallback((index: number) => {
    const item = interactiveItems[index];
    if (!item || item.disabled) return;

    item.onClick?.();
    closeMenu();
  }, [interactiveItems, closeMenu]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      // 未打开时按 Enter/Space/ArrowDown 打开菜单
      if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev =>
          prev < interactiveItems.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev =>
          prev > 0 ? prev - 1 : interactiveItems.length - 1
        );
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) {
          handleItemSelect(activeIndex);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
        break;
      case 'Tab':
        closeMenu();
        break;
    }
  }, [isOpen, activeIndex, interactiveItems, openMenu, closeMenu, handleItemSelect]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeMenu();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, closeMenu]);

  // ESC 键全局监听
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeMenu();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [isOpen, closeMenu]);

  // 焦点管理：打开时聚焦到第一项或激活项
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const focusedElement = menuRef.current.querySelector('[tabindex="0"]') as HTMLElement;
      focusedElement?.focus();
    }
  }, [isOpen, activeIndex]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Hover 触发事件处理
  const handleMouseEnter = useCallback(() => {
    if (triggerMode === 'hover') {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        openMenu();
      }, 150); // 延迟 150ms 避免误触发
    }
  }, [triggerMode, openMenu]);

  const handleMouseLeave = useCallback(() => {
    if (triggerMode === 'hover') {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        closeMenu();
      }, 200); // 延迟 200ms 关闭
    }
  }, [triggerMode, closeMenu]);

  // 获取当前激活项在原始数组中的索引
  const getOriginalIndex = useCallback((interactiveIdx: number) => {
    let count = 0;
    for (let i = 0; i < items.length; i++) {
      if (!items[i].divider) {
        if (count === interactiveIdx) return i;
        count++;
      }
    }
    return -1;
  }, [items]);

  return (
    <div
      ref={containerRef}
      className={clsx('relative inline-flex', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      {/* 触发器 */}
      <div
        ref={triggerRef}
        className="inline-flex"
        onClick={triggerMode === 'click' ? toggleMenu : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        role="button"
        tabIndex={0}
      >
        {trigger}
        {showArrow && (
          <ChevronDown
            className={clsx(
              'w-4 h-4 ml-1 transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        )}
      </div>

      {/* 下拉菜单 */}
      {(isOpen || isClosing) && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          className={clsx(
            'absolute z-50 mt-2 min-w-[200px] max-h-[400px] overflow-y-auto py-1.5',
            'rounded-xl border shadow-lg backdrop-blur-md',
            'bg-white/95 dark:bg-slate-900/95',
            'border-slate-200/60 dark:border-slate-700/60',
            // 动画
            isClosing
              ? 'animate-fade-out animate-slide-up'
              : 'animate-fade-in animate-slide-down',
            // 对齐方式
            align === 'right' ? 'right-0' : 'left-0'
          )}
          style={{
            animationDuration: isClosing ? '100ms' : '150ms',
            animationTimingFunction: isClosing ? 'ease-in' : 'ease-out',
          }}
        >
          {items.map((item, index) => (
            <DropdownMenuItem
              key={item.id || index}
              item={item}
              index={index}
              isActive={!item.divider && getOriginalIndex(activeIndex) === index}
              onFocus={() => {
                if (!item.divider) {
                  // 计算交互式索引
                  let count = 0;
                  for (let i = 0; i < index; i++) {
                    if (!items[i].divider) count++;
                  }
                  setActiveIndex(count);
                }
              }}
              onSelect={() => {
                if (!item.divider) {
                  let count = 0;
                  for (let i = 0; i < index; i++) {
                    if (!items[i].divider) count++;
                  }
                  handleItemSelect(count);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DropdownMenu;

/* ── 预设菜单配置 ── */

import {
  LayoutDashboard,
  Heart,
  Clock,
  Settings,
  LogOut,
  ShieldAlert,
  Users,
  Globe,
  Share2,
  Tags,
} from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';

/**
 * 用户操作菜单
 */
export const userMenuItems = (
  navigate: NavigateFunction,
  logout: () => void,
  _username?: string
): MenuItem[] => [
  {
    id: 'dashboard',
    label: '控制台',
    icon: <LayoutDashboard className="w-4 h-4" />,
    onClick: () => navigate('/dashboard'),
  },
  {
    id: 'divider-1',
    label: '',
    divider: true,
  },
  {
    id: 'favorites',
    label: '我的收藏',
    icon: <Heart className="w-4 h-4" />,
    onClick: () => navigate('/dashboard?tab=favorites'),
  },
  {
    id: 'history',
    label: '搜索历史',
    icon: <Clock className="w-4 h-4" />,
    onClick: () => navigate('/dashboard?tab=history'),
  },
  {
    id: 'settings',
    label: '设置',
    icon: <Settings className="w-4 h-4" />,
    onClick: () => navigate('/dashboard?tab=settings'),
  },
  {
    id: 'divider-2',
    label: '',
    divider: true,
  },
  {
    id: 'logout',
    label: '退出登录',
    icon: <LogOut className="w-4 h-4" />,
    danger: true,
    onClick: logout,
  },
];

/**
 * 管理员菜单
 */
export const adminMenuItems = (
  navigate: NavigateFunction
): MenuItem[] => [
  {
    id: 'admin-panel',
    label: '管理后台',
    icon: <ShieldAlert className="w-4 h-4" />,
    onClick: () => navigate('/admin-panel'),
  },
  {
    id: 'users',
    label: '用户管理',
    icon: <Users className="w-4 h-4" />,
    onClick: () => navigate('/admin-panel/users'),
  },
  {
    id: 'system-config',
    label: '系统配置',
    icon: <Settings className="w-4 h-4" />,
    onClick: () => navigate('/admin-panel/config'),
  },
];

/**
 * 社区入口菜单
 */
export const communityMenuItems = (
  navigate: NavigateFunction
): MenuItem[] => [
  {
    id: 'community-home',
    label: '社区首页',
    icon: <Globe className="w-4 h-4" />,
    onClick: () => navigate('/community'),
  },
  {
    id: 'my-shares',
    label: '我的分享',
    icon: <Share2 className="w-4 h-4" />,
    onClick: () => navigate('/community/my-shares'),
  },
  {
    id: 'favorites',
    label: '我的收藏',
    icon: <Heart className="w-4 h-4" />,
    onClick: () => navigate('/community/favorites'),
  },
  {
    id: 'tags',
    label: '标签浏览',
    icon: <Tags className="w-4 h-4" />,
    onClick: () => navigate('/community/tags'),
  },
];
