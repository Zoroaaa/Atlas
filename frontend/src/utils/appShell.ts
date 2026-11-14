/**
 * 应用壳识别（Electron 桌面端 / Capacitor Android 端）。
 *
 * 两个壳都会在 WebView 的 User-Agent 中追加 `AtlasApp/<version>`，
 * 浏览器访问不会带该标识。用于跳过仅面向浏览器的门户首页。
 */
const APP_SHELL_UA = /AtlasApp\//;

export function isAppShell(): boolean {
  if (typeof navigator === 'undefined') return false;
  return APP_SHELL_UA.test(navigator.userAgent);
}
