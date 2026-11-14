import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 路由切换时给页面主容器一个轻量的进入动画。
 * 直接复用现有 DOM，不额外包一层，避免影响各布局的 flex/高度计算。
 */
export function useRouteEnterAnimation<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.classList.remove('route-enter');
    // 强制重排，保证同一元素连续路由切换也能重新播放
    void element.offsetWidth;
    element.classList.add('route-enter');

    const timer = window.setTimeout(() => element.classList.remove('route-enter'), 260);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return ref;
}
