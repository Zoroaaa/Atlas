import React, { useEffect, useRef, useCallback } from 'react';
import { Search, Clock, Loader2 } from 'lucide-react';
import type { SearchSuggestionItem } from '@/hooks/useSearchSuggestions';

interface SearchSuggestionsDropdownProps {
  suggestions: SearchSuggestionItem[];
  visible: boolean;
  isLoading?: boolean;
  onSelect: (item: SearchSuggestionItem) => void;
  onClose: () => void;
}

export const SearchSuggestionsDropdown: React.FC<SearchSuggestionsDropdownProps> = ({
  suggestions,
  visible,
  isLoading = false,
  onSelect,
  onClose,
}) => {
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset active index when suggestions change
  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  // Click outside to close
  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the same click that opened the dropdown
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      onSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [visible, suggestions, activeIndex, onSelect, onClose]);

  useEffect(() => {
    if (!visible) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, handleKeyDown]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-suggestion-index]');
    const activeItem = items[activeIndex] as HTMLElement;
    activeItem?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!visible) return null;

  const displaySuggestions = suggestions.slice(0, 8);

  return (
    <div
      ref={listRef}
      className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-surface-200/60 dark:border-surface-700/60 bg-white dark:bg-surface-900 shadow-xl shadow-surface-900/10 overflow-hidden"
    >
      {isLoading && displaySuggestions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-surface-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>搜索建议中...</span>
        </div>
      ) : displaySuggestions.length === 0 ? (
        <div className="px-4 py-3 text-sm text-surface-400">暂无建议</div>
      ) : (
        <ul className="py-1">
          {displaySuggestions.map((item, index) => (
            <li
              key={item.id}
              data-suggestion-index={index}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-150 text-sm ${
                index === activeIndex
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800/50'
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(-1)}
              onClick={() => onSelect(item)}
            >
              {item.type === 'history' ? (
                <Clock className="w-3.5 h-3.5 text-surface-400 shrink-0" />
              ) : (
                <Search className="w-3.5 h-3.5 text-surface-400 shrink-0" />
              )}
              <span className="truncate flex-1">{item.keyword}</span>
              {item.count !== undefined && item.count > 0 && (
                <span className="text-xs text-surface-400 shrink-0">{item.count}次</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
