import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, ArrowLeft, Search, Github } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { authApi, analyticsApi } from '@/services/api';
import { Input } from '@/components/ui';
import { useNotification } from '@/hooks';
import { useValidationRules, useAppInfo, useFeatureFlags } from '@/contexts';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setUser, setToken } = useAuthStore();
  const notification = useNotification();
  const validationRules = useValidationRules();
  const appInfo = useAppInfo();
  const { enableRegistration } = useFeatureFlags();
  
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.identifier.trim()) newErrors.identifier = '请输入用户名或邮箱';
    if (!formData.password) newErrors.password = '请输入密码';
    else if (formData.password.length < validationRules.PASSWORD_MIN_LENGTH) newErrors.password = `密码至少${validationRules.PASSWORD_MIN_LENGTH}个字符`;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      const response = await authApi.login({
        identifier: formData.identifier,
        password: formData.password,
      });
      if (response.success && response.data) {
        setUser(response.data.user);
        setToken(response.data.token);
        notification.auth.loginSuccess(response.data.user.username);
        // 记录登录分析事件
        const sessionId = sessionStorage.getItem('analytics_session_id') || (() => {
          const id = Math.random().toString(36).slice(2);
          sessionStorage.setItem('analytics_session_id', id);
          return id;
        })();
        analyticsApi.recordEvent({
          userId: response.data.user.id,
          sessionId,
          eventType: 'login',
          eventData: { username: response.data.user.username },
        }).catch(() => {});
        navigate('/dashboard');
      } else {
        notification.auth.loginFailed(response.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '网络错误，请稍后重试';
      notification.auth.loginFailed(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitHubLogin = () => {
    setIsGithubLoading(true);
    // loginWithGitHub 是同步跳转，setIsGithubLoading 只为在跳转前显示 loading 状态
    authApi.loginWithGitHub();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-50 dark:bg-slate-950 relative overflow-hidden">

      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-400/6 dark:bg-blue-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-violet-400/6 dark:bg-violet-500/4 rounded-full blur-[100px]" />
        {/* Grid dots */}
        <div className="absolute inset-0 grid-dots opacity-50" />
      </div>

      <div className="w-full max-w-md relative">

        {/* Back link */}
        <Link to="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 mb-8 transition-colors text-sm font-medium group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          返回首页
        </Link>

        {/* Card */}
        <div className="rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/50 p-7 sm:p-8"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)' }}>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center"
              style={{ boxShadow: '0 8px 24px rgba(79,158,255,0.35)' }}>
              <Lock className="w-6 h-6 text-white" />
            </div>
            <h1 className="display-font text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-1.5">
              欢迎回来
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              登录您的账号继续使用
            </p>
          </div>

          {/* Accent line */}
          <div className="accent-line mb-7" />

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="用户名或邮箱"
              type="text"
              placeholder="请输入用户名或邮箱"
              value={formData.identifier}
              onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
              error={errors.identifier}
              leftIcon={<User className="w-4 h-4 sm:w-5 sm:h-5" />}
              fullWidth
            />

            <Input
              label="密码"
              type={showPassword ? 'text' : 'password'}
              placeholder="请输入密码"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              error={errors.password}
              leftIcon={<Lock className="w-4 h-4 sm:w-5 sm:h-5" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              }
              fullWidth
            />

            <div className="flex items-center justify-between text-xs sm:text-sm">
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer select-none py-2 -my-2">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500 flex-shrink-0" />
                <span>记住我</span>
              </label>
              <Link to="/forgot-password" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors font-medium">
                忘记密码？
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white btn-gradient disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {isLoading ? '登录中...' : '登录'}
            </button>
          </form>

          {/* OAuth 分割线 */}
          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">或通过以下方式登录</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>

          {/* GitHub 登录按钮 */}
          <button
            type="button"
            onClick={handleGitHubLogin}
            disabled={isGithubLoading || isLoading}
            className="mt-4 w-full flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl font-semibold text-sm
              bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700
              text-white border border-slate-700 dark:border-slate-600
              transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            {isGithubLoading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Github className="w-4 h-4" />
            }
            {isGithubLoading ? '跳转中...' : '使用 GitHub 一键登录'}
          </button>

          {/* Footer */}
          <div className="mt-6 text-center">
            {enableRegistration ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                还没有账号？{' '}
                <Link to="/register" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold transition-colors">
                  立即注册
                </Link>
              </p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                注册功能暂未开放
              </p>
            )}
          </div>
        </div>

        {/* Brand watermark */}
        <div className="mt-6 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-600">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <Search className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-medium">{appInfo.NAME}</span>
        </div>
      </div>
    </div>
  );
};
