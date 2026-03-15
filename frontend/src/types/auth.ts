export interface User {
  id: string;
  username: string;
  email: string;
  permissions: string[];
  settings: UserSettings;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: number;
  lastLogin: number | null;
  loginCount: number;
  role: string;
  roleDisplayName: string;
}

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

export interface AdminUser extends User {
  recentLogins?: number;
  recentSearches?: number;
}

export interface AdminUserDetail extends User {
  rolePermissions: string[];
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

export interface UserSettings {
  language: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  language: 'zh-CN',
};

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  verificationCode?: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data?: {
    user: User;
    token: string;
  };
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  verificationCode: string;
  code?: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  verificationCode?: string;
}

export interface DeleteAccountRequest {
  verificationCode: string;
  confirmText: string;
  password?: string;
}

export interface SendVerificationCodeRequest {
  email: string;
  verificationType: 'registration' | 'password_reset' | 'email_change_old' | 'email_change_new' | 'account_delete';
  force?: boolean;
}

export interface VerificationStatusResponse {
  hasPendingCode: boolean;
  hasPendingVerification: boolean;
  canResend: boolean;
  remainingTime: number;
}

export interface EmailChangeRequest {
  newEmail: string;
  currentPassword: string;
}

export interface SendEmailChangeCodeRequest {
  requestId: string;
  emailType: 'old' | 'new';
}

export interface VerifyEmailChangeCodeRequest {
  requestId: string;
  emailType: 'old' | 'new';
  code: string;
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
