import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { proxyService } from '@/services/proxy';
import { NotificationTemplates } from '@/utils';
import { useUIStore } from './uiStore';
import type { ProxyStatus } from '@/services/proxy';

interface ProxyState {
  isEnabled: boolean;
  status: ProxyStatus;
  isLoading: boolean;
  lastHealthCheck: number | null;
  isHealthy: boolean | null;
  
  setEnabled: (enabled: boolean) => void;
  setStatus: (status: ProxyStatus) => void;
  setLoading: (loading: boolean) => void;
  toggleProxy: () => Promise<void>;
  initializeProxy: () => Promise<void>;
  refreshStatus: () => void;
}

export const useProxyStore = create<ProxyState>()(
  persist(
    (set, get) => ({
      isEnabled: false,
      status: 'disabled',
      isLoading: false,
      lastHealthCheck: null,
      isHealthy: null,
      
      setEnabled: (isEnabled) => set({ isEnabled }),
      setStatus: (status) => set({ status }),
      setLoading: (isLoading) => set({ isLoading }),
      
      toggleProxy: async () => {
        const { isLoading } = get();
        if (isLoading) return;
        
        set({ isLoading: true, status: 'checking' });
        
        try {
          const result = await proxyService.toggleProxy();
          
          if (result.success) {
            const proxyStatus = proxyService.getProxyStatus();
            set({
              isEnabled: proxyStatus.enabled,
              status: proxyStatus.status,
              lastHealthCheck: proxyStatus.lastHealthCheck,
              isHealthy: proxyStatus.isHealthy,
            });
            
            const template = proxyStatus.enabled 
              ? NotificationTemplates.proxy.enabled()
              : NotificationTemplates.proxy.disabled();
            useUIStore.getState().addToast({
              type: template.type,
              title: template.title,
              message: template.message,
            });
          } else {
            set({ status: 'error' });
            const template = NotificationTemplates.proxy.toggleFailed();
            useUIStore.getState().addToast({
              type: template.type,
              title: template.title,
              message: template.message,
            });
          }
        } catch (error) {
          console.error('Toggle proxy failed:', error);
          set({ status: 'error' });
          const template = NotificationTemplates.proxy.toggleFailed();
          useUIStore.getState().addToast({
            type: template.type,
            title: template.title,
            message: template.message,
          });
        } finally {
          set({ isLoading: false });
        }
      },
      
      initializeProxy: async () => {
        try {
          await proxyService.init();
          const proxyStatus = proxyService.getProxyStatus();
          set({
            isEnabled: proxyStatus.enabled,
            status: proxyStatus.status,
            lastHealthCheck: proxyStatus.lastHealthCheck,
            isHealthy: proxyStatus.isHealthy,
          });
        } catch (error) {
          console.error('Initialize proxy failed:', error);
        }
      },
      
      refreshStatus: () => {
        const proxyStatus = proxyService.getProxyStatus();
        set({
          isEnabled: proxyStatus.enabled,
          status: proxyStatus.status,
          lastHealthCheck: proxyStatus.lastHealthCheck,
          isHealthy: proxyStatus.isHealthy,
        });
      },
    }),
    {
      name: 'proxy-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isEnabled: state.isEnabled,
      }),
    }
  )
);

if (typeof window !== 'undefined') {
  document.addEventListener('proxyStatusChanged', () => {
    useProxyStore.getState().refreshStatus();
  });
}
