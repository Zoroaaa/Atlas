/**
 * 认证 API：OAuth 跳转与登录态 token 的读写都收敛在这里。
 *
 * 约束：登录/注册/刷新成功后立即写 store 并持久化；登出无论服务端成败都要清本地态。
 */

import { apiClient } from './client';
import { parseRequest } from '../validation';
import { getApiBaseUrl } from '@/constants';
import type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  DeleteAccountRequest,
  SendVerificationCodeRequest,
  SendRegistrationCodeRequest,
  VerificationStatusResponse,
  EmailChangeRequest,
  SendEmailChangeCodeRequest,
  VerifyEmailChangeCodeRequest,
  TokenVerifyResponse,
} from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { isNativeApp, openOAuthUrl } from '@/utils/nativeShell';

/** OAuth 授权入口地址；原生壳追加 client=app，回调后通过深链回到 App */
function buildOAuthUrl(path: string): string {
  const url = new URL(`${getApiBaseUrl()}${path}`, window.location.origin);
  if (isNativeApp()) {
    url.searchParams.set('client', 'app');
  }
  return url.toString();
}

/** 认证相关接口；除 OAuth 跳转外都走 apiClient 统一错误处理。 */
export const authApi = {
  loginWithGitHub: (): void => {
    void openOAuthUrl(buildOAuthUrl('/auth/github'));
  },

  loginWithGoogle: (): void => {
    void openOAuthUrl(buildOAuthUrl('/auth/google'));
  },

  /** OAuth 回调的一次性 code 兑换：token 只在响应体里出现，不再经过 URL */
  exchangeOAuthCode: async (code: string): Promise<AuthResponse> => {
    const { exchangeOAuthCodeSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<{ code: string }>(exchangeOAuthCodeSchema, { code });
    const response = await apiClient.post<AuthResponse>('/auth/oauth/exchange', payload);
    if (response.success && response.data?.token) {
      const store = useAuthStore.getState();
      store.setToken(response.data.token);
      store.persistToken(response.data.token);
    }
    return response;
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const { loginSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<LoginRequest>(loginSchema, data);
    const response = await apiClient.post<AuthResponse>('/auth/login', payload);
    // 登录成功立即写内存与 localStorage，刷新页面后仍能带上 token
    if (response.success && response.data?.token) {
      const store = useAuthStore.getState();
      store.setToken(response.data.token);
      store.persistToken(response.data.token);
    }
    return response;
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const { registerSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<RegisterRequest>(registerSchema, data);
    const response = await apiClient.post<AuthResponse>('/auth/register', payload);
    if (response.success && response.data?.token) {
      const store = useAuthStore.getState();
      store.setToken(response.data.token);
      store.persistToken(response.data.token);
    }
    return response;
  },

  logout: async (): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiClient.post<{ success: boolean; message: string }>('/auth/logout', {});
      return response;
    } finally {
      // 服务端注销失败也要清本地登录态，避免残留可用 token
      useAuthStore.getState().logout();
    }
  },

  getCurrentUser: async (): Promise<{ success: boolean; data: User }> => {
    return apiClient.get<{ success: boolean; data: User }>('/auth/me');
  },

  verifyToken: async (token?: string): Promise<{ success: boolean; data: TokenVerifyResponse }> => {
    // 先落 token 再校验：/auth/verify-token 依赖 Authorization 头
    if (token) {
      const store = useAuthStore.getState();
      store.setToken(token);
      store.persistToken(token);
    }
    return apiClient.post<{ success: boolean; data: TokenVerifyResponse }>('/auth/verify-token', {});
  },

  refreshToken: async (): Promise<{ success: boolean; data: { token: string } }> => {
    const response = await apiClient.post<{ success: boolean; data: { token: string } }>('/auth/refresh', {});
    if (response.success && response.data?.token) {
      const store = useAuthStore.getState();
      store.setToken(response.data.token);
      store.persistToken(response.data.token);
    }
    return response;
  },

  forgotPassword: async (data: ForgotPasswordRequest): Promise<{ 
    success: boolean; 
    data?: { maskedEmail: string; expiresIn: number };
    message?: string;
  }> => {
    const { forgotPasswordSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<ForgotPasswordRequest>(forgotPasswordSchema, data);
    return apiClient.post<{ 
      success: boolean; 
      data?: { maskedEmail: string; expiresIn: number };
      message?: string;
    }>('/auth/forgot-password', payload);
  },

  resetPassword: async (data: ResetPasswordRequest): Promise<{ success: boolean; message: string }> => {
    const { resetPasswordSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<ResetPasswordRequest>(resetPasswordSchema, data);
    return apiClient.post<{ success: boolean; message: string }>('/auth/reset-password', payload);
  },

  changePassword: async (data: ChangePasswordRequest): Promise<{ success: boolean; message: string }> => {
    const { changePasswordSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<ChangePasswordRequest>(changePasswordSchema, data);
    return apiClient.put<{ success: boolean; message: string }>('/auth/change-password', payload);
  },

  deleteAccount: async (data: DeleteAccountRequest): Promise<{ success: boolean; message: string }> => {
    // 不在失败时登出：验证码错误等 400 不应把用户踢下线；
    // 删除成功后由调用方负责清理本地登录态。
    const { deleteAccountSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<DeleteAccountRequest>(deleteAccountSchema, data);
    return apiClient.delete<{ success: boolean; message: string }>('/auth/account', payload);
  },

  // username 可选：带上时后端在发码前就拦下重名；不传则退回注册时校验（兼容旧调用方）
  sendRegistrationCode: async (email: string, username?: string): Promise<{ 
    success: boolean; 
    data?: { maskedEmail: string; expiresIn: number };
    message?: string;
  }> => {
    const { sendRegistrationCodeSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<SendRegistrationCodeRequest>(sendRegistrationCodeSchema, { email, username });
    return apiClient.post<{ 
      success: boolean; 
      data?: { maskedEmail: string; expiresIn: number };
      message?: string;
    }>('/auth/send-registration-code', payload);
  },

  sendAccountDeleteCode: async (): Promise<{ 
    success: boolean; 
    data?: { maskedEmail: string; expiresIn: number };
    message?: string;
  }> => {
    return apiClient.post<{ 
      success: boolean; 
      data?: { maskedEmail: string; expiresIn: number };
      message?: string;
    }>('/auth/send-account-delete-code', {});
  },

  sendCurrentEmailCode: async (): Promise<{ 
    success: boolean; 
    data?: { maskedEmail: string; expiresIn: number };
    message?: string;
  }> => {
    return apiClient.post<{ 
      success: boolean; 
      data?: { maskedEmail: string; expiresIn: number };
      message?: string;
    }>('/auth/send-current-email-code', {});
  },

  verifyCurrentEmail: async (code: string): Promise<{ 
    success: boolean; 
    data?: { emailVerified: boolean };
    message?: string;
  }> => {
    const { verifyCurrentEmailSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<{ code: string }>(verifyCurrentEmailSchema, { code });
    return apiClient.post<{ 
      success: boolean; 
      data?: { emailVerified: boolean };
      message?: string;
    }>('/auth/verify-current-email', payload);
  },

  smartSendCode: async (data: SendVerificationCodeRequest): Promise<{ 
    success: boolean; 
    data?: { 
      maskedEmail: string; 
      expiresIn: number; 
      canResend: boolean;
      hasPendingCode?: boolean;
    };
    message?: string;
  }> => {
    return apiClient.post<{ 
      success: boolean; 
      data?: { 
        maskedEmail: string; 
        expiresIn: number; 
        canResend: boolean;
        hasPendingCode?: boolean;
      };
      message?: string;
    }>('/auth/smart-send-code', data);
  },

  checkVerificationStatus: async (email: string, type: string): Promise<{ 
    success: boolean; 
    data?: VerificationStatusResponse;
    message?: string;
  }> => {
    return apiClient.get<{ 
      success: boolean; 
      data?: VerificationStatusResponse;
      message?: string;
    }>(`/auth/verification-status?email=${encodeURIComponent(email)}&type=${type}`);
  },

  getUserVerificationStatus: async (): Promise<{ 
    success: boolean; 
    data?: { 
      pendingVerifications: Array<{ verification_type: string; email: string; expires_at: number }>;
      emailChangeRequest?: {
        id: string;
        user_id: string;
        old_email: string;
        new_email: string;
        status: string;
        expires_at: number;
      } | null;
    };
    message?: string;
  }> => {
    return apiClient.get<{ 
      success: boolean; 
      data?: { 
        pendingVerifications: Array<{ verification_type: string; email: string; expires_at: number }>;
        emailChangeRequest?: {
          id: string;
          user_id: string;
          old_email: string;
          new_email: string;
          status: string;
          expires_at: number;
        } | null;
      };
      message?: string;
    }>('/auth/user-verification-status');
  },

  requestEmailChange: async (data: EmailChangeRequest): Promise<{ 
    success: boolean; 
    data?: { requestId: string; maskedEmail: string; expiresIn: number };
    message?: string;
  }> => {
    const { requestEmailChangeSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<EmailChangeRequest>(requestEmailChangeSchema, data);
    return apiClient.post<{ 
      success: boolean; 
      data?: { requestId: string; maskedEmail: string; expiresIn: number };
      message?: string;
    }>('/auth/request-email-change', payload);
  },

  sendEmailChangeCode: async (data: SendEmailChangeCodeRequest): Promise<{ 
    success: boolean; 
    data?: { maskedEmail: string; expiresIn: number };
    message?: string;
  }> => {
    const { sendEmailChangeCodeSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<SendEmailChangeCodeRequest>(sendEmailChangeCodeSchema, data);
    return apiClient.post<{ 
      success: boolean; 
      data?: { maskedEmail: string; expiresIn: number };
      message?: string;
    }>('/auth/send-email-change-code', payload);
  },

  verifyEmailChangeCode: async (data: VerifyEmailChangeCodeRequest): Promise<{ 
    success: boolean; 
    data?: { completed: boolean; newEmail: string };
    message?: string;
  }> => {
    const { verifyEmailChangeCodeSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<VerifyEmailChangeCodeRequest>(verifyEmailChangeCodeSchema, data);
    return apiClient.post<{ 
      success: boolean; 
      data?: { completed: boolean; newEmail: string };
      message?: string;
    }>('/auth/verify-email-change-code', payload);
  },

  cancelEmailChangeRequest: async (requestId: string): Promise<{ 
    success: boolean; 
    message?: string;
  }> => {
    const { cancelEmailChangeRequestSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<{ requestId: string }>(cancelEmailChangeRequestSchema, { requestId });
    return apiClient.post<{ 
      success: boolean; 
      message?: string;
    }>('/auth/cancel-email-change-request', payload);
  },

};
