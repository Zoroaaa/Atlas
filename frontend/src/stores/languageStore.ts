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
  LANGUAGE_STORAGE_KEY,
  detectBrowserLanguage,
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
      // 已有 i18next 语言（显式初始化/测试固定语言）时优先沿用，
      // 否则按浏览器语言探测；已保存的值仍会在 rehydrate 时覆盖这里
      language: isSupportedLanguage(i18next.language)
        ? (i18next.language as Language)
        : detectBrowserLanguage(),

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
        // 没有持久化记录时保持当前 i18n 语言（首次访问由初始 state 决定），
        // 否则会把测试/服务端显式设置的语言又改回浏览器探测值
        if (!localStorage.getItem(LANGUAGE_STORAGE_KEY)) return;
        if (state && isSupportedLanguage(state.language)) {
          syncI18n(state.language);
        }
      },
    }
  )
);

export default useLanguageStore;
