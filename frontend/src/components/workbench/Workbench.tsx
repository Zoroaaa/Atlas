import React, { useId } from 'react';
import { clsx } from 'clsx';

interface PanelProps {
  children: React.ReactNode;
  className?: string;
}

/** 主页面唯一的面板表面：全页只有这一层边框/圆角/阴影。 */
export const Panel: React.FC<PanelProps> = ({ children, className }) => (
  <div className={clsx('panel-surface animate-fade-in', className)}>{children}</div>
);

interface PanelSectionProps {
  children: React.ReactNode;
  className?: string;
}

/** 面板内的一个区段；只负责上分隔线，不再承担卡片外观。 */
export const PanelSection: React.FC<PanelSectionProps> = ({ children, className }) => (
  <section className={clsx('panel-section', className)}>{children}</section>
);

interface PanelHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  count?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  onToggle?: () => void;
  expanded?: boolean;
  ariaControls?: string;
  className?: string;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  icon,
  title,
  count,
  meta,
  actions,
  onToggle,
  expanded,
  ariaControls,
  className,
}) => {
  const fallbackId = useId();
  const contentId = ariaControls ?? `panel-content-${fallbackId}`;

  const titleNode = (
    <>
      {icon ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-primary-600 dark:bg-surface-800 dark:text-primary-300">
          {icon}
        </span>
      ) : null}
      <span className="type-section-title min-w-0 truncate text-surface-900 dark:text-surface-100">
        {title}
      </span>
      {count}
      {meta ? <span className="type-meta hidden sm:inline min-w-0 truncate">{meta}</span> : null}
    </>
  );

  return (
    <header className={clsx('panel-header', className)}>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={contentId}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          {titleNode}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">{titleNode}</div>
      )}
      {actions ? (
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={onToggle ? (event) => event.stopPropagation() : undefined}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
};

interface PanelBodyProps {
  children: React.ReactNode;
  className?: string;
}

export const PanelBody: React.FC<PanelBodyProps> = ({ children, className }) => (
  <div className={clsx('panel-body', className)}>{children}</div>
);

interface PanelRailProps {
  children: React.ReactNode;
  className?: string;
}

export const PanelRail: React.FC<PanelRailProps> = ({ children, className }) => (
  <div className={clsx('panel-rail', className)}>{children}</div>
);
