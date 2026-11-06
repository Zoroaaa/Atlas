import React, { useEffect, useRef, useState } from 'react';

interface LazyMountProps {
  children: React.ReactNode;
  /** 占位高度，避免滚动条跳动 */
  minHeight?: number;
  /** 提前多远开始加载 */
  rootMargin?: string;
}

/** 滚动到附近才挂载子组件：屏幕外的面板不会在首屏就发数据请求 */
export const LazyMount: React.FC<LazyMountProps> = ({ children, minHeight = 160, rootMargin = '300px' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return visible ? <>{children}</> : <div ref={ref} style={{ minHeight }} aria-hidden="true" />;
};
