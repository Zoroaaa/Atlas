/**
 * OAuth 回跳落点
 *
 * 原生 App（Capacitor）的授权在系统浏览器中完成，回调需要回到 App 的自定义
 * scheme；网页端则继续回到前端回调页。发起授权时用 state 后缀标记来源，
 * 回调校验通过后据此选择落点。
 */

/** 原生 App OAuth 回调地址（scheme 与 capacitor.config.json 的 appId 对应） */
export const APP_OAUTH_CALLBACK = 'atlas://auth/callback';

const APP_OAUTH_STATE_SUFFIX = '.app';

/** 为 App 发起的授权追加状态标记 */
export function markAppOAuthState(state: string, isApp: boolean): string {
  return isApp ? `${state}${APP_OAUTH_STATE_SUFFIX}` : state;
}

/** 判断本次回调是否由 App 发起 */
export function isAppOAuthState(state: string | null | undefined): boolean {
  return Boolean(state && state.endsWith(APP_OAUTH_STATE_SUFFIX));
}
