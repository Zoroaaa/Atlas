import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ImageLightbox } from '@/components/ui/ImagePreview';

interface MediaCardProps {
  cover?: string;
  coverFallback?: React.ReactNode;
  title: React.ReactNode;
  originalTitle?: React.ReactNode;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  description?: string;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  orientation?: 'row' | 'tile';
  coverSize?: 'sm' | 'md';
  /** tile 模式封面比例：portrait 固定 3:4 裁剪；auto 按图片原始比例自适应（如横版 JAV 封面） */
  coverAspect?: 'portrait' | 'auto';
  className?: string;
}

/** 统一的媒体卡：row 用于列表，tile 用于等高等宽的网格。 */
export const MediaCard: React.FC<MediaCardProps> = ({
  cover,
  coverFallback,
  title,
  originalTitle,
  badges,
  meta,
  description,
  footer,
  actions,
  href,
  onSelect,
  selected,
  orientation = 'row',
  coverSize = 'md',
  coverAspect = 'portrait',
  className,
}) => {
  const [zoomed, setZoomed] = useState(false);
  const isRow = orientation === 'row';
  const isAuto = !isRow && coverAspect === 'auto';
  const coverClass = isRow
    ? coverSize === 'sm'
      ? 'h-[76px] w-14'
      : 'h-[96px] w-[72px] sm:h-28 sm:w-20'
    : isAuto
      ? 'w-full'
      : 'aspect-[3/4] w-full';

  const coverNode = cover ? (
    <img
      src={cover}
      alt={typeof title === 'string' ? title : ''}
      loading="lazy"
      className={clsx(
        'w-full rounded-[10px]',
        isAuto ? 'h-auto' : 'h-full object-cover',
        isRow ? 'bg-surface-200 dark:bg-surface-700' : ''
      )}
      onError={(event) => {
        (event.currentTarget as HTMLImageElement).style.visibility = 'hidden';
      }}
    />
  ) : (
    <div
      className="flex h-full w-full items-center justify-center rounded-[10px] bg-surface-100 text-surface-400 dark:bg-surface-800/70"
    >
      {coverFallback}
    </div>
  );

  const coverWrapper = (
    <div
      className={clsx(
        'relative shrink-0 overflow-hidden rounded-[10px] bg-surface-100 dark:bg-surface-800/70',
        coverClass,
        !cover && 'flex items-center justify-center',
        !cover && isAuto && 'aspect-[3/2]',
        cover && 'cursor-zoom-in'
      )}
      // 封面只负责放大查看；点标题/信息区才执行实际动作
      onClick={cover ? (event) => { event.preventDefault(); event.stopPropagation(); setZoomed(true); } : undefined}
    >
      {coverNode}
    </div>
  );

  return (
    <div
      className={clsx(
        'group relative flex min-w-0 rounded-[10px] transition-colors',
        isRow ? 'gap-3 p-3' : 'flex-col overflow-hidden bg-surface-50/60 p-2.5 dark:bg-surface-900/40',
        selected
          ? 'bg-primary-50/60 ring-1 ring-primary-300/50 dark:bg-primary-900/10'
          : 'hover:bg-surface-50 dark:hover:bg-surface-800/40',
        onSelect && 'cursor-pointer',
        className
      )}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      {coverWrapper}
      {zoomed && cover ? (
        <ImageLightbox src={cover} alt={typeof title === 'string' ? title : ''} onClose={() => setZoomed(false)} />
      ) : null}

      <div className={clsx('min-w-0 flex-1', isRow ? 'flex flex-col justify-center gap-1' : 'pt-2')}>
        {badges ? <div className="flex flex-wrap items-center gap-1">{badges}</div> : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 text-[13px] font-semibold leading-snug text-surface-900 transition-colors hover:text-primary-600 dark:text-surface-100 dark:hover:text-primary-300"
            onClick={(event) => event.stopPropagation()}
          >
            {title}
          </a>
        ) : (
          <div
            className={clsx(
              'line-clamp-2 text-[13px] font-semibold leading-snug text-surface-900 dark:text-surface-100',
              !isRow && 'min-h-[2.7em]'
            )}
          >
            {title}
          </div>
        )}
        {originalTitle ? (
          <p className="type-micro truncate text-surface-500">{originalTitle}</p>
        ) : null}
        {meta ? <div className="type-micro min-w-0 truncate text-surface-500">{meta}</div> : null}
        {description ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-surface-500">{description}</p>
        ) : null}
        {footer ? <div className="mt-0.5">{footer}</div> : null}
      </div>

      {actions ? (
        <div
          className={clsx(
            'flex shrink-0 items-center gap-1',
            isRow ? 'self-center' : 'absolute right-1.5 top-1.5 rounded-lg bg-white/80 p-0.5 backdrop-blur-sm dark:bg-surface-900/80'
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
};
