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

// jsdom 没有 ResizeObserver，TableWrapper 用它判断是否需要横向滚动提示。
// 缺少时整个管理页渲染会直接抛错，而提示条本身在测试里无意义，给个空实现即可。
if (typeof globalThis.ResizeObserver !== 'function') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverStub,
  });
}

// 测试断言基于中文文案；语言检测在测试环境会落到英文，这里固定为 zh-CN
await i18next.changeLanguage('zh-CN');
