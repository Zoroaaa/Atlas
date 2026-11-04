import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SearchSuggestionsDropdown } from './SearchSuggestionsDropdown';
import { SearchQuotaBadge } from './SearchQuotaBadge';
import { PanelSection, Segmented } from '@/components/workbench';
import { SEARCH_TABS } from '@/config/tabs';
import type { SearchTabType, JavSubMode } from '@/types/source';
import type { SearchSuggestionItem } from '@/hooks/useSearchSuggestions';

interface SearchDockProps {
  activeTab: SearchTabType;
  javSubMode: JavSubMode;
  onSubModeChange: (mode: JavSubMode) => void;
  keyword: string;
  setKeyword: (value: string) => void;
  isSearching: boolean;
  onSubmit: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  suggestions: SearchSuggestionItem[];
  isLoadingSuggestions: boolean;
  showSuggestions: boolean;
  onSuggestionSelect: (item: SearchSuggestionItem) => void;
  onCloseSuggestions: () => void;
  quotaRefreshKey: number;
  javFormatHintVisible: boolean;
}

const JAV_SUB_MODES: { id: JavSubMode; labelKey: string; placeholderKey: string }[] = [
  { id: 'code', labelKey: 'home:javSubmode.code.label', placeholderKey: 'home:javSubmode.code.placeholder' },
  { id: 'actress', labelKey: 'home:javSubmode.actress.label', placeholderKey: 'home:javSubmode.actress.placeholder' },
  { id: 'title', labelKey: 'home:javSubmode.title.label', placeholderKey: 'home:javSubmode.title.placeholder' },
];

/** 搜索坞：子模式 + 输入 + 主按钮 + 配额/提示，全部在一个区段内。 */
export const SearchDock: React.FC<SearchDockProps> = ({
  activeTab,
  javSubMode,
  onSubModeChange,
  keyword,
  setKeyword,
  isSearching,
  onSubmit,
  onKeyDown,
  suggestions,
  isLoadingSuggestions,
  showSuggestions,
  onSuggestionSelect,
  onCloseSuggestions,
  quotaRefreshKey,
  javFormatHintVisible,
}) => {
  const { t } = useTranslation(['tabs', 'home', 'search']);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const placeholder = activeTab === 'jav'
    ? javSubMode === 'code'
      ? t('home:javSubmode.code.placeholder')
      : javSubMode === 'actress'
        ? t('home:javSubmode.actress.placeholder')
        : t('home:javSubmode.title.placeholder')
    : t(SEARCH_TABS[activeTab].placeholderKey);

  return (
    <PanelSection className="relative z-30 bg-surface-50/50 dark:bg-surface-900/30">
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        {activeTab === 'jav' ? (
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <Segmented
              value={javSubMode}
              onChange={onSubModeChange}
              ariaLabel={t('home:javSubmode.code.label')}
              options={JAV_SUB_MODES.map((mode) => ({ value: mode.id, label: t(mode.labelKey) }))}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">
              <Search className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </div>
            <input
              type="text"
              placeholder={placeholder}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => {
                setTimeout(() => setIsInputFocused(false), 200);
              }}
              className="dock-input"
            />
            <SearchSuggestionsDropdown
              suggestions={suggestions}
              visible={isInputFocused && showSuggestions && keyword.trim().length > 0}
              isLoading={isLoadingSuggestions}
              onSelect={(item) => {
                onSuggestionSelect(item);
                setIsInputFocused(false);
              }}
              onClose={onCloseSuggestions}
            />
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSearching}
            aria-label={t('home:javSubmode.searchButton')}
            className="dock-btn w-11 shrink-0 px-0 sm:w-auto sm:px-[18px]"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" strokeWidth={2.5} />}
            <span className="hidden sm:inline">{t('home:javSubmode.searchButton')}</span>
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <SearchQuotaBadge refreshKey={quotaRefreshKey} />
          {activeTab === 'jav' && javSubMode === 'code' && !isInputFocused && javFormatHintVisible ? (
            <p className="type-micro text-surface-500">{t('search:javFormatHint')}</p>
          ) : null}
          {activeTab === 'jav' && javSubMode === 'actress' ? (
            <p className="type-micro text-surface-500">{t('search:actressNameHint')}</p>
          ) : null}
          {activeTab === 'jav' && javSubMode === 'title' ? (
            <p className="type-micro text-surface-500">{t('search:actressShortenHint')}</p>
          ) : null}
        </div>
      </div>
    </PanelSection>
  );
};
