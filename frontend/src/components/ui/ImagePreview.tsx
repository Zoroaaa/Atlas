import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { registerBackHandler } from '@/utils/backStack';

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

interface GestureState {
  mode: 'none' | 'pan' | 'pinch';
  startX: number;
  startY: number;
  startTx: number;
  startTy: number;
  startDistance: number;
  startScale: number;
  lastTapAt: number;
  moved: boolean;
}

const MAX_SCALE = 4;
const SWIPE_CLOSE_DISTANCE = 120;

/** 全屏放大查看图片：双指缩放、双击放大、下滑关闭、Esc 关闭 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, alt, onClose }) => {
  const { t } = useTranslation(['common']);
  const closeRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef<GestureState>({
    mode: 'none',
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    startDistance: 0,
    startScale: 1,
    lastTapAt: 0,
    moved: false,
  });

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isGesturing, setIsGesturing] = useState(false);

  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const unregister = registerBackHandler(onClose);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      unregister();
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const distanceBetween = (touches: React.TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    if (!a || !b) return 0;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const resetZoom = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const state = gesture.current;
    setIsGesturing(true);
    state.moved = false;

    if (event.touches.length >= 2) {
      state.mode = 'pinch';
      state.startDistance = distanceBetween(event.touches);
      state.startScale = scale;
      return;
    }

    const touch = event.touches[0];
    if (!touch) return;
    state.mode = 'pan';
    state.startX = touch.clientX;
    state.startY = touch.clientY;
    state.startTx = translate.x;
    state.startTy = translate.y;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const state = gesture.current;

    if (state.mode === 'pinch' && event.touches.length >= 2) {
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(1, state.startScale * (distanceBetween(event.touches) / Math.max(1, state.startDistance)))
      );
      setScale(nextScale);
      if (nextScale === 1) setTranslate({ x: 0, y: 0 });
      return;
    }

    const touch = event.touches[0];
    if (!touch || state.mode !== 'pan') return;

    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) state.moved = true;

    if (scale > 1) {
      const bound = 160 * (scale - 1);
      setTranslate({
        x: Math.min(bound, Math.max(-bound, state.startTx + dx)),
        y: Math.min(bound, Math.max(-bound, state.startTy + dy)),
      });
      return;
    }

    // 单指下滑：跟手位移，超过阈值关闭
    if (dy > 0) {
      setTranslate({ x: 0, y: dy });
    }
  };

  const handleTouchEnd = () => {
    const state = gesture.current;
    const wasPinch = state.mode === 'pinch';
    state.mode = 'none';
    setIsGesturing(false);

    if (wasPinch) {
      if (scale <= 1.02) resetZoom();
      return;
    }

    // 双击放大 / 还原（位移超过阈值视为拖拽，不参与双击判定）
    if (!state.moved) {
      const now = Date.now();
      if (now - state.lastTapAt < 300) {
        if (scale > 1) {
          resetZoom();
        } else {
          setScale(2);
        }
        state.lastTapAt = 0;
        return;
      }
      state.lastTapAt = now;
    }

    if (scale > 1) return;

    if (translate.y > SWIPE_CLOSE_DISTANCE) {
      onClose();
      return;
    }

    if (translate.y > 0) {
      setTranslate({ x: 0, y: 0 });
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    setScale((current) => {
      const next = Math.min(MAX_SCALE, Math.max(1, current - event.deltaY * 0.002));
      if (next === 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4 touch-none"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      style={{ opacity: scale === 1 && translate.y > 0 ? Math.max(0.35, 1 - translate.y / 500) : 1 }}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label={t('common:buttons.close')}
        title={t('common:buttons.close')}
        className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-[88vh] max-w-full select-none rounded-lg object-contain shadow-2xl"
        style={{
          transform: `translate3d(${translate.x}px, ${translate.y}px, 0) scale(${scale})`,
          transition: isGesturing ? 'none' : 'transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body
  );
};

interface ProxyImageProps {
  src: string;
  alt: string;
  className?: string;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onError?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  loading?: 'lazy' | 'eager';
  /** 是否允许点击放大（默认开启）；图片加载失败时自动禁用 */
  zoomable?: boolean;
}

/**
 * 全站统一的封面图片组件：代理图 + 点击/回车放大。
 *
 * - 键盘可达：图片本身可聚焦，Enter / 空格打开大图
 * - 触控可用：点击即放大；事件会阻止冒泡，避免同时触发卡片的点击动作
 * - 加载失败：保留占位、不打开空白大图层
 * - 加载完成淡入，避免封面「啪」地出现
 */
export const ProxyImage: React.FC<ProxyImageProps> = ({
  src,
  alt,
  className,
  onLoad,
  onError,
  loading,
  zoomable = true,
}) => {
  const { t } = useTranslation(['common']);
  const [isZoomed, setIsZoomed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    setFailed(false);
    setLoaded(false);

    const image = imageRef.current;
    if (!image) return;

    // 缓存命中的图片可能在 React 挂载 onLoad 之前就完成加载，
    // 只依赖 onLoad 会一直停在透明度 0；这里直接检查 complete 兜底。
    if (image.complete) {
      if (image.naturalWidth > 0) setLoaded(true);
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (image.complete && image.naturalWidth > 0) setLoaded(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [src]);

  const canZoom = zoomable && !failed;

  const open = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    if (canZoom) setIsZoomed(true);
  };

  return (
    <>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          setFailed(true);
          onError?.(event);
        }}
        onClick={open}
        role={canZoom ? 'button' : undefined}
        tabIndex={canZoom ? 0 : undefined}
        aria-label={canZoom ? `${alt} ${t('common:buttons.viewImage')}` : undefined}
        title={canZoom ? t('common:buttons.viewImage') : undefined}
        onKeyDown={
          canZoom
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsZoomed(true);
                }
              }
            : undefined
        }
        style={{
          opacity: failed ? 0 : loaded ? 1 : 0,
          transition: 'opacity 320ms ease',
        }}
        className={clsx(
          className,
          canZoom && 'cursor-zoom-in',
          canZoom && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400'
        )}
      />
      {isZoomed && canZoom ? (
        <ImageLightbox src={src} alt={alt} onClose={() => setIsZoomed(false)} />
      ) : null}
    </>
  );
};
