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
import { useAuthStore, useThemeStore } from '@/stores';
import { userApi, authApi } from '@/services/api';
import { useNotification } from '@/hooks';
import { useValidationRules } from '@/contexts';

export const SettingsManager: React.FC = () => {
  const navigate = useNavigate();
  const notification = useNotification();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
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
      notification.error('密码不匹配', '两次输入的密码不一致');
      return;
    }

    if (passwordForm.newPassword.length < validationRules.PASSWORD_MIN_LENGTH) {
      notification.error('密码太短', `密码至少需要${validationRules.PASSWORD_MIN_LENGTH}个字符`);
      return;
    }
    if (passwordForm.newPassword.length > validationRules.PASSWORD_MAX_LENGTH) {
      notification.error('密码太长', `密码最多${validationRules.PASSWORD_MAX_LENGTH}个字符`);
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
      notification.error('请输入新邮箱');
      return;
    }
    if (!validationRules.EMAIL_REGEX.test(emailChangeForm.newEmail)) {
      notification.error('请输入有效的邮箱地址');
      return;
    }
    if (!emailChangeForm.currentPassword) {
      notification.error('请输入当前密码');
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
      notification.error('请输入6位验证码');
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
        notification.success('邮箱更改请求已取消');
        setEmailChangeModal(false);
        setEmailChangeStep('request');
        setEmailChangeForm({ newEmail: '', currentPassword: '', verificationCode: '' });
        setEmailChangeRequestId('');
        setEmailChangeMaskedEmail('');
        setEmailChangeCountdown(0);
      } else {
        notification.error(response.message || '取消失败');
      }
    } catch (error: any) {
      notification.error(error.message || '取消失败');
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
    if (deleteConfirmText !== '删除我的账户') {
      notification.error('请输入正确的确认文字');
      return;
    }

    const cleanCode = deleteVerificationCode.replace(/\s/g, '');
    if (cleanCode.length !== 6) {
      notification.error('请输入6位验证码');
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
        notification.error('删除失败', response.message || '验证码错误');
      }
    } catch (error: any) {
      notification.error('删除失败', error.message);
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
      title="更改邮箱"
      size="md"
    >
      {emailChangeStep === 'request' ? (
        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-surface-50 to-surface-100 dark:from-surface-800/50 dark:to-surface-800 rounded-xl">
            <p className="text-sm text-surface-600 dark:text-surface-400">当前邮箱</p>
            <p className="font-medium text-surface-900 dark:text-surface-100">
              {maskEmail(user?.email || '')}
            </p>
          </div>

          <Input
            label="新邮箱地址"
            type="email"
            placeholder="请输入新邮箱"
            value={emailChangeForm.newEmail}
            onChange={(e) => setEmailChangeForm({ ...emailChangeForm, newEmail: e.target.value })}
            leftIcon={<Mail className="w-5 h-5" />}
            fullWidth
          />

          <Input
            label="当前密码"
            type="password"
            placeholder="请输入当前密码验证身份"
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
              取消
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleRequestEmailChange}
              isLoading={isLoading}
              leftIcon={<Send className="w-5 h-5" />}
            >
              发送验证码
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
              验证码已发送到 <span className="font-medium">{emailChangeMaskedEmail}</span>
            </p>
          </div>

          <Input
            label="验证码"
            type="text"
            placeholder={`请输入${validationRules.VERIFICATION_CODE_LENGTH}位验证码`}
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
              验证码 {formatCountdown(emailChangeCountdown)} 后过期
            </p>
          ) : (
            <p className="text-center text-sm text-error-500">验证码已过期</p>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setEmailChangeStep('request')}
            >
              返回
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleVerifyEmailChange}
              isLoading={isLoading}
            >
              验证并更改
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
              取消此次更换
            </Button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResendEmailChangeCode}
              disabled={emailChangeCountdown > 0 || isLoading}
              className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {emailChangeCountdown > 0 ? `重新发送 (${formatCountdown(emailChangeCountdown)})` : '重新发送验证码'}
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
      title="删除账户"
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
                  警告：此操作无法撤销
                </h4>
                <p className="text-sm text-error-600 dark:text-error-400">
                  删除账户将永久移除您的所有数据，包括：
                </p>
                <ul className="text-sm text-error-600 dark:text-error-400 mt-2 list-disc list-inside">
                  <li>个人资料和设置</li>
                  <li>所有收藏夹</li>
                  <li>搜索历史记录</li>
                  <li>社区分享的搜索源</li>
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
              取消
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={handleSendDeleteCode}
              isLoading={isLoading}
            >
              我理解风险，继续
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
              验证码已发送到 <span className="font-medium">{deleteMaskedEmail}</span>
            </p>
          </div>

          <div className="p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
            <p className="text-sm text-surface-600 dark:text-surface-400 mb-2">
              请输入以下文字确认删除：
            </p>
            <p className="font-mono font-bold text-surface-900 dark:text-surface-100">
              删除我的账户
            </p>
          </div>

          <Input
            type="text"
            placeholder="请输入确认文字"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            fullWidth
          />

          <Input
            label="验证码"
            type="text"
            placeholder={`请输入${validationRules.VERIFICATION_CODE_LENGTH}位验证码`}
            value={deleteVerificationCode}
            onChange={(e) => setDeleteVerificationCode(formatVerificationCode(e.target.value))}
            fullWidth
            className="text-center text-xl tracking-widest"
            maxLength={validationRules.VERIFICATION_CODE_LENGTH + 1}
          />

          {deleteCountdown > 0 ? (
            <p className="text-center text-sm text-surface-500">
              验证码 {formatCountdown(deleteCountdown)} 后过期
            </p>
          ) : (
            <p className="text-center text-sm text-error-500">验证码已过期</p>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setDeleteAccountStep('confirm')}
            >
              返回
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={handleDeleteAccount}
              isLoading={isLoading}
            >
              确认删除账户
            </Button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResendDeleteCode}
              disabled={deleteCountdown > 0 || isLoading}
              className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteCountdown > 0 ? `重新发送 (${formatCountdown(deleteCountdown)})` : '重新发送验证码'}
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
            系统设置
          </h2>
          <p className="text-surface-500 dark:text-surface-400">
            管理您的账户和偏好设置
          </p>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'profile', label: '个人资料', icon: <User className="w-4 h-4" /> },
          { id: 'security', label: '安全设置', icon: <Shield className="w-4 h-4" /> },
          { id: 'appearance', label: '外观设置', icon: <Palette className="w-4 h-4" /> },
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
            个人资料
          </h3>
          <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
            <Input
              label="用户名"
              value={profileForm.username}
              onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
              fullWidth
            />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                邮箱
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
                  更改
                </Button>
              </div>
            </div>
            <Button type="submit" variant="primary" isLoading={isLoading}>
              保存更改
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
              修改密码
            </h3>
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <Input
                label="当前密码"
                type={showPassword ? 'text' : 'password'}
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                leftIcon={<Lock className="w-5 h-5" />}
                fullWidth
              />
              <Input
                label="新密码"
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
                label="确认新密码"
                type={showPassword ? 'text' : 'password'}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                leftIcon={<Lock className="w-5 h-5" />}
                fullWidth
              />
              <Button type="submit" variant="primary" isLoading={isLoading}>
                修改密码
              </Button>
            </form>
          </Card>

          <Card className="p-6 border-error-200 dark:border-error-800 shadow-lg bg-gradient-to-r from-error-50/50 to-error-100/30 dark:from-error-900/10 dark:to-error-800/10">
            <h3 className="text-lg font-semibold text-error-600 dark:text-error-400 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-error-100 dark:bg-error-900/30 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-error-600 dark:text-error-400" />
              </div>
              危险操作
            </h3>
            <p className="text-sm text-surface-600 dark:text-surface-400 mb-4">
              以下操作不可撤销，请谨慎操作
            </p>
            <Button
              variant="danger"
              onClick={() => setDeleteAccountModal(true)}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              删除账户
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
            外观设置
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">
                主题模式
              </label>
              <div className="flex gap-3">
                {[
                  { value: 'light', label: '浅色', icon: '☀️' },
                  { value: 'dark', label: '深色', icon: '🌙' },
                  { value: 'system', label: '跟随系统', icon: '💻' },
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
          </div>
        </Card>
      )}

      {renderEmailChangeModal()}
      {renderDeleteAccountModal()}
    </div>
  );
};
