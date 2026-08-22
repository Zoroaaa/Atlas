import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, ArrowLeft, Send, ShieldCheck, CheckCircle, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { authApi } from '@/services/api';
import { Input } from '@/components/ui';
import { useNotification } from '@/hooks';
import { useValidationRules, useAppInfo, useFeatureFlags } from '@/contexts';

type Step = 'form' | 'verify' | 'success';

export const RegisterPage: React.FC = () => {
  const { t } = useTranslation(['auth']);
  const navigate = useNavigate();
  const { setUser, setToken } = useAuthStore();
  const notification = useNotification();
  const validationRules = useValidationRules();
  const appInfo = useAppInfo();
  const { enableRegistration } = useFeatureFlags();
  
  const [currentStep, setCurrentStep] = useState<Step>('form');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState(false);
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

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.username.trim()) newErrors.username = t('auth:register.usernameRequired');
    else if (formData.username.length < validationRules.USERNAME_MIN_LENGTH) newErrors.username = t('auth:register.usernameMinLength', { count: validationRules.USERNAME_MIN_LENGTH });
    else if (formData.username.length > validationRules.USERNAME_MAX_LENGTH) newErrors.username = t('auth:register.usernameMaxLength', { count: validationRules.USERNAME_MAX_LENGTH });
    else if (!validationRules.USERNAME_REGEX.test(formData.username)) newErrors.username = t('auth:register.usernameFormat');
    if (!formData.email.trim()) newErrors.email = t('auth:register.emailRequired');
    else if (!validationRules.EMAIL_REGEX.test(formData.email)) newErrors.email = t('auth:register.emailInvalid');
    if (!formData.password) newErrors.password = t('auth:register.passwordRequired');
    else if (formData.password.length < validationRules.PASSWORD_MIN_LENGTH) newErrors.password = t('auth:register.passwordMinLength', { count: validationRules.PASSWORD_MIN_LENGTH });
    else if (formData.password.length > validationRules.PASSWORD_MAX_LENGTH) newErrors.password = t('auth:register.passwordMaxLength', { count: validationRules.PASSWORD_MAX_LENGTH });
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = t('auth:register.passwordMismatch');
    if (!agreed) notification.common.validationError(t('auth:register.termsOfService'));
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0 && agreed;
  };

  const handleSendCode = async () => {
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      const response = await authApi.sendRegistrationCode(formData.email);
      if (response.success && response.data) {
        const masked = response.data.maskedEmail || maskEmail(formData.email);
        setMaskedEmail(masked);
        setCountdown(response.data.expiresIn || 300);
        setCurrentStep('verify');
        notification.auth.emailCodeSent();
      } else {
        notification.auth.emailCodeFailed(t('auth:register.codeSendFailed'));
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
      const response = await authApi.sendRegistrationCode(formData.email);
      if (response.success && response.data) {
        setCountdown(response.data.expiresIn || 300);
        notification.auth.emailCodeResent();
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

  const handleVerifyAndRegister = async () => {
    const cleanCode = verificationCode.replace(/\s/g, '');
    if (cleanCode.length !== 6) {
      notification.error(t('auth:register.codeErrorTitle'), t('auth:register.codeMustBe6Digits'));
      return;
    }
    setIsLoading(true);
    try {
      const response = await authApi.register({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        verificationCode: cleanCode,
      });
      if (response.success && response.data) {
        setUser(response.data.user);
        setToken(response.data.token);
        setCurrentStep('success');
        notification.auth.registerSuccess();
        setTimeout(() => navigate('/main'), 2000);
      } else {
        notification.auth.registerFailed(response.message || t('auth:register.codeInvalidOrExpired'));
      }
    } catch (error: any) {
      notification.auth.registerFailed(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (currentStep === 'form') handleSendCode();
      else if (currentStep === 'verify') handleVerifyAndRegister();
    }
  };

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderFormStep = () => (
    <form onSubmit={(e) => { e.preventDefault(); handleSendCode(); }} className="space-y-4">
      <Input
        label={t('auth:register.usernameLabel')}
        type="text"
        placeholder={t('auth:register.usernamePlaceholder')}
        value={formData.username}
        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
        error={errors.username}
        leftIcon={<User className="w-5 h-5" />}
        fullWidth
      />
      <Input
        label={t('auth:register.emailLabel')}
        type="email"
        placeholder={t('auth:register.emailPlaceholder')}
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        error={errors.email}
        leftIcon={<Mail className="w-5 h-5" />}
        fullWidth
      />
      <Input
        label={t('auth:register.passwordLabel')}
        type={showPassword ? 'text' : 'password'}
        placeholder={t('auth:register.passwordPlaceholder')}
        value={formData.password}
        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        error={errors.password}
        leftIcon={<Lock className="w-5 h-5" />}
        rightIcon={
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        }
        fullWidth
      />
      <Input
        label={t('auth:register.confirmPasswordLabel')}
        type={showPassword ? 'text' : 'password'}
        placeholder={t('auth:register.confirmPasswordPlaceholder')}
        value={formData.confirmPassword}
        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
        error={errors.confirmPassword}
        leftIcon={<Lock className="w-5 h-5" />}
        fullWidth
      />

      <label className="flex items-start gap-3 cursor-pointer select-none py-1">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 rounded border-stone-300 dark:border-stone-600 text-amber-500 focus:ring-amber-500 w-4 h-4 flex-shrink-0"
        />
        <span className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
          {t('auth:register.iHaveReadAndAgreed')}{' '}
          <Link to="/terms" className="text-amber-700 dark:text-amber-400 hover:underline">{t('auth:register.termsOfService')}</Link>
          {' '}{t('auth:register.and')}{' '}
          <Link to="/privacy" className="text-amber-700 dark:text-amber-400 hover:underline">{t('auth:register.privacyPolicy')}</Link>
        </span>
      </label>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white btn-gradient disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading
          ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('auth:register.sending')}</>
          : <><Send className="w-4 h-4" />{t('auth:register.sendCode')}</>
        }
      </button>
    </form>
  );

  const renderVerifyStep = () => (
    <div className="space-y-6" onKeyDown={handleKeyDown}>
      <div className="text-center py-2">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-amber-700 dark:text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-1.5 tracking-tight">{t('auth:register.verifyEmailTitle')}</h3>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {t('auth:register.codeSentTo')}{' '}
          <span className="font-semibold text-stone-900 dark:text-stone-100">{maskedEmail}</span>
        </p>
      </div>

      <div className="space-y-4">
        <Input
          label={t('auth:register.verificationCodeLabel')}
          type="text"
          placeholder={t('auth:register.verificationCodePlaceholder', { count: validationRules.VERIFICATION_CODE_LENGTH })}
          value={verificationCode}
          onChange={handleCodeChange}
          fullWidth
          className="text-center text-2xl tracking-[0.5em] font-mono"
          maxLength={validationRules.VERIFICATION_CODE_LENGTH + 1}
        />

        {countdown > 0 ? (
          <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            {t('auth:register.codeExpiresInPrefix')}<span className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums">{formatCountdown(countdown)}</span>{t('auth:register.codeExpiresInSuffix')}
          </div>
        ) : (
          <p className="text-center text-sm text-red-500 dark:text-red-400">{t('auth:register.codeExpired')}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setCurrentStep('form')}
            className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl font-medium text-sm border-2 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-amber-300 dark:hover:border-amber-600 transition-all duration-200"
          >
            {t('auth:register.backToEdit')}
          </button>
          <button
            type="button"
            onClick={handleVerifyAndRegister}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm text-white btn-gradient disabled:opacity-60"
          >
            {isLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('auth:register.verifying')}</> : t('auth:register.verifyAndRegister')}
          </button>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={handleResendCode}
            disabled={countdown > 0 || isLoading}
            className="text-sm text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {countdown > 0 ? t('auth:register.resendCodeWithCountdown', { time: formatCountdown(countdown) }) : t('auth:register.resendCodeFull')}
          </button>
        </div>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="text-center py-8">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center">
        <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h3 className="display-font text-xl font-bold text-stone-900 dark:text-stone-100 mb-2 tracking-tight">{t('auth:register.successTitle')}</h3>
      <p className="text-stone-600 dark:text-stone-400 mb-6">{t('auth:register.welcomeMessage', { name: appInfo.NAME })}</p>
      <div className="flex items-center justify-center gap-2">
        {[0, 150, 300].map((delay, i) => (
          <div key={i} className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </div>
  );

  const getStepTitle = () => {
    if (currentStep === 'form') return t('auth:register.title');
    if (currentStep === 'verify') return t('auth:register.verifyEmailStep');
    return t('auth:register.successStep');
  };

  const getStepDescription = () => {
    if (currentStep === 'form') return t('auth:register.formStepDesc');
    if (currentStep === 'verify') return t('auth:register.verifyStepDesc');
    return '';
  };

  if (!enableRegistration) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-stone-50 dark:bg-[#0a0a0b] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-amber-400/6 dark:bg-amber-500/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-rose-400/6 dark:bg-rose-500/4 rounded-full blur-[100px]" />
          <div className="absolute inset-0 grid-dots opacity-50" />
        </div>

        <div className="w-full max-w-md relative">
          <Link to="/" className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 mb-8 transition-colors text-sm font-medium group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            {t('auth:register.backHome')}
          </Link>

          <div className="rounded-2xl bg-white dark:bg-[#111113]/80 border border-stone-200/80 dark:border-stone-700/50 p-7 sm:p-8 text-center"
            style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
              <Lock className="w-6 h-6 text-stone-400" />
            </div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 mb-2">{t('auth:register.registrationClosedTitle')}</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">{t('auth:register.registrationClosedDesc')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/')}
                className="flex-1 py-2.5 px-4 rounded-xl font-medium text-sm border-2 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-amber-300 dark:hover:border-amber-600 transition-all"
              >
                {t('auth:register.backHome')}
              </button>
              <button
                onClick={() => navigate('/login')}
                className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm text-white btn-gradient"
              >
                {t('auth:register.goToLogin')}
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-stone-400 dark:text-stone-600">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center">
              <Search className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-medium">{appInfo.NAME}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-stone-50 dark:bg-[#0a0a0b] relative overflow-hidden">
      {/* Ambient bg */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-amber-400/6 dark:bg-amber-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-rose-400/6 dark:bg-rose-500/4 rounded-full blur-[100px]" />
        <div className="absolute inset-0 grid-dots opacity-50" />
      </div>

      <div className="w-full max-w-md relative">

        <Link to="/" className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 mb-8 transition-colors text-sm font-medium group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          {t('auth:register.backHome')}
        </Link>

        <div className="rounded-2xl bg-white dark:bg-[#111113]/80 border border-stone-200/80 dark:border-stone-700/50 p-7 sm:p-8"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)' }}>

          {/* Step indicators */}
          {currentStep !== 'success' && (
            <div className="flex items-center justify-center gap-3 mb-7">
              {(['form', 'verify'] as const).map((step, index) => {
                const isActive = currentStep === step;
                const isDone = ['form', 'verify'].indexOf(currentStep) > index;
                return (
                  <React.Fragment key={step}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                      isActive
                        ? 'bg-gradient-to-br from-[#d4a853] to-[#f59e0b] text-white shadow-lg'
                        : isDone
                        ? 'bg-emerald-500 text-white'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500'
                    }`}>
                      {isDone ? <CheckCircle className="w-4 h-4" /> : index + 1}
                    </div>
                    {index < 1 && (
                      <div className={`h-px w-16 transition-all duration-500 ${
                        isDone ? 'bg-emerald-400' : 'bg-stone-200 dark:bg-stone-700'
                      }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          <div className="text-center mb-7">
            <h1 className="display-font text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mb-1.5">
              {getStepTitle()}
            </h1>
            {getStepDescription() && (
              <p className="text-sm text-stone-500 dark:text-stone-400">{getStepDescription()}</p>
            )}
          </div>

          {/* Accent line */}
          {currentStep !== 'success' && <div className="accent-line mb-6" />}

          {currentStep === 'form' && renderFormStep()}
          {currentStep === 'verify' && renderVerifyStep()}
          {currentStep === 'success' && renderSuccessStep()}

          {currentStep === 'form' && (
            <div className="mt-6 text-center">
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {t('auth:register.hasAccount')}{' '}
                <Link to="/login" className="text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 font-semibold transition-colors">
                  {t('auth:register.loginLink')}
                </Link>
              </p>
            </div>
          )}
        </div>

        {/* Brand */}
        <div className="mt-6 flex items-center justify-center gap-2 text-stone-400 dark:text-stone-600">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center">
            <Search className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-medium">{appInfo.NAME}</span>
        </div>
      </div>
    </div>
  );
};
