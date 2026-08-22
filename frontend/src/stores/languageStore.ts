/**
 * languageStore — 当前界面语言
 *
 * 设计与 themeStore 一致：Zustand + persist + localStorage。
 * i18next 实例由 @/i18n 初始化（含 LanguageDetector）；
 * 本 store 负责：用户主动切换 + 持久化 + 同步到 i18next。
 *
 * 双向同步策略：
 *   - i18next LanguageDetector 在 init 阶段已读 localStorage（key=language-storage），
 *     但 cachesLocalStorage=false，不会反向写回，避免与 store 双写冲突。
 *   - 用户切换语言 → setLanguage → i18next.changeLanguage + 更新 store 状态 +
 *     persist 写入 localStorage。下次刷新时 LanguageDetector 命中 localStorage。
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import i18next from '@/i18n';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  type Language,
} from '@/i18n/config';

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

/** 同步 i18next 语言到目标值 */
const syncI18n = (lang: Language): void => {
  if (i18next.language !== lang) {
    void i18next.changeLanguage(lang);
  }
};

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: DEFAULT_LANGUAGE,

      setLanguage: (lang) => {
        syncI18n(lang);
        set({ language: lang });
      },
    }),
    {
      name: LANGUAGE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ language: state.language }),
      onRehydrateStorage: () => (state) => {
        if (state && isSupportedLanguage(state.language)) {
          syncI18n(state.language);
        }
      },
    }
  )
);

export default useLanguageStore;
