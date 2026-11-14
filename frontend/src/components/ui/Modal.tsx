import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { registerBackHandler } from '@/utils/backStack';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  footer?: React.ReactNode;
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

const CLOSE_THRESHOLD = 120;

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  footer,
}) => {
  const { t } = useTranslation(['common']);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ y: number; time: number } | null>(null);
  const dragYRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    setDragY(0);
    dragYRef.current = 0;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(onClose);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnOverlayClick) {
      onClose();
    }
  };

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(max-width: 639px)').matches) return;
    dragStart.current = { y: event.clientY, time: Date.now() };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const delta = Math.max(0, event.clientY - dragStart.current.y);
    dragYRef.current = delta;
    setDragY(delta);
  };

  const endDrag = () => {
    if (!dragStart.current) return;
    const elapsed = Math.max(1, Date.now() - dragStart.current.time);
    const velocity = dragYRef.current / elapsed;
    dragStart.current = null;
    setIsDragging(false);

    if (dragYRef.current > CLOSE_THRESHOLD || velocity > 0.6) {
      onClose();
      return;
    }
    dragYRef.current = 0;
    setDragY(0);
  };

  const backdropOpacity = Math.max(0.25, 1 - dragY / 360);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleOverlayClick}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        style={{ opacity: backdropOpacity }}
      />
      <div
        className={clsx(
          'relative w-full bg-white dark:bg-surface-800 rounded-t-2xl sm:rounded-xl shadow-soft-lg',
          // 底部弹层：给全面屏手势条留出安全区，避免底部按钮被压住
          'pb-[env(safe-area-inset-bottom)] sm:pb-0',
          'animate-scale-in max-h-[90vh] flex flex-col',
          isDragging ? 'will-change-transform' : 'transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          sizeStyles[size]
        )}
        style={{ transform: dragY > 0 ? `translate3d(0, ${dragY}px, 0)` : undefined }}
      >
        {/* 移动端拖拽把手：下拉跟手，松手回弹或关闭 */}
        <div
          className="sm:hidden flex justify-center pt-2.5 pb-1 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-hidden="true"
        >
          <span className="h-1 w-10 rounded-full bg-stone-300/90 dark:bg-stone-600" />
        </div>
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-200 dark:border-surface-700 shrink-0">
            {title && (
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label={t('buttons.close')}
                title={t('buttons.close')}
                className="p-2 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 px-4 sm:px-6 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/50 rounded-b-2xl sm:rounded-b-xl shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
