import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useInstallPrompt, type BeforeInstallPromptEvent } from '../useInstallPrompt';

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const setNavigator = (ua: string, platform: string) => {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value: platform === 'iPhone' ? 5 : 0,
    configurable: true,
  });
};

const stubMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
};

const createInstallEvent = (outcome: 'accepted' | 'dismissed') => {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
};

describe('useInstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('iOS Safari 无 beforeinstallprompt 时给出手动安装指引', () => {
    setNavigator(IPHONE_SAFARI_UA, 'iPhone');
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.mode).toBe('ios');
  });

  it('独立窗口（standalone）下不展示安装指引', () => {
    setNavigator(IPHONE_SAFARI_UA, 'iPhone');
    stubMatchMedia(true);
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.mode).toBe('none');
  });

  it('收到 beforeinstallprompt 后展示横幅，接受安装后持久化并隐藏', async () => {
    setNavigator(DESKTOP_CHROME_UA, 'Win32');
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.mode).toBe('none');

    act(() => {
      window.dispatchEvent(createInstallEvent('accepted'));
    });
    expect(result.current.mode).toBe('prompt');

    await act(async () => {
      await result.current.install();
    });

    expect(result.current.mode).toBe('none');
    expect(localStorage.getItem('pwa:installed')).toBe('1');
  });

  it('关闭横幅后记住选择，后续访问不再展示', () => {
    localStorage.setItem('pwa:install-banner-dismissed', '1');
    setNavigator(DESKTOP_CHROME_UA, 'Win32');

    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.mode).toBe('none');

    act(() => {
      window.dispatchEvent(createInstallEvent('accepted'));
    });
    expect(result.current.mode).toBe('none');
  });

  it('用户关闭横幅时写入持久化标记', () => {
    setNavigator(DESKTOP_CHROME_UA, 'Win32');
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(createInstallEvent('dismissed'));
    });
    expect(result.current.mode).toBe('prompt');

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.mode).toBe('none');
    expect(localStorage.getItem('pwa:install-banner-dismissed')).toBe('1');
  });
});
