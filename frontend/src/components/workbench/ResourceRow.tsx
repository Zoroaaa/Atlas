import React from 'react';
import { clsx } from 'clsx';

interface ResourceRowProps {
  leading?: React.ReactNode;
  badges?: React.ReactNode;
  title: React.ReactNode;
  href?: string;
  onTitleClick?: () => void;
  meta?: React.ReactNode[];
  quality?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}

/** 磁力/种子/直链/网盘共用的紧凑资源行。 */
export const ResourceRow: React.FC<ResourceRowProps> = ({
  leading,
  badges,
  title,
  href,
  onTitleClick,
  meta,
  quality,
  trailing,
  className,
}) => {
  const titleNode = onTitleClick ? (
    <button
      type="button"
      onClick={onTitleClick}
      className="block w-full truncate text-left text-[12px] text-primary-600 hover:underline dark:text-primary-400"
      title={typeof title === 'string' ? title : undefined}
    >
      {title}
    </button>
  ) : href ? (
    <a
      href={href}
      className="block truncate text-[12px] text-primary-600 hover:underline dark:text-primary-400"
      title={typeof title === 'string' ? title : undefined}
    >
      {title}
    </a>
  ) : (
    <span className="block truncate text-[12px] text-surface-700 dark:text-surface-300" title={typeof title === 'string' ? title : undefined}>
      {title}
    </span>
  );

  return (
    <div className={clsx('dense-row', className)}>
      <div className="flex min-w-0 items-center gap-2">
        {leading ? <span className="shrink-0">{leading}</span> : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {badges}
            {quality}
            {titleNode}
          </div>
          {meta && meta.length > 0 ? (
            <div className="type-micro mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-surface-500">
              {meta.map((item, index) => (
                <span key={index}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-0.5">{trailing}</div> : null}
    </div>
  );
};
