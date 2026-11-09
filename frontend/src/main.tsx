import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ConfigProvider } from '@/contexts';
import { installGlobalErrorListeners } from '@/components/ErrorBoundary';
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

// Service Worker 注册与更新提示已移至 useServiceWorkerUpdate（components/pwa/PwaPrompts），
// 新版本进入 waiting 后由用户在界面确认，再 skipWaiting + 刷新。
