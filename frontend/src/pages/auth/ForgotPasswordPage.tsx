/**
 * ForgotPasswordPage - 忘记密码页
 * 视觉优化：精美多步骤流程，保持全部功能逻辑不变
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Send, Lock, ShieldCheck, CheckCircle, Eye, EyeOff, Search } from 'lucide-react';
import { authApi } from '@/services/api';
import { Input } from '@/components/ui';
import { useNotification } from '@/hooks';
import { useValidationRules } from '@/contexts';

type Step = 'email' | 'verify' | 'success';

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const notification = useNotification();
  const validationRules = useValidationRules();
  
  const [currentStep, setCurrentStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [maskedEmail, setMaskedEmail] = useState('');

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const maskEmail = (email: string): string => {
    if (!email) return '';
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) return `${localPart[0]}***@${domain}`;
    const masked = localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1];
    return `${masked}@${domain}`;
  };

  const validateEmail = () => {
    if (!email.trim()) { setError('请输入邮箱'); return false; }
    if (!validationRules.EMAIL_REGEX.test(email)) { setError('请输入有效的邮箱地址'); return false; }
    setError(''); return true;
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail()) return;
    setIsLoading(true);
    try {
      const response = await authApi.forgotPassword({ email });
      if (response.success && response.data) {
        const masked = response.data.maskedEmail || maskEmail(email);
        setMaskedEmail(masked);
        setCountdown(60);
        setCurrentStep('verify');
        notification.auth.emailCodeSent();
      } else {
        notification.auth.emailCodeFailed(response.message);
      }
    } catch (error: any) {
      notification.auth.emailCodeFailed(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (countdown > 0) return;
    setIsLoading(true);
    try {
      const response = await authApi.forgotPassword({ email });
      if (response.success && response.data) {
        setCountdown(60);
        notification.auth.emailCodeResent();
      } else {
        notification.auth.emailCodeFailed(response.message);
      }
    } catch (error: any) {
      notification.auth.emailCodeFailed(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatVerificationCode = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    const limited = cleaned.substring(0, 6);
    return limited.replace(/(\d{3})(\d{1,3})?/, '$1 $2').trim();
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatVerificationCode(e.target.value);
    setVerificationCode(formatted);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = verificationCode.replace(/\s/g, '');
    if (cleanCode.length !== validationRules.VERIFICATION_CODE_LENGTH) { notification.error('验证码错误', `请输入${validationRules.VERIFICATION_CODE_LENGTH}位验证码`); return; }
    if (!newPassword) { notification.error('密码错误', '请输入新密码'); return; }
    if (newPassword.length < validationRules.PASSWORD_MIN_LENGTH) { notification.error('密码错误', `密码至少${validationRules.PASSWORD_MIN_LENGTH}个字符`); return; }
    if (newPassword.length > validationRules.PASSWORD_MAX_LENGTH) { notification.error('密码错误', `密码最多${validationRules.PASSWORD_MAX_LENGTH}个字符`); return; }
    if (newPassword !== confirmPassword) { notification.error('密码错误', '两次输入的密码不一致'); return; }
    setIsLoading(true);
    try {
      const response = await authApi.resetPassword({ email, verificationCode: cleanCode, newPassword });
      if (response.success) {
        setCurrentStep('success');
        notification.auth.passwordResetSuccess();
      } else {
        notification.auth.passwordResetFailed(response.message || '验证码错误或已过期');
      }
    } catch (error: any) {
      notification.auth.passwordResetFailed(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderEmailStep = () => (
    <form onSubmit={handleSendCode} className="space-y-5">
      <div className="text-center py-2">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center">
          <Mail className="w-8 h-8 text-amber-700 dark:text-amber-400" />
        </div>
        <p className="text-sm text-stone-500 dark:text-stone-400">输入您的邮箱，我们将发送验证码</p>
      </div>
      <Input label="邮箱" type="email" placeholder="请输入注册邮箱" value={email}
        onChange={(e) => setEmail(e.target.value)} error={error}
        leftIcon={<Mail className="w-5 h-5" />} fullWidth />
      <button type="submit" disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white btn-gradient disabled:opacity-60">
        {isLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />发送中...</> : <><Send className="w-4 h-4" />发送验证码</>}
      </button>
    </form>
  );

  const renderVerifyStep = () => (
    <form onSubmit={handleResetPassword} className="space-y-5">
      <div className="text-center mb-2">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-amber-700 dark:text-amber-400" />
        </div>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          验证码已发送到{' '}
          <span className="font-semibold text-stone-900 dark:text-stone-100">{maskedEmail}</span>
        </p>
      </div>

      <Input label="验证码" type="text" placeholder={`请输入${validationRules.VERIFICATION_CODE_LENGTH}位验证码`} value={verificationCode}
        onChange={handleCodeChange} fullWidth className="text-center text-2xl tracking-[0.5em] font-mono" maxLength={validationRules.VERIFICATION_CODE_LENGTH + 1} />

      <p className="text-center text-sm text-stone-500 dark:text-stone-400">
        {countdown > 0
          ? <>有效期 15 分钟，<span className="text-amber-700 dark:text-amber-400 font-semibold tabular-nums">{formatCountdown(countdown)}</span> 后可重发</>
          : '未收到验证码？可以重新发送'}
      </p>

      <Input label="新密码" type={showPassword ? 'text' : 'password'} placeholder={`请输入新密码（至少${validationRules.PASSWORD_MIN_LENGTH}位）`}
        value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
        leftIcon={<Lock className="w-5 h-5" />}
        rightIcon={<button type="button" onClick={() => setShowPassword(!showPassword)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">
          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>} fullWidth />

      <Input label="确认新密码" type={showPassword ? 'text' : 'password'} placeholder="请再次输入新密码"
        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
        leftIcon={<Lock className="w-5 h-5" />} fullWidth />

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setCurrentStep('email')}
          className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl font-medium text-sm border-2 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-amber-300 dark:hover:border-amber-600 transition-all duration-200">
          返回
        </button>
        <button type="submit" disabled={isLoading}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm text-white btn-gradient disabled:opacity-60">
          {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
          重置密码
        </button>
      </div>

      <div className="text-center">
        <button type="button" onClick={handleResendCode} disabled={countdown > 0 || isLoading}
          className="text-sm text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {countdown > 0 ? `重新发送 (${formatCountdown(countdown)})` : '重新发送验证码'}
        </button>
      </div>
    </form>
  );

  const renderSuccessStep = () => (
    <div className="text-center py-8">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center">
        <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h3 className="display-font text-xl font-bold text-stone-900 dark:text-stone-100 mb-2 tracking-tight">密码重置成功！</h3>
      <p className="text-stone-600 dark:text-stone-400 mb-7">请使用新密码登录您的账户</p>
      <button onClick={() => navigate('/login')}
        className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white btn-gradient">
        前往登录
      </button>
    </div>
  );

  const getStepTitle = () => {
    if (currentStep === 'email') return '找回密码';
    if (currentStep === 'verify') return '验证并重置';
    return '重置成功';
  };

  const getStepDescription = () => {
    if (currentStep === 'email') return '输入您的注册邮箱';
    if (currentStep === 'verify') return '输入验证码并设置新密码';
    return '';
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-stone-50 dark:bg-[#0a0a0b] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-amber-400/6 dark:bg-amber-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-rose-400/6 dark:bg-rose-500/4 rounded-full blur-[100px]" />
        <div className="absolute inset-0 grid-dots opacity-50" />
      </div>

      <div className="w-full max-w-md relative">
        <Link to="/login" className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 mb-8 transition-colors text-sm font-medium group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          返回登录
        </Link>

        <div className="rounded-2xl bg-white dark:bg-stone-900/80 border border-stone-200/80 dark:border-stone-700/50 p-7 sm:p-8"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)' }}>

          {/* Steps */}
          {currentStep !== 'success' && (
            <div className="flex items-center justify-center gap-3 mb-7">
              {(['email', 'verify'] as const).map((step, index) => {
                const isActive = currentStep === step;
                const isDone = ['email', 'verify'].indexOf(currentStep) > index;
                return (
                  <React.Fragment key={step}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                      isActive ? 'bg-gradient-to-br from-[#d4a853] to-[#f59e0b] text-white shadow-lg'
                        : isDone ? 'bg-emerald-500 text-white'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500'
                    }`}>
                      {isDone ? <CheckCircle className="w-4 h-4" /> : index + 1}
                    </div>
                    {index < 1 && <div className={`h-px w-16 transition-all duration-500 ${isDone ? 'bg-emerald-400' : 'bg-stone-200 dark:bg-stone-700'}`} />}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          <div className="text-center mb-6">
            <h1 className="display-font text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mb-1.5">{getStepTitle()}</h1>
            {getStepDescription() && <p className="text-sm text-stone-500 dark:text-stone-400">{getStepDescription()}</p>}
          </div>

          {currentStep !== 'success' && <div className="accent-line mb-6" />}

          {currentStep === 'email' && renderEmailStep()}
          {currentStep === 'verify' && renderVerifyStep()}
          {currentStep === 'success' && renderSuccessStep()}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-stone-400 dark:text-stone-600">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center">
            <Search className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-medium">Atlas</span>
        </div>
      </div>
    </div>
  );
};
