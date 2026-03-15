import { apiClient } from './client';
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

export const authApi = {
  /**
   * 发起 GitHub OAuth 授权
   * 直接跳转到后端 /auth/github，后端重定向到 GitHub
   */
  loginWithGitHub: (): void => {
    const base = import.meta.env.DEV
      ? '/api'
      : 'https://backend.codeseek.pp.ua/api';
    window.location.href = `${base}/auth/github`;
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
    if (response.success && response.data?.token) {
      apiClient.setToken(response.data.token);
    }
    return response;
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/auth/register', data);
  },

  logout: async (): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiClient.post<{ success: boolean; message: string }>('/auth/logout', {});
      return response;
    } finally {
      apiClient.setToken(null);
    }
  },

  getCurrentUser: async (): Promise<{ success: boolean; data: User }> => {
    return apiClient.get<{ success: boolean; data: User }>('/auth/me');
  },

  verifyToken: async (token?: string): Promise<{ success: boolean; data: TokenVerifyResponse }> => {
    if (token) {
      apiClient.setToken(token);
    }
    return apiClient.post<{ success: boolean; data: TokenVerifyResponse }>('/auth/verify-token', {});
  },

  refreshToken: async (): Promise<{ success: boolean; data: { token: string } }> => {
    const response = await apiClient.post<{ success: boolean; data: { token: string } }>('/auth/refresh', {});
    if (response.success && response.data?.token) {
      apiClient.setToken(response.data.token);
    }
    return response;
  },

  forgotPassword: async (data: ForgotPasswordRequest): Promise<{ 
    success: boolean; 
    data?: { maskedEmail: string; expiresIn: number };
    message?: string;
  }> => {
    return apiClient.post<{ 
      success: boolean; 
      data?: { maskedEmail: string; expiresIn: number };
      message?: string;
    }>('/auth/forgot-password', data);
  },

  resetPassword: async (data: ResetPasswordRequest): Promise<{ success: boolean; message: string }> => {
    return apiClient.post<{ success: boolean; message: string }>('/auth/reset-password', data);
  },

  changePassword: async (data: ChangePasswordRequest): Promise<{ success: boolean; message: string }> => {
    return apiClient.put<{ success: boolean; message: string }>('/auth/change-password', data);
  },

  deleteAccount: async (data: DeleteAccountRequest): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiClient.delete<{ success: boolean; message: string }>('/auth/account', data);
      return response;
    } finally {
      apiClient.setToken(null);
    }
  },

  sendRegistrationCode: async (email: string): Promise<{ 
    success: boolean; 
    data?: { maskedEmail: string; expiresIn: number };
    message?: string;
  }> => {
    return apiClient.post<{ 
      success: boolean; 
      data?: { maskedEmail: string; expiresIn: number };
      message?: string;
    }>('/auth/send-registration-code', { email });
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
    return apiClient.post<{ 
      success: boolean; 
      data?: { requestId: string; maskedEmail: string; expiresIn: number };
      message?: string;
    }>('/auth/request-email-change', data);
  },

  sendEmailChangeCode: async (data: SendEmailChangeCodeRequest): Promise<{ 
    success: boolean; 
    data?: { maskedEmail: string; expiresIn: number };
    message?: string;
  }> => {
    return apiClient.post<{ 
      success: boolean; 
      data?: { maskedEmail: string; expiresIn: number };
      message?: string;
    }>('/auth/send-email-change-code', data);
  },

  verifyEmailChangeCode: async (data: VerifyEmailChangeCodeRequest): Promise<{ 
    success: boolean; 
    data?: { completed: boolean; newEmail: string };
    message?: string;
  }> => {
    return apiClient.post<{ 
      success: boolean; 
      data?: { completed: boolean; newEmail: string };
      message?: string;
    }>('/auth/verify-email-change-code', data);
  },

  cancelEmailChangeRequest: async (requestId: string): Promise<{ 
    success: boolean; 
    message?: string;
  }> => {
    return apiClient.post<{ 
      success: boolean; 
      message?: string;
    }>('/auth/cancel-email-change-request', { requestId });
  },

};
