import { Capacitor } from '@capacitor/core';

/**
 * 壳层能力封装：仅在 Capacitor（Android / iOS）环境生效，浏览器访问时全部静默跳过。
 * 插件按需动态导入，避免把原生插件代码打进首屏主包。
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export type HapticStyle = 'light' | 'medium' | 'heavy';

export async function hapticTap(style: HapticStyle = 'light'): Promise<void> {
  if (!isNativeApp()) return;
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
  if (!isNativeApp()) return;
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
