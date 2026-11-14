import React, { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * 路由滚动位置管理：
 * - 新进入页面滚到顶部
 * - 浏览器/Android 返回时恢复离开时的位置
 * - 兼容 window 滚动与布局内的独立滚动容器
 */
export const RouteScrollRestoration: React.FC = () => {
  const { key } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    const storageKey = `atlas:scroll:${key}`;
    const scroller = document.querySelector<HTMLElement>('[data-scroll-container]');

    const readPosition = () => (scroller ? scroller.scrollTop : window.scrollY);
    const writePosition = (value: number) => {
      if (scroller) {
        scroller.scrollTop = value;
      } else {
        window.scrollTo({ top: value, behavior: 'auto' });
      }
    };

    if (navigationType === 'POP') {
      const saved = Number(sessionStorage.getItem(storageKey) || 0);
      if (saved > 0) {
        // 等页面内容完成首帧布局后再恢复，避免高度不足导致位置被截断
        requestAnimationFrame(() => {
          requestAnimationFrame(() => writePosition(saved));
        });
      }
    } else {
      writePosition(0);
    }

    const onScroll = (event: Event) => {
      const target = event.target;
      if (target === document || target === scroller) {
        sessionStorage.setItem(storageKey, String(readPosition()));
      }
    };

    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [key, navigationType]);

  return null;
};
