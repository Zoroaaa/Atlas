import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  Shield, 
  Palette, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Send, 
  AlertTriangle,
  Trash2,
  Settings,
} from 'lucide-react';
import { Card, Button, Input, Tabs, Modal } from '@/components/ui';
import { useAuthStore, useThemeStore, useLanguageStore } from '@/stores';
import { userApi, authApi } from '@/services/api';
import { useNotification } from '@/hooks';
import { useValidationRules } from '@/contexts';
import { useTranslation } from 'react-i18next';
import i18next from '@/i18n';
import { SUPPORTED_LANGUAGES, type Language } from '@/i18n/config';

export const SettingsManager: React.FC = () => {
  const navigate = useNavigate();
  const notification = useNotification();
  const { t } = useTranslation(['common', 'dashboard']);
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const { language, setLanguage } = useLanguageStore();
  const validationRules = useValidationRules();
  const [activeTab, setActiveTab] = useState('profile');
  const [isLoading, setIsLoading] = useState(false);
  
  const [profileForm, setProfileForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
  });

  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        username: prev.username || user.username || '',
        email: prev.email || user.email || '',
      }));
    }
  }, [user?.username, user?.email, user]);
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  
  const [emailChangeModal, setEmailChangeModal] = useState(false);
  const [emailChangeStep, setEmailChangeStep] = useState<'request' | 'verify'>('request');
  const [emailChangeForm, setEmailChangeForm] = useState({
    newEmail: '',
    currentPassword: '',
    verificationCode: '',
  });
  const [emailChangeCountdown, setEmailChangeCountdown] = useState(0);
  const [emailChangeRequestId, setEmailChangeRequestId] = useState('');
  const [emailChangeMaskedEmail, setEmailChangeMaskedEmail] = useState('');

  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deleteAccountStep, setDeleteAccountStep] = useState<'confirm' | 'verify'>('confirm');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteVerificationCode, setDeleteVerificationCode] = useState('');
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const [deleteMaskedEmail, setDeleteMaskedEmail] = useState('');

  const maskEmail = (email: string): string => {
    if (!email) return '';
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) {
      return `${localPart[0]}***@${domain}`;
    }
    const masked = localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1];
    return `${masked}@${domain}`;
  };

  // 页面加载时检查是否有待处理的验证（修改邮箱 / 删除账号），若有则直接恢复到验证码输入步骤
  useEffect(() => {
    if (!user?.email) return;
    authApi.getUserVerificationStatus().then((res) => {
      if (!res.success || !res.data) return;

      const pending = res.data.pendingVerifications || [];
      const emailChangeReq = res.data.emailChangeRequest;

      // 修改邮箱：有进行中的请求且有待验证的 new email 验证码
      const emailChangeVerif = pending.find((v: { verification_type: string }) => v.verification_type === 'email_change_new');
      if (emailChangeReq && emailChangeVerif) {
        setEmailChangeRequestId(emailChangeReq.id);
        setEmailChangeMaskedEmail(maskEmail(emailChangeReq.new_email));
        authApi.checkVerificationStatus(emailChangeReq.new_email, 'email_change_new').then((sv) => {
          if (sv.success && sv.data?.hasPendingVerification && sv.data.remainingTime && sv.data.remainingTime > 0) {
            setEmailChangeCountdown(Math.floor(sv.data.remainingTime / 1000));
          }
        });
        setEmailChangeStep('verify');
        setEmailChangeModal(true);
        return;
      }

      // 删除账号：有待验证的 account_delete 验证码
      const deleteVerif = pending.find((v: { verification_type: string }) => v.verification_type === 'account_delete');
      if (deleteVerif && user.email) {
        authApi.checkVerificationStatus(user.email, 'account_delete').then((sv) => {
          if (sv.success && sv.data?.hasPendingVerification && sv.data.remainingTime && sv.data.remainingTime > 0) {
            setDeleteMaskedEmail(maskEmail(user.email!));
            setDeleteCountdown(Math.floor(sv.data.remainingTime / 1000));
            setDeleteAccountStep('verify');
            setDeleteAccountModal(true);
          }
        });
      }
    }).catch(() => { /* 静默忽略 */ });
  }, [user?.email]);

  useEffect(() => {
    if (emailChangeCountdown > 0) {
      const timer = setTimeout(() => setEmailChangeCountdown(emailChangeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [emailChangeCountdown]);

  useEffect(() => {
    if (deleteCountdown > 0) {
      const timer = setTimeout(() => setDeleteCountdown(deleteCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [deleteCountdown]);

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatVerificationCode = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    const limited = cleaned.substring(0, 6);
    return limited.replace(/(\d{3})(\d{1,3})?/, '$1 $2').trim();
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await userApi.updateSettings({ 
        profile: { 
          username: profileForm.username,
        } 
      });
      notification.auth.profileUpdateSuccess();
    } catch (error: any) {
      notification.auth.profileUpdateFailed(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      notification.error(i18next.t('dashboard:settings.passwordMismatch'), i18next.t('dashboard:settings.passwordMismatchMsg'));
      return;
    }

    if (passwordForm.newPassword.length < validationRules.PASSWORD_MIN_LENGTH) {
      notification.error(i18next.t('dashboard:settings.passwordTooShort'), i18next.t('dashboard:settings.passwordTooShortMsg', { count: validationRules.PASSWORD_MIN_LENGTH }));
      return;
    }
    if (passwordForm.newPassword.length > validationRules.PASSWORD_MAX_LENGTH) {
      notification.error(i18next.t('dashboard:settings.passwordTooLong'), i18next.t('dashboard:settings.passwordTooLongMsg', { count: validationRules.PASSWORD_MAX_LENGTH }));
      return;
    }
    
    setIsLoading(true);
    try {
      await authApi.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      notification.auth.passwordChangeSuccess();
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 2000);
    } catch (error: any) {
      notification.auth.passwordChangeFailed(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestEmailChange = async () => {
    if (!emailChangeForm.newEmail) {
      notification.error(i18next.t('dashboard:settings.newEmailRequired'));
      return;
    }
    if (!validationRules.EMAIL_REGEX.test(emailChangeForm.newEmail)) {
      notification.error(i18next.t('dashboard:settings.emailInvalid'));
      return;
    }
    if (!emailChangeForm.currentPassword) {
      notification.error(i18next.t('dashboard:settings.currentPasswordRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.requestEmailChange({
        newEmail: emailChangeForm.newEmail,
        currentPassword: emailChangeForm.currentPassword,
      });
      
      if (response.success && response.data) {
        const requestId = response.data.requestId;
        setEmailChangeRequestId(requestId);
        setEmailChangeMaskedEmail(response.data.maskedEmail);

        const sendResponse = await authApi.sendEmailChangeCode({
          requestId,
          emailType: 'new',
        });

        if (sendResponse.success && sendResponse.data) {
          setEmailChangeCountdown(sendResponse.data.expiresIn || 300);
        } else {
          setEmailChangeCountdown(response.data.expiresIn || 300);
        }

        setEmailChangeStep('verify');
        notification.settings.emailChangeCodeSent();
      }
    } catch (error: any) {
      notification.settings.emailChangeFailed(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmailChangeCode = async () => {
    if (emailChangeCountdown > 0) return;
    
    setIsLoading(true);
    try {
      const response = await authApi.sendEmailChangeCode({
        requestId: emailChangeRequestId,
        emailType: 'new',
      });
      
      if (response.success && response.data) {
        setEmailChangeCountdown(response.data.expiresIn || 300);
        notification.auth.emailCodeResent();
      }
    } catch (error: any) {
      notification.auth.emailCodeFailed(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmailChange = async () => {
    const cleanCode = emailChangeForm.verificationCode.replace(/\s/g, '');
    if (cleanCode.length !== 6) {
      notification.error(i18next.t('dashboard:settings.code6DigitsRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.verifyEmailChangeCode({
        requestId: emailChangeRequestId,
        emailType: 'new',
        code: cleanCode,
      });
      
      if (response.success && response.data?.completed) {
        notification.settings.emailChangeSuccess();
        setEmailChangeModal(false);
        setEmailChangeStep('request');
        setEmailChangeForm({ newEmail: '', currentPassword: '', verificationCode: '' });
        setTimeout(() => {
          logout();
          navigate('/login');
        }, 2000);
      } else {
        notification.settings.emailChangeFailed(response.message);
      }
    } catch (error: any) {
      notification.settings.emailChangeFailed(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEmailChange = async () => {
    if (!emailChangeRequestId) return;

    setIsLoading(true);
    try {
      const response = await authApi.cancelEmailChangeRequest(emailChangeRequestId);
      
      if (response.success) {
        notification.success(i18next.t('dashboard:settings.cancelSuccess'));
        setEmailChangeModal(false);
        setEmailChangeStep('request');
        setEmailChangeForm({ newEmail: '', currentPassword: '', verificationCode: '' });
        setEmailChangeRequestId('');
        setEmailChangeMaskedEmail('');
        setEmailChangeCountdown(0);
      } else {
        notification.error(response.message || i18next.t('dashboard:settings.cancelFailed'));
      }
    } catch (error: any) {
      notification.error(error.message || i18next.t('dashboard:settings.cancelFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendDeleteCode = async () => {
    setIsLoading(true);
    try {
      const response = await authApi.sendAccountDeleteCode();
      
      if (response.success && response.data) {
        setDeleteMaskedEmail(response.data.maskedEmail);
        setDeleteCountdown(response.data.expiresIn || 300);
        setDeleteAccountStep('verify');
        notification.auth.emailCodeSent();
      }
    } catch (error: any) {
      notification.auth.emailCodeFailed(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendDeleteCode = async () => {
    if (deleteCountdown > 0) return;
    await handleSendDeleteCode();
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== i18next.t('dashboard:settings.deleteConfirmText')) {
      notification.error(i18next.t('dashboard:settings.deleteConfirmTextInvalid'));
      return;
    }

    const cleanCode = deleteVerificationCode.replace(/\s/g, '');
    if (cleanCode.length !== 6) {
      notification.error(i18next.t('dashboard:settings.code6DigitsRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.deleteAccount({
        verificationCode: cleanCode,
        confirmText: deleteConfirmText,
      });
      
      if (response.success) {
        notification.auth.accountDeleted();
        setDeleteAccountModal(false);
        setTimeout(() => {
          logout();
          navigate('/');
        }, 2000);
      } else {
        notification.error(i18next.t('dashboard:settings.deleteFailed'), response.message || i18next.t('dashboard:settings.codeError'));
      }
    } catch (error: any) {
      notification.error(i18next.t('dashboard:settings.deleteFailed'), error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderEmailChangeModal = () => (
    <Modal
      isOpen={emailChangeModal}
      onClose={() => {
        setEmailChangeModal(false);
        setEmailChangeStep('request');
        setEmailChangeForm({ newEmail: '', currentPassword: '', verificationCode: '' });
      }}
      title={t('dashboard:settings.changeEmailTitle')}
      size="md"
    >
      {emailChangeStep === 'request' ? (
        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-surface-50 to-surface-100 dark:from-surface-800/50 dark:to-surface-800 rounded-xl">
            <p className="text-sm text-surface-600 dark:text-surface-400">{t('dashboard:settings.currentEmail')}</p>
            <p className="font-medium text-surface-900 dark:text-surface-100">
              {maskEmail(user?.email || '')}
            </p>
          </div>

          <Input
            label={t('dashboard:settings.newEmailLabel')}
            type="email"
            placeholder={t('dashboard:settings.newEmailPlaceholder')}
            value={emailChangeForm.newEmail}
            onChange={(e) => setEmailChangeForm({ ...emailChangeForm, newEmail: e.target.value })}
            leftIcon={<Mail className="w-5 h-5" />}
            fullWidth
          />

          <Input
            label={t('dashboard:settings.currentPasswordLabel')}
            type="password"
            placeholder={t('dashboard:settings.currentPasswordPlaceholder')}
            value={emailChangeForm.currentPassword}
            onChange={(e) => setEmailChangeForm({ ...emailChangeForm, currentPassword: e.target.value })}
            leftIcon={<Lock className="w-5 h-5" />}
            fullWidth
          />

          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setEmailChangeModal(false)}
            >
              {t('dashboard:settings.cancel')}
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleRequestEmailChange}
              isLoading={isLoading}
              leftIcon={<Send className="w-5 h-5" />}
            >
              {t('dashboard:settings.sendCode')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm text-surface-600 dark:text-surface-400">
              {t('dashboard:settings.codeSentTo')} <span className="font-medium">{emailChangeMaskedEmail}</span>
            </p>
          </div>

          <Input
            label={t('dashboard:settings.verificationCodeLabel')}
            type="text"
            placeholder={t('dashboard:settings.verifyCodePlaceholder', { count: validationRules.VERIFICATION_CODE_LENGTH })}
            value={emailChangeForm.verificationCode}
            onChange={(e) => setEmailChangeForm({ 
              ...emailChangeForm, 
              verificationCode: formatVerificationCode(e.target.value) 
            })}
            fullWidth
            className="text-center text-xl tracking-widest"
            maxLength={validationRules.VERIFICATION_CODE_LENGTH + 1}
          />

          {emailChangeCountdown > 0 ? (
            <p className="text-center text-sm text-surface-500">
              {t('dashboard:settings.codeExpiresIn', { countdown: formatCountdown(emailChangeCountdown) })}
            </p>
          ) : (
            <p className="text-center text-sm text-error-500">{t('dashboard:settings.codeExpired')}</p>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setEmailChangeStep('request')}
            >
              {t('dashboard:settings.back')}
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleVerifyEmailChange}
              isLoading={isLoading}
            >
              {t('dashboard:settings.verifyAndChange')}
            </Button>
          </div>

          <div className="flex gap-3">
            <Button
              variant="ghost"
              fullWidth
              onClick={handleCancelEmailChange}
              isLoading={isLoading}
              className="text-error-600 hover:text-error-700 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-900/20"
            >
              {t('dashboard:settings.cancelChange')}
            </Button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResendEmailChangeCode}
              disabled={emailChangeCountdown > 0 || isLoading}
              className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {emailChangeCountdown > 0 ? `${t('dashboard:settings.resend')} (${formatCountdown(emailChangeCountdown)})` : t('dashboard:settings.resendCode')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );

  const renderDeleteAccountModal = () => (
    <Modal
      isOpen={deleteAccountModal}
      onClose={() => {
        setDeleteAccountModal(false);
        setDeleteAccountStep('confirm');
        setDeleteConfirmText('');
        setDeleteVerificationCode('');
      }}
      title={t('dashboard:settings.deleteAccount')}
      size="md"
    >
      {deleteAccountStep === 'confirm' ? (
        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-error-50 to-error-100/50 dark:from-error-900/20 dark:to-error-800/20 rounded-xl border border-error-200 dark:border-error-800">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-error-500 to-error-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-error-700 dark:text-error-400 mb-1">
                  {t('dashboard:settings.warningCannotUndo')}
                </h4>
                <p className="text-sm text-error-600 dark:text-error-400">
                  {t('dashboard:settings.deleteAccountWarningDesc')}
                </p>
                <ul className="text-sm text-error-600 dark:text-error-400 mt-2 list-disc list-inside">
                  <li>{t('dashboard:settings.deleteItemProfile')}</li>
                  <li>{t('dashboard:settings.deleteItemFavorites')}</li>
                  <li>{t('dashboard:settings.deleteItemHistory')}</li>
                  <li>{t('dashboard:settings.deleteItemSources')}</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setDeleteAccountModal(false)}
            >
              {t('dashboard:settings.cancel')}
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={handleSendDeleteCode}
              isLoading={isLoading}
            >
              {t('dashboard:settings.iUnderstandContinue')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gradient-to-br from-error-500 to-error-600 flex items-center justify-center shadow-lg">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm text-surface-600 dark:text-surface-400">
              {t('dashboard:settings.codeSentTo')} <span className="font-medium">{deleteMaskedEmail}</span>
            </p>
          </div>

          <div className="p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
            <p className="text-sm text-surface-600 dark:text-surface-400 mb-2">
              {t('dashboard:settings.deleteConfirmPrompt')}
            </p>
            <p className="font-mono font-bold text-surface-900 dark:text-surface-100">
              {t('dashboard:settings.deleteConfirmText')}
            </p>
          </div>

          <Input
            type="text"
            placeholder={t('dashboard:settings.confirmTextPlaceholder')}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            fullWidth
          />

          <Input
            label={t('dashboard:settings.verificationCodeLabel')}
            type="text"
            placeholder={t('dashboard:settings.verifyCodePlaceholder', { count: validationRules.VERIFICATION_CODE_LENGTH })}
            value={deleteVerificationCode}
            onChange={(e) => setDeleteVerificationCode(formatVerificationCode(e.target.value))}
            fullWidth
            className="text-center text-xl tracking-widest"
            maxLength={validationRules.VERIFICATION_CODE_LENGTH + 1}
          />

          {deleteCountdown > 0 ? (
            <p className="text-center text-sm text-surface-500">
              {t('dashboard:settings.codeExpiresIn', { countdown: formatCountdown(deleteCountdown) })}
            </p>
          ) : (
            <p className="text-center text-sm text-error-500">{t('dashboard:settings.codeExpired')}</p>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setDeleteAccountStep('confirm')}
            >
              {t('dashboard:settings.back')}
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={handleDeleteAccount}
              isLoading={isLoading}
            >
              {t('dashboard:settings.confirmDeleteAccount')}
            </Button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResendDeleteCode}
              disabled={deleteCountdown > 0 || isLoading}
              className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteCountdown > 0 ? `${t('dashboard:settings.resend')} (${formatCountdown(deleteCountdown)})` : t('dashboard:settings.resendCode')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
          <Settings className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
            {t('dashboard:settings.systemSettings')}
          </h2>
          <p className="text-surface-500 dark:text-surface-400">
            {t('dashboard:settings.manageAccountSubtitle')}
          </p>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'profile', label: t('dashboard:settings.tabProfile'), icon: <User className="w-4 h-4" /> },
          { id: 'security', label: t('dashboard:settings.tabSecurity'), icon: <Shield className="w-4 h-4" /> },
          { id: 'appearance', label: t('dashboard:settings.tabAppearance'), icon: <Palette className="w-4 h-4" /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'profile' && (
        <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <User className="w-4 h-4 text-primary-600 dark:text-primary-400" />
            </div>
            {t('dashboard:settings.profile')}
          </h3>
          <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
            <Input
              label={t('dashboard:settings.usernameLabel')}
              value={profileForm.username}
              onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
              fullWidth
            />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                {t('dashboard:settings.email')}
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1 p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
                  <span className="text-surface-900 dark:text-surface-100">
                    {maskEmail(user?.email || '')}
                  </span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setEmailChangeModal(true)}
                  leftIcon={<Mail className="w-4 h-4" />}
                >
                  {t('dashboard:settings.change')}
                </Button>
              </div>
            </div>
            <Button type="submit" variant="primary" isLoading={isLoading}>
              {t('dashboard:settings.saveChanges')}
            </Button>
          </form>
        </Card>
      )}

      {activeTab === 'security' && (
        <div className="space-y-6">
          <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                <Lock className="w-4 h-4 text-success-600 dark:text-success-400" />
              </div>
            {t('dashboard:settings.changePassword')}
          </h3>
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <Input
                label={t('dashboard:settings.currentPasswordLabel')}
                type={showPassword ? 'text' : 'password'}
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                leftIcon={<Lock className="w-5 h-5" />}
                fullWidth
              />
              <Input
                label={t('dashboard:settings.newPasswordLabel')}
                type={showPassword ? 'text' : 'password'}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                leftIcon={<Lock className="w-5 h-5" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-surface-400 hover:text-surface-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                }
                fullWidth
              />
              <Input
                label={t('dashboard:settings.confirmNewPasswordLabel')}
                type={showPassword ? 'text' : 'password'}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                leftIcon={<Lock className="w-5 h-5" />}
                fullWidth
              />
              <Button type="submit" variant="primary" isLoading={isLoading}>
                {t('dashboard:settings.changePassword')}
              </Button>
            </form>
          </Card>

          <Card className="p-6 border-error-200 dark:border-error-800 shadow-lg bg-gradient-to-r from-error-50/50 to-error-100/30 dark:from-error-900/10 dark:to-error-800/10">
            <h3 className="text-lg font-semibold text-error-600 dark:text-error-400 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-error-100 dark:bg-error-900/30 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-error-600 dark:text-error-400" />
              </div>
            {t('dashboard:settings.dangerZone')}
          </h3>
            <p className="text-sm text-surface-600 dark:text-surface-400 mb-4">
              {t('dashboard:settings.dangerZoneDesc')}
            </p>
            <Button
              variant="danger"
              onClick={() => setDeleteAccountModal(true)}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              {t('dashboard:settings.deleteAccount')}
            </Button>
          </Card>
        </div>
      )}

      {activeTab === 'appearance' && (
        <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
              <Palette className="w-4 h-4 text-accent-600 dark:text-accent-400" />
            </div>
            {t('dashboard:settings.appearance')}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">
                {t('dashboard:settings.themeMode')}
              </label>
              <div className="flex gap-3">
                {[
                  { value: 'light', label: t('dashboard:settings.themeLight'), icon: '☀️' },
                  { value: 'dark', label: t('dashboard:settings.themeDark'), icon: '🌙' },
                  { value: 'system', label: t('dashboard:settings.themeSystem'), icon: '💻' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value as 'light' | 'dark' | 'system')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 transition-all duration-200 ${
                      theme === option.value
                        ? 'border-primary-500 bg-gradient-to-r from-primary-50 to-accent-50 text-primary-600 dark:from-primary-900/20 dark:to-accent-900/20 dark:text-primary-400 shadow-md'
                        : 'border-surface-200 dark:border-surface-700 hover:border-primary-300 dark:hover:border-primary-600'
                    }`}
                  >
                    <span className="text-xl">{option.icon}</span>
                    <span className="font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">
                {t('common:languageLabel')}
              </label>
              <div className="flex gap-3 flex-wrap">
                {SUPPORTED_LANGUAGES.map((option) => (
                  <button
                    key={option.code}
                    onClick={() => setLanguage(option.code as Language)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 transition-all duration-200 ${
                      language === option.code
                        ? 'border-primary-500 bg-gradient-to-r from-primary-50 to-accent-50 text-primary-600 dark:from-primary-900/20 dark:to-accent-900/20 dark:text-primary-400 shadow-md'
                        : 'border-surface-200 dark:border-surface-700 hover:border-primary-300 dark:hover:border-primary-600'
                    }`}
                  >
                    <span className="font-medium">{option.nativeName}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {renderEmailChangeModal()}
      {renderDeleteAccountModal()}
    </div>
  );
};
