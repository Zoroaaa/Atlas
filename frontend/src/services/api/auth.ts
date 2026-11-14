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

export const authApi = {
  loginWithGitHub: (): void => {
    void openOAuthUrl(buildOAuthUrl('/auth/github'));
  },

  loginWithGoogle: (): void => {
    void openOAuthUrl(buildOAuthUrl('/auth/google'));
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const { loginSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<LoginRequest>(loginSchema, data);
    const response = await apiClient.post<AuthResponse>('/auth/login', payload);
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
      useAuthStore.getState().logout();
    }
  },

  getCurrentUser: async (): Promise<{ success: boolean; data: User }> => {
    return apiClient.get<{ success: boolean; data: User }>('/auth/me');
  },

  verifyToken: async (token?: string): Promise<{ success: boolean; data: TokenVerifyResponse }> => {
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

  sendRegistrationCode: async (email: string): Promise<{ 
    success: boolean; 
    data?: { maskedEmail: string; expiresIn: number };
    message?: string;
  }> => {
    const { sendRegistrationCodeSchema } = await import('@codeseek/shared/schemas/auth');
    const payload = await parseRequest<{ email: string }>(sendRegistrationCodeSchema, { email });
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
