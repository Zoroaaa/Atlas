import React from 'react';
import { ChevronRight, Film } from 'lucide-react';
import { ProxyImage } from '@/components/ui';
import { getProxyImageUrl } from '@/utils/imageProxy';

interface MediaRailProps {
  title: string;
  moreLabel?: string;
  onMore?: () => void;
  children: React.ReactNode;
}

/** 移动端首页的单行横滑区段：标题 + "更多" + 横向滚动卡片。 */
export const MediaRail: React.FC<MediaRailProps> = ({ title, moreLabel, onMore, children }) => (
  <section className="mt-5">
    <div className="flex items-center gap-2 px-4 pb-2.5 sm:px-5">
      <h2 className="type-section-title min-w-0 truncate text-surface-900 dark:text-surface-100">{title}</h2>
      {onMore ? (
        <button
          type="button"
          onClick={onMore}
          className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-semibold text-surface-500 transition-colors hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-300"
        >
          {moreLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
    <div className="h-scroll flex gap-2.5 px-4 pb-1 sm:px-5">{children}</div>
  </section>
);

interface RailCardProps {
  code: string;
  title: string;
  cover?: string;
  meta?: string;
  tag?: string;
  rank?: number;
  isNew?: boolean;
  onSelect: () => void;
}

/** 横滑卡片：3:2 封面 + 番号水印，与搜索结果卡片保持同一套语言。 */
export const RailCard: React.FC<RailCardProps> = ({ code, title, cover, meta, tag, rank, isNew, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className="group flex w-[166px] flex-none flex-col text-left"
  >
    <span className="relative block aspect-[3/2] w-full overflow-hidden rounded-xl bg-gradient-to-br from-surface-200 to-surface-300 dark:from-surface-800 dark:to-surface-700">
      {cover ? (
        <ProxyImage
          src={getProxyImageUrl(cover)}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-surface-400">
          <Film className="h-6 w-6" aria-hidden="true" />
        </span>
      )}

      {tag ? (
        <span className="absolute left-2 top-2 max-w-[70%] truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-sm">
          {tag}
        </span>
      ) : null}
      {isNew ? (
        <span className="absolute right-2 top-2 rounded bg-gradient-to-r from-amber-500 to-rose-500 px-1 py-0.5 text-[9px] font-bold text-white">
          NEW
        </span>
      ) : null}
      {rank ? (
        <span className="absolute bottom-1 left-2 font-display text-3xl font-extrabold leading-none tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
          {String(rank).padStart(2, '0')}
        </span>
      ) : null}
      <span className="absolute bottom-2 right-2 text-[10px] font-bold tracking-[0.08em] text-white/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
        {code}
      </span>
    </span>

    <span className="mt-2 line-clamp-2 min-h-[2.6em] text-xs font-semibold leading-snug text-surface-900 dark:text-surface-100">
      {title}
    </span>
    {meta ? <span className="mt-1 truncate text-[10px] text-surface-500">{meta}</span> : null}
  </button>
);

export const RailSkeleton: React.FC = () => (
  <div className="w-[166px] flex-none">
    <div className="skeleton aspect-[3/2] w-full rounded-xl" />
    <div className="skeleton mt-2 h-3 w-4/5" />
    <div className="skeleton mt-1.5 h-2.5 w-1/2" />
  </div>
);
