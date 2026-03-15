import { create } from 'zustand';
import type { Toast, ToastOptions, ToastPosition, ToastConfig } from '@/types';
import { DEFAULT_TOAST_CONFIG } from '@/types';

interface UIState {
  toasts: Toast[];
  toastConfig: ToastConfig;
  toastPosition: ToastPosition;
  isModalOpen: boolean;
  modalContent: React.ReactNode | null;
  isSidebarOpen: boolean;
  
  addToast: (options: ToastOptions) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  setToastExiting: (id: string, isExiting: boolean) => void;
  setToastConfig: (config: Partial<ToastConfig>) => void;
  setToastPosition: (position: ToastPosition) => void;
  openModal: (content: React.ReactNode) => void;
  closeModal: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const generateId = () => `toast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearToastTimer = (id: string) => {
  const timer = toastTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    toastTimers.delete(id);
  }
};

export const useUIStore = create<UIState>((set, get) => ({
  toasts: [],
  toastConfig: DEFAULT_TOAST_CONFIG,
  toastPosition: DEFAULT_TOAST_CONFIG.defaultPosition,
  isModalOpen: false,
  modalContent: null,
  isSidebarOpen: false,
  
  addToast: (options) => {
    const id = generateId();
    const { toastConfig, toasts } = get();
    const { maxToasts } = toastConfig;
    
    const toast: Toast = {
      id,
      type: options.type ?? 'info',
      title: options.title,
      message: options.message,
      duration: options.duration ?? toastConfig.defaultDuration,
      showProgress: options.showProgress ?? toastConfig.defaultShowProgress,
      showCloseButton: options.showCloseButton ?? toastConfig.defaultShowCloseButton,
      onClick: options.onClick,
      onClose: options.onClose,
      isExiting: false,
      createdAt: Date.now(),
    };
    
    let newToasts: Toast[];
    if (toasts.length >= maxToasts) {
      const oldestToast = toasts[0];
      if (oldestToast) {
        clearToastTimer(oldestToast.id);
      }
      newToasts = [...toasts.slice(1), toast];
    } else {
      newToasts = [...toasts, toast];
    }
    
    set({ toasts: newToasts });
    
    if (toast.duration > 0) {
      const timer = setTimeout(() => {
        get().setToastExiting(id, true);
        setTimeout(() => {
          get().removeToast(id);
        }, 300);
      }, toast.duration);
      toastTimers.set(id, timer);
    }
    
    return id;
  },
  
  removeToast: (id) => {
    clearToastTimer(id);
    const toast = get().toasts.find(t => t.id === id);
    if (toast?.onClose) {
      toast.onClose();
    }
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }));
  },
  
  clearToasts: () => {
    get().toasts.forEach(toast => clearToastTimer(toast.id));
    set({ toasts: [] });
  },
  
  setToastExiting: (id, isExiting) => {
    set((state) => ({
      toasts: state.toasts.map(t => 
        t.id === id ? { ...t, isExiting } : t
      )
    }));
  },
  
  setToastConfig: (config) => {
    set((state) => ({
      toastConfig: { ...state.toastConfig, ...config }
    }));
  },
  
  setToastPosition: (position) => {
    set({ toastPosition: position });
  },
  
  openModal: (modalContent) => set({
    isModalOpen: true,
    modalContent
  }),
  
  closeModal: () => set({
    isModalOpen: false,
    modalContent: null
  }),
  
  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
  
  toggleSidebar: () => set((state) => ({
    isSidebarOpen: !state.isSidebarOpen
  }))
}));
