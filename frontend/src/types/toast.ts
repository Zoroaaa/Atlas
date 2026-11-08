import { TOAST_CONFIG } from '@/constants';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';

export interface ToastOptions {
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number;
  showProgress?: boolean;
  showCloseButton?: boolean;
  onClick?: () => void;
  onClose?: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
  showProgress: boolean;
  showCloseButton: boolean;
  onClick?: () => void;
  onClose?: () => void;
  isExiting: boolean;
  createdAt: number;
}

export interface ToastConfig {
  maxToasts: number;
  defaultDuration: number;
  defaultPosition: ToastPosition;
  defaultShowProgress: boolean;
  defaultShowCloseButton: boolean;
}

export const DEFAULT_TOAST_CONFIG: ToastConfig = {
  maxToasts: TOAST_CONFIG.MAX_TOASTS,
  defaultDuration: TOAST_CONFIG.DEFAULT_DURATION,
  defaultPosition: 'top-right',
  defaultShowProgress: true,
  defaultShowCloseButton: true,
};

export const TOAST_ICONS: Record<ToastType, string> = {
  success: 'CheckCircle',
  error: 'AlertCircle',
  warning: 'AlertTriangle',
  info: 'Info',
};

export const TOAST_TITLES: Record<ToastType, string> = {
  success: '成功',
  error: '错误',
  warning: '警告',
  info: '提示',
};
