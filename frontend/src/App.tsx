import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/services/api/queryClient';
import { useAuthStore, useThemeStore, useLanguageStore } from '@/stores';
import { apiClient } from '@/services/api';
import { analyticsApi } from '@/services/api';
import i18next from '@/i18n';
import { MainLayout } from '@/components/layout/MainLayout';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AdminPanelLayout } from '@/components/layout/AdminPanelLayout';
import { CommunityPanelLayout } from '@/components/layout/CommunityPanelLayout';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { AppUpdatePrompt } from '@/components/layout/AppUpdatePrompt';
import { NativeShell } from '@/components/layout/NativeShell';
import { RouteScrollRestoration } from '@/components/layout/RouteScrollRestoration';
import { PullToRefreshProvider } from '@/components/layout/PullToRefresh';
import { NetworkStatusBar } from '@/components/layout/NetworkStatusBar';
import { ToastContainer } from '@/components/ui/Toast';
import { PwaPrompts } from '@/components/pwa/PwaPrompts';
import { useFeatureFlags } from '@/contexts';
import { HomePage } from '@/pages/HomePage';
import { MainSearchPage } from '@/pages/MainSearchPage';
import { LoginPage, RegisterPage, ForgotPasswordPage, GitHubCallbackPage, GoogleCallbackPage } from '@/pages/auth';
import { MePage } from '@/pages/MePage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { isAppShell } from '@/utils/appShell';

// 非首屏页面按路由拆包：降低主包体积，缩短 App 冷启动时间
const TermsPage = lazy(() => import('@/pages/TermsPage').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const HelpCenterPage = lazy(() => import('@/pages/help/HelpCenterPage').then((m) => ({ default: m.HelpCenterPage })));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const UserActivitiesPage = lazy(() => import('@/pages/dashboard/UserActivitiesPage').then((m) => ({ default: m.UserActivitiesPage })));
const AdminManager = lazy(() => import('@/pages/admin/AdminManager').then((m) => ({ default: m.AdminManager })));
const AdminPanelOverview = lazy(() => import('@/pages/admin/AdminPanelOverview').then((m) => ({ default: m.AdminPanelOverview })));
const CommunityManager = lazy(() => import('@/pages/community/CommunityManager').then((m) => ({ default: m.CommunityManager })));
const PostDetailPage = lazy(() => import('@/pages/community/PostDetailPage').then((m) => ({ default: m.PostDetailPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const RouteLoading: React.FC = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-500" />
  </div>
);

const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<RouteLoading />}>{node}</Suspense>
);

interface GuardRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'super_admin';
  requiredFlag?: boolean;
}

const GuardRoute: React.FC<GuardRouteProps> = ({ children, requiredRole, requiredFlag }) => {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (requiredRole && user?.role !== requiredRole && user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }
  
  if (requiredFlag === false) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
};

const AuthRedirect: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }
  
  if (isAuthenticated) {
    return <Navigate to="/main" replace />;
  }
  
  return <>{children}</>;
};

/**
 * 应用壳入口：桌面端/Android 端不展示门户首页，
 * 未登录直接进登录页，已登录由登录页的 AuthRedirect 转到搜索主界面。
 * 浏览器访问保持原门户介绍页。
 */
const AppShellAwareHome: React.FC = () => {
  if (isAppShell()) {
    return <Navigate to="/login" replace />;
  }
  return <AuthRedirect><HomePage /></AuthRedirect>;
};

// 页面访问追踪组件（挂在 BrowserRouter 内部以使用 useLocation）
const PageTracker: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    // 未登录时不发送分析请求，避免 401 触发全局 logout
    if (!isAuthenticated) return;

    // 记录页面访问分析事件（静默失败，不影响用户体验）
    const sessionId = sessionStorage.getItem('analytics_session_id') || (() => {
      const id = Math.random().toString(36).slice(2);
      sessionStorage.setItem('analytics_session_id', id);
      return id;
    })();

    analyticsApi.recordEvent({
      userId: user?.id,
      sessionId,
      eventType: 'page_view',
      eventData: { path: location.pathname },
      referer: document.referrer || undefined,
    }).catch(() => {});
  }, [location.pathname, isAuthenticated, user?.id]);

  return null;
};

const App: React.FC = () => {
  const { setUser, setLoading, logout } = useAuthStore();
  const { resolvedTheme } = useThemeStore();
  const language = useLanguageStore((s) => s.language);
  const { communityEnabled } = useFeatureFlags();

  useEffect(() => {
    // apiClient 现在直接从 zustand persist 读取 token，无需手动同步
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);

  // 语言切换兜底同步：store 状态变化时同步到 i18next
  useEffect(() => {
    if (i18next.language !== language) {
      void i18next.changeLanguage(language);
    }
  }, [language]);

  useEffect(() => {
    const initAuth = async () => {
      setLoading(true);
      const token = await useAuthStore.getState().restoreToken();

      if (token) {
        try {
          const response = await apiClient.get<{ success: boolean; data: import('@/types').User }>('/auth/me');
          if (response.success && response.data) {
            setUser(response.data);
          } else {
            logout();
          }
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (status === 401) {
            logout();
          } else {
            // 网络问题，保持登录态
          }
        } finally {
          setLoading(false);
        }
      } else {
        logout();
        setLoading(false);
      }
    };

    initAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PageTracker />
        <NativeShell />
        <RouteScrollRestoration />
        <PullToRefreshProvider>
        <NetworkStatusBar />
        <ErrorBoundary>
        <Routes>
        {/* 首页独立渲染，不使用 MainLayout（HomePage 内部已包含 UnifiedNavBar）
            应用壳内跳过门户首页，直接进入登录/主界面 */}
        <Route path="/" element={<AppShellAwareHome />} />
        <Route element={<MainLayout />}>
          <Route path="/terms" element={withSuspense(<TermsPage />)} />
          <Route path="/privacy" element={withSuspense(<PrivacyPage />)} />
          <Route path="/help" element={withSuspense(<HelpCenterPage />)} />
          <Route path="/me" element={<GuardRoute><MePage /></GuardRoute>} />
          {/* 系统设置独立页：入口仅保留桌面头像下拉与手机端「我的」 */}
          <Route path="/settings" element={<GuardRoute>{withSuspense(<SettingsPage />)}</GuardRoute>} />
        </Route>
        <Route path="/login" element={<AuthRedirect><LoginPage /></AuthRedirect>} />
        <Route path="/register" element={<AuthRedirect><RegisterPage /></AuthRedirect>} />
        <Route path="/forgot-password" element={<AuthRedirect><ForgotPasswordPage /></AuthRedirect>} />
        {/* GitHub OAuth 回调 — 不加 AuthRedirect，否则已登录状态无法完成回调 */}
        <Route path="/auth/callback" element={<GitHubCallbackPage />} />
        <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
        <Route path="/main" element={
          <GuardRoute>
            <MainSearchPage />
          </GuardRoute>
        } />
        {/* 
          重定向旧路由到新的 Tab 视图 (2026-06-11 重构)
          - /anime → /main?tab=anime
          - /movie → /main?tab=movie
          原因：整合到统一的搜索源体系，作为 MainSearchPage 的 Tab 存在
        */}
        <Route path="/anime" element={
          <GuardRoute>
            <Navigate to="/main?tab=anime" replace />
          </GuardRoute>
        } />
        <Route path="/movie" element={
          <GuardRoute>
            <Navigate to="/main?tab=movie" replace />
          </GuardRoute>
        } />
        
        <Route path="/dashboard" element={<GuardRoute><DashboardLayout /></GuardRoute>}>
          <Route index element={withSuspense(<DashboardPage />)} />
          {/* 手机端菜单页里「概览」需要独立内容路由 */}
          <Route path="overview" element={withSuspense(<DashboardPage />)} />
          <Route path="stats" element={withSuspense(<DashboardPage />)} />
          <Route path="sources" element={withSuspense(<DashboardPage />)} />
          <Route path="categories" element={<GuardRoute requiredRole="admin">{withSuspense(<DashboardPage />)}</GuardRoute>} />
          <Route path="favorites" element={withSuspense(<DashboardPage />)} />
          <Route path="history" element={withSuspense(<DashboardPage />)} />
          <Route path="follows" element={withSuspense(<DashboardPage />)} />
          <Route path="follow-feed" element={withSuspense(<DashboardPage />)} />
          <Route path="notifications" element={withSuspense(<DashboardPage />)} />
          {/* 设置已独立成 /settings，旧链接保留一次重定向 */}
          <Route path="settings" element={<Navigate to="/settings" replace />} />
          <Route path="activities" element={withSuspense(<UserActivitiesPage />)} />
        </Route>
        
        <Route path="/community" element={<GuardRoute requiredFlag={communityEnabled !== undefined ? communityEnabled : true}><CommunityPanelLayout /></GuardRoute>}>
          <Route index element={withSuspense(<CommunityManager />)} />
          {/* 手机端菜单页里「发现」需要独立内容路由 */}
          <Route path="browse" element={withSuspense(<CommunityManager />)} />
          <Route path="my-shares" element={withSuspense(<CommunityManager />)} />
          <Route path="my-favorites" element={withSuspense(<CommunityManager />)} />
          <Route path="tags" element={withSuspense(<CommunityManager />)} />
          <Route path="post/:postId" element={withSuspense(<PostDetailPage />)} />
        </Route>
        
        <Route path="/admin-panel" element={<GuardRoute requiredRole='admin'><AdminPanelLayout /></GuardRoute>}>
          <Route index element={withSuspense(<AdminPanelOverview />)} />
          <Route path="users" element={withSuspense(<AdminManager />)} />
          <Route path="sessions" element={withSuspense(<AdminManager />)} />
          <Route path="actions" element={withSuspense(<AdminManager />)} />
          <Route path="email-logs" element={withSuspense(<AdminManager />)} />
          <Route path="analytics" element={withSuspense(<AdminManager />)} />
          <Route path="observability" element={withSuspense(<AdminManager />)} />
          <Route path="trends" element={withSuspense(<AdminManager />)} />
          <Route path="activity-ranking" element={withSuspense(<AdminManager />)} />
          <Route path="reports" element={withSuspense(<AdminManager />)} />
          <Route path="roles" element={withSuspense(<AdminManager />)} />
          <Route path="config" element={withSuspense(<AdminManager />)} />
          <Route path="cleanup" element={withSuspense(<AdminManager />)} />
          <Route path="feedback" element={withSuspense(<AdminManager />)} />
          <Route path="announcements" element={withSuspense(<AdminManager />)} />
          <Route path="data-storage" element={withSuspense(<AdminManager />)} />
          <Route path="aliases" element={withSuspense(<AdminManager />)} />
        </Route>
        
        <Route path="/admin" element={<GuardRoute requiredRole='admin'><DashboardLayout /></GuardRoute>}>
          <Route index element={withSuspense(<AdminManager />)} />
        </Route>
      </Routes>
        </ErrorBoundary>
      {/* 移动端底部主导航：高亮由路由推导，桌面端隐藏 */}
      <MobileTabBar />
      <AppUpdatePrompt />
      <ToastContainer />
      <PwaPrompts />
      </PullToRefreshProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
