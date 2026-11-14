/**
 * LanguageSwitcher - 语言切换器
 * 用 Globe 图标 + 当前语言短码触发下拉，三选一调用 languageStore.setLanguage。
 * 与 UnifiedNavBar 的主题切换按钮风格一致（同尺寸/同 ghost 交互态）。
 */
import React, { memo } from 'react';
import { Globe, Check } from 'lucide-react';
import { DropdownMenu, type MenuItem } from './DropdownMenu';
import { useLanguageStore } from '@/stores';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type Language } from '@/i18n/config';

interface LanguageSwitcherProps {
  /** 覆盖触发器样式（如顶栏统一图标按钮规格），传入后不再叠加默认尺寸/内边距 */
  triggerClassName?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = memo(({ triggerClassName }) => {
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
          className={
            triggerClassName ??
            'inline-flex items-center justify-center rounded-lg p-2 text-stone-400 transition-all duration-200 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300'
          }
        >
          <Globe className="w-4 h-4" />
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
