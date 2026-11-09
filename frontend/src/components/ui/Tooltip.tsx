import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface TooltipProps {
  /** 气泡内说明文案 */
  content: React.ReactNode;
  /** 触发按钮的无障碍标签 */
  label: string;
  className?: string;
}

interface Position {
  top: number;
  left: number;
  maxWidth: number;
}

const VIEWPORT_PADDING = 8;
const TRIGGER_GAP = 6;
const MAX_WIDTH = 288;

/**
 * 标题旁的说明提示：
 * - 桌面端悬停 / 键盘聚焦显示；
 * - 移动端点击问号切换，点击外部或按 Esc 关闭；
 * - 气泡通过 portal 渲染到 body 并相对视口定位，避免被祖先容器 overflow / 定位上下文裁剪；
 * - 靠近视口边缘时水平夹紧，下方空间不足时翻转到触发按钮上方。
 */
export const Tooltip: React.FC<TooltipProps> = ({ content, label, className }) => {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const open = pinned || hovered || focused;

  const updatePosition = useCallback(() => {
    const trigger = buttonRef.current;
    const tip = tipRef.current;
    if (!trigger || !tip) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxWidth = Math.min(MAX_WIDTH, viewportWidth - VIEWPORT_PADDING * 2);
    if (maxWidth <= 0) return;

    // 先按最大宽度测量实际尺寸，再据此夹紧 / 翻转
    tip.style.maxWidth = `${maxWidth}px`;
    const width = Math.min(tip.offsetWidth, maxWidth);
    const height = tip.offsetHeight;

    const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - width);
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, VIEWPORT_PADDING),
      maxLeft
    );

    const spaceBelow = viewportHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_PADDING;
    const spaceAbove = rect.top - TRIGGER_GAP - VIEWPORT_PADDING;
    const top = height > spaceBelow && spaceAbove > spaceBelow
      ? rect.top - TRIGGER_GAP - height
      : rect.bottom + TRIGGER_GAP;
    const maxTop = Math.max(VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - height);

    setPosition({
      top: Math.min(Math.max(top, VIEWPORT_PADDING), maxTop),
      left,
      maxWidth,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setPinned(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
        setHovered(false);
        buttonRef.current?.blur();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleToggle = () => {
    if (pinned) {
      setPinned(false);
      setFocused(false);
      buttonRef.current?.blur();
      return;
    }
    setPinned(true);
  };

  return (
    <span
      ref={rootRef}
      className={clsx('relative inline-flex shrink-0 items-center', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          handleToggle();
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="flex h-11 w-11 -my-2.5 items-center justify-center rounded-full text-surface-400 transition-colors hover:text-primary-600 dark:hover:text-primary-400 sm:my-0 sm:h-6 sm:w-6"
      >
        <HelpCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <span
              ref={tipRef}
              id={tipId}
              role="tooltip"
              style={{
                position: 'fixed',
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                maxWidth: position?.maxWidth,
                visibility: position ? 'visible' : 'hidden',
              }}
              className="pointer-events-none z-[70] w-max rounded-lg border border-surface-200 bg-white px-3 py-2 text-left text-[12px] font-normal leading-relaxed text-surface-600 shadow-lg dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300"
            >
              {content}
            </span>,
            document.body
          )
        : null}
    </span>
  );
};
