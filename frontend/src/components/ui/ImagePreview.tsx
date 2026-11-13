import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** 全屏放大查看图片：点击背景或关闭按钮、按 Esc 关闭 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, alt, onClose }) => {
  const { t } = useTranslation(['common']);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
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
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
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

  useEffect(() => { setFailed(false); }, [src]);

  const canZoom = zoomable && !failed;

  const open = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    if (canZoom) setIsZoomed(true);
  };

  return (
    <>
      <img
        src={src}
        alt={alt}
        loading={loading}
        onLoad={onLoad}
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
        className={clsx(
          className,
          failed && 'opacity-0',
          canZoom && 'cursor-zoom-in transition-opacity hover:opacity-90',
          canZoom && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400'
        )}
      />
      {isZoomed && canZoom ? (
        <ImageLightbox src={src} alt={alt} onClose={() => setIsZoomed(false)} />
      ) : null}
    </>
  );
};
