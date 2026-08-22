/**
 * LanguageSwitcher - 语言切换器
 * 用 Globe 图标 + 当前语言短码触发下拉，三选一调用 languageStore.setLanguage。
 * 与 UnifiedNavBar 的主题切换按钮风格一致（同尺寸/同 ghost 交互态）。
 */
import React, { memo } from 'react';
import { Globe, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { DropdownMenu, type MenuItem } from './DropdownMenu';
import { useLanguageStore } from '@/stores';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type Language } from '@/i18n/config';

interface LanguageSwitcherProps {
  /** 移动端紧凑尺寸（图标更小、内边距更紧） */
  compact?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = memo(({ compact = false }) => {
  const { t } = useTranslation(['common']);
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  const currentOption = SUPPORTED_LANGUAGES.find((opt) => opt.code === language);

  const items: MenuItem[] = SUPPORTED_LANGUAGES.map((opt) => ({
    id: opt.code,
    label: opt.nativeName,
    icon:
      opt.code === language ? (
        <Check className="w-4 h-4 text-amber-500" />
      ) : (
        <span className="w-4 h-4 inline-block" />
      ),
    onClick: () => setLanguage(opt.code as Language),
  }));

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          aria-label={t('common:languageLabel')}
          title={currentOption?.nativeName}
          className={clsx(
            'rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300',
            'hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200',
            'inline-flex items-center justify-center',
            compact ? 'p-1.5' : 'p-2'
          )}
        >
          <Globe className={clsx(compact ? 'w-4 h-4' : 'w-4 h-4')} />
          <span className="sr-only">{t('common:languageLabel')}</span>
        </button>
      }
      items={items}
      triggerMode="click"
      align="right"
      showArrow={false}
    />
  );
});

LanguageSwitcher.displayName = 'LanguageSwitcher';

export default LanguageSwitcher;
