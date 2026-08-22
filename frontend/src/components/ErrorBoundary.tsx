/**
 * 全局错误边界 + 前端错误上报
 *
 * 设计：
 *   - ErrorBoundary 捕获 React 渲染阶段错误（componentDidCatch）
 *   - 全局监听 window.onerror + unhandledrejection 捕获运行时错误
 *   - 所有错误 best-effort 上报到后端 /api/system/errors，失败不影响用户
 *   - 渲染崩溃时显示兜底 UI（避免白屏）
 *   - 自身上报失败不再抛出（避免循环）
 */

import React, { Component, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { systemApi } from '@/services/api/system';
import { useAuthStore } from '@/stores';
import i18next from '@/i18n';

// ──────────────────────────────────────────────
// 上报工具：去重 + 节流
// ──────────────────────────────────────────────

const reportedFingerprints = new Set<string>();
const REPORT_WINDOW_MS = 60_000; // 同一指纹 60 秒内只上报一次

function fingerprintOf(message: string, stack?: string | null, url?: string | null): string {
  const stackLines = (stack || '').split('\n').slice(0, 5).join('|').replace(/\s+/g, ' ').trim();
  const raw = `${message.slice(0, 200)}::${stackLines}::${url || ''}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return `fp_${(hash >>> 0).toString(36)}`;
}

function shouldReport(fp: string): boolean {
  if (reportedFingerprints.has(fp)) return false;
  reportedFingerprints.add(fp);
  // 60 秒后允许再次上报（窗口滑动）
  setTimeout(() => reportedFingerprints.delete(fp), REPORT_WINDOW_MS);
  return true;
}

function getSessionId(): string | null {
  try {
    return sessionStorage.getItem('analytics_session_id');
  } catch {
    return null;
  }
}

function reportFrontendError(params: {
  errorType: string;
  message: string;
  stack?: string | null;
  url?: string | null;
  lineNumber?: number | null;
  columnNumber?: number | null;
  context?: Record<string, unknown>;
}): void {
  const fp = fingerprintOf(params.message, params.stack, params.url);
  if (!shouldReport(fp)) return;

  // 尽力而为获取用户ID（即使没登录也允许匿名上报）
  let userId: string | undefined;
  try {
    userId = useAuthStore.getState().user?.id;
  } catch {
    // 忽略
  }

  void systemApi.reportError({
    source: 'frontend',
    errorType: params.errorType,
    message: params.message,
    stack: params.stack,
    url: params.url,
    lineNumber: params.lineNumber,
    columnNumber: params.columnNumber,
    sessionId: getSessionId(),
    context: { ...params.context, userId },
  });
}

// ──────────────────────────────────────────────
// 全局监听初始化（在 main.tsx 中调用一次）
// ──────────────────────────────────────────────

let globalListenersInstalled = false;

export function installGlobalErrorListeners(): void {
  if (globalListenersInstalled) return;
  globalListenersInstalled = true;

  // window.onerror：JS 错误、资源加载失败（partial）
  window.addEventListener('error', (event) => {
    // 过滤资源加载错误（target 为 Element 且无 message）
    if (!event.message && event.target && (event.target as Element).tagName) {
      // 资源加载失败，单独上报
      const target = event.target as HTMLImageElement | HTMLScriptElement | HTMLLinkElement;
      const url = (target as HTMLImageElement).src || (target as HTMLScriptElement).src || (target as HTMLLinkElement).href || undefined;
      reportFrontendError({
        errorType: 'resource_error',
        message: i18next.t('errors:resourceLoadFailed', { tag: (event.target as Element).tagName }),
        url,
      });
      return;
    }

    reportFrontendError({
      errorType: 'javascript',
      message: event.message || 'Unknown JS error',
      stack: event.error?.stack || null,
      url: event.filename || window.location.href,
      lineNumber: event.lineno || null,
      columnNumber: event.colno || null,
    });
  });

  // Promise 未处理的 rejection
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    reportFrontendError({
      errorType: 'unhandledrejection',
      message,
      stack: reason instanceof Error ? reason.stack : null,
      url: window.location.href,
    });
  });
}

// ──────────────────────────────────────────────
// ErrorBoundary 组件
// ──────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportFrontendError({
      errorType: 'render',
      message: error.message,
      stack: error.stack || null,
      url: window.location.href,
      context: {
        componentStack: info.componentStack,
      },
    });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleHome = (): void => {
    window.location.href = '/';
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const err = this.state.error;
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-stone-50 dark:bg-[#0a0a0b]">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500 dark:text-red-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
              {i18next.t('errors:boundary.title')}
            </h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {i18next.t('errors:boundary.description')}
            </p>
          </div>

          {err && (
            <details className="text-left bg-white dark:bg-stone-800/50 rounded-xl border border-stone-200 dark:border-stone-700 p-3">
              <summary className="text-xs font-medium text-stone-600 dark:text-stone-400 cursor-pointer">
                {i18next.t('errors:boundary.detailsLabel')}
              </summary>
              <pre className="mt-2 text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap break-all font-mono">
                {err.message}
                {err.stack && `\n\n${err.stack.slice(0, 1000)}`}
              </pre>
            </details>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              {i18next.t('errors:boundary.reload')}
            </button>
            <button
              onClick={this.handleHome}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 transition-all"
            >
              <Home className="w-4 h-4" />
              {i18next.t('errors:boundary.goHome')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
