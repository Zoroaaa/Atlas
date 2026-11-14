import { Capacitor } from '@capacitor/core';

/**
 * 壳层能力封装：仅在 Capacitor（Android / iOS）环境生效，浏览器访问时全部静默跳过。
 * 插件按需动态导入，避免把原生插件代码打进首屏主包。
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** 仅 Android 原生壳：APK 更新检查只在这个环境生效 */
export function isAndroidApp(): boolean {
  return isNativeApp() && Capacitor.getPlatform() === 'android';
}

export type HapticStyle = 'light' | 'medium' | 'heavy';

export async function hapticTap(style: HapticStyle = 'light'): Promise<void> {
  if (!isNativeApp()) {
    // 浏览器/PWA 里也尽量给一点反馈（Android Chrome 支持 vibrate）
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(style === 'heavy' ? 18 : style === 'medium' ? 12 : 8);
    }
    return;
  }
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const styleMap = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    } as const;
    await Haptics.impact({ style: styleMap[style] });
  } catch {
    // 设备不支持震动时忽略
  }
}

export async function hapticSuccess(): Promise<void> {
  if (!isNativeApp()) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([10, 40, 10]);
    }
    return;
  }
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // 忽略
  }
}

export async function syncStatusBar(isDark: boolean): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    // Android 15 起边到边显示会忽略状态栏底色，失败时交给 safe-area 兜底
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: isDark ? '#0a0a0b' : '#fafaf9' }).catch(() => {});
    }
  } catch {
    // 壳层不可用时忽略
  }
}

export async function hideSplashScreen(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    // 已经关闭或壳层不可用时忽略
  }
}
