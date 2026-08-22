import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ConfigProvider } from '@/contexts';
import { installGlobalErrorListeners } from '@/components/ErrorBoundary';
import i18next from '@/i18n';
import '@/i18n';
import './index.css';

// 安装全局错误监听（window.onerror + unhandledrejection）
// ErrorBoundary 组件内部已捕获渲染阶段错误，这里捕获运行时未捕获错误
installGlobalErrorListeners();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log(i18next.t('sw:registerSuccess', { scope: registration.scope }));

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 新 SW 已安装完毕，通知用户刷新
              if (confirm(i18next.t('sw:updatePrompt'))) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            }
          });
        }
      });
    } catch (error) {
      console.error(i18next.t('sw:registerFailed', { error: String(error) }));
    }
  });
  
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}
