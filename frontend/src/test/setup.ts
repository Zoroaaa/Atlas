import '@testing-library/jest-dom';
import i18next from '@/i18n';

// jsdom 没有 matchMedia，主题 store 在导入时会读取系统主题
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// 测试断言基于中文文案；语言检测在测试环境会落到英文，这里固定为 zh-CN
await i18next.changeLanguage('zh-CN');
