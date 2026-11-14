export interface User {
  id: string;
  username: string;
  email: string;
  settings: UserSettings;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: number;
  lastLogin: number | null;
  loginCount: number;
  role: string;
  roleDisplayName: string;
}

export interface UserSettings {
  language: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  language: 'zh-CN',
};

// 请求契约类型统一由 zod schema 推导，避免 schema 与类型两套定义
export type {
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  DeleteAccountRequest,
  SendRegistrationCodeRequest,
  VerifyCurrentEmailRequest,
  EmailChangeRequest,
  SendEmailChangeCodeRequest,
  VerifyEmailChangeCodeRequest,
  CancelEmailChangeRequest,
} from '../schemas/auth';

// smart-send-code 仅后端内部使用，没有前端调用方，schema 留在后端，类型仍手写
export interface SendVerificationCodeRequest {
  email: string;
  verificationType: 'registration' | 'password_reset' | 'email_change_old' | 'email_change_new' | 'account_delete';
  force?: boolean;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data?: {
    user: User;
    token: string;
  };
}

export interface VerificationStatusResponse {
  hasPendingCode: boolean;
  hasPendingVerification: boolean;
  canResend: boolean;
  remainingTime: number;
}

export interface TokenVerifyResponse {
  valid: boolean;
  userId: string;
  username: string;
}

export interface UserLoginLog {
  id: string;
  loginTime: number;
  ipAddress: string | null;
  userAgent: string | null;
  loginStatus: 'success' | 'failed';
  loginMethod: string;
  failureReason: string | null;
}