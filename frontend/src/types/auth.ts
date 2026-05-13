// API 契约类型 - 从共享包导入
export type {
  User,
  UserSettings,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  DeleteAccountRequest,
  SendVerificationCodeRequest,
  VerificationStatusResponse,
  TokenVerifyResponse,
  UserLoginLog,
  EmailChangeRequest,
  SendEmailChangeCodeRequest,
  VerifyEmailChangeCodeRequest,
} from '@codeseek/shared';

// 前端专属类型
export { DEFAULT_USER_SETTINGS } from '@codeseek/shared';

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  permissions: string[];
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: number;
  lastLogin: number | null;
  loginCount: number;
  recentLogins?: number;
  recentSearches?: number;
}

export interface AdminUserDetail {
  id: string;
  username: string;
  email: string;
  permissions: string[];
  role: string;
  roleDisplayName: string;
  rolePermissions: string[];
  isActive: boolean;
  emailVerified: boolean;
  createdAt: number;
  lastLogin: number | null;
  loginCount: number;
  stats: {
    favoritesCount: number;
    historyCount: number;
    activeSessions: number;
    totalLoginCount: number;
    totalSearchCount: number;
  };
  recentSessions: Array<{
    id: string;
    ip_address: string | null;
    user_agent: string | null;
    created_at: number;
    last_activity: number;
    expires_at: number;
  }>;
  recentActions: Array<{
    action: string;
    created_at: number;
  }>;
}