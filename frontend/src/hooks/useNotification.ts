import { useRef } from 'react';
import { useUIStore } from '@/stores';
import type { ToastOptions, ToastType, ToastPosition } from '@/types';
import { NotificationTemplates } from '@/utils';

type ShowToastOptions = Omit<ToastOptions, 'type' | 'title'>;

interface NotificationActions {
  show: (options: ToastOptions) => string;
  success: (title: string, message?: string, options?: ShowToastOptions) => string;
  error: (title: string, message?: string, options?: ShowToastOptions) => string;
  warning: (title: string, message?: string, options?: ShowToastOptions) => string;
  info: (title: string, message?: string, options?: ShowToastOptions) => string;
  remove: (id: string) => void;
  clear: () => void;
  setConfig: (config: Partial<{ maxToasts: number; defaultDuration: number; defaultPosition: ToastPosition; defaultShowProgress: boolean; defaultShowCloseButton: boolean }>) => void;
  setPosition: (position: ToastPosition) => void;
  getPosition: () => ToastPosition;
  fromTemplate: (template: { type: ToastType; title: string; message?: string; duration?: number }, overrides?: ShowToastOptions) => string;
  auth: {
    loginSuccess: (username: string) => string;
    loginFailed: (reason?: string) => string;
    logoutSuccess: () => string;
    registerSuccess: () => string;
    registerFailed: (reason?: string) => string;
    emailCodeSent: () => string;
    emailCodeResent: () => string;
    emailCodeFailed: (reason?: string) => string;
    passwordResetSuccess: () => string;
    passwordResetFailed: (reason?: string) => string;
    passwordChangeSuccess: () => string;
    passwordChangeFailed: (reason?: string) => string;
    profileUpdateSuccess: () => string;
    profileUpdateFailed: (reason?: string) => string;
    accountDeleted: () => string;
  };
  proxy: {
    enabled: () => string;
    disabled: () => string;
    toggleFailed: (reason?: string) => string;
    healthCheckFailed: () => string;
  };
  favorite: {
    added: () => string;
    removed: () => string;
    addFailed: (reason?: string) => string;
    removeFailed: (reason?: string) => string;
    syncSuccess: (count: number) => string;
    syncFailed: (reason?: string) => string;
    loadFailed: () => string;
  };
  source: {
    created: (name?: string) => string;
    updated: () => string;
    deleted: () => string;
    createFailed: (reason?: string) => string;
    updateFailed: (reason?: string) => string;
    deleteFailed: (reason?: string) => string;
    loadFailed: () => string;
    enabled: (name?: string) => string;
    disabled: (name?: string) => string;
    batchEnabled: (count: number) => string;
    batchDisabled: (count: number) => string;
    exported: () => string;
    exportFailed: () => string;
    imported: (count: number) => string;
    importFailed: (reason?: string) => string;
    testSuccess: (name: string, reason?: string) => string;
    testFailed: (name: string, reason?: string) => string;
  };
  category: {
    created: () => string;
    updated: () => string;
    deleted: () => string;
    createFailed: (reason?: string) => string;
    updateFailed: (reason?: string) => string;
    deleteFailed: (reason?: string) => string;
    loadFailed: () => string;
  };
  search: {
    noKeyword: () => string;
    noResults: () => string;
    searchFailed: (reason?: string) => string;
    historyCleared: () => string;
    exportSuccess: () => string;
  };
  community: {
    shared: () => string;
    shareFailed: (reason?: string) => string;
    liked: (isLiked: boolean) => string;
    likeFailed: () => string;
    imported: () => string;
    importFailed: (reason?: string) => string;
    tagCreated: () => string;
    tagCreateFailed: () => string;
    loadFailed: () => string;
  };
  settings: {
    saved: () => string;
    saveFailed: (reason?: string) => string;
    emailChangeCodeSent: () => string;
    emailChangeSuccess: () => string;
    emailChangeFailed: (reason?: string) => string;
  };
  admin: {
    userStatusChanged: (enabled: boolean) => string;
    userStatusChangeFailed: () => string;
    userRoleChanged: () => string;
    userRoleChangeFailed: () => string;
    loadFailed: (resource: string) => string;
  };
  common: {
    validationError: (field?: string) => string;
    networkError: () => string;
    unknownError: () => string;
    comingSoon: (feature?: string) => string;
    loginRequired: () => string;
  };
}

export function useNotification(): NotificationActions {
  const { addToast, removeToast, clearToasts, setToastConfig, setToastPosition, toastPosition } = useUIStore();

  const notificationRef = useRef<NotificationActions | null>(null);

  if (!notificationRef.current) {
    const fromTemplate = (template: { type: ToastType; title: string; message?: string; duration?: number }, overrides?: ShowToastOptions): string =>
      addToast({ type: template.type, title: template.title, message: template.message, duration: template.duration, ...overrides } as ToastOptions);

    notificationRef.current = {
      show: (options: ToastOptions): string => addToast(options),
      success: (title: string, message?: string, options?: ShowToastOptions): string =>
        addToast({ type: 'success', title, message, ...options }),
      error: (title: string, message?: string, options?: ShowToastOptions): string =>
        addToast({ type: 'error', title, message, ...options }),
      warning: (title: string, message?: string, options?: ShowToastOptions): string =>
        addToast({ type: 'warning', title, message, ...options }),
      info: (title: string, message?: string, options?: ShowToastOptions): string =>
        addToast({ type: 'info', title, message, ...options }),
      remove: (id: string) => removeToast(id),
      clear: () => clearToasts(),
      setConfig: setToastConfig,
      setPosition: setToastPosition,
      getPosition: () => toastPosition,
      fromTemplate,
      auth: {
        loginSuccess: (username: string) => fromTemplate(NotificationTemplates.auth.loginSuccess(username)),
        loginFailed: (reason?: string) => fromTemplate(NotificationTemplates.auth.loginFailed(reason)),
        logoutSuccess: () => fromTemplate(NotificationTemplates.auth.logoutSuccess()),
        registerSuccess: () => fromTemplate(NotificationTemplates.auth.registerSuccess()),
        registerFailed: (reason?: string) => fromTemplate(NotificationTemplates.auth.registerFailed(reason)),
        emailCodeSent: () => fromTemplate(NotificationTemplates.auth.emailCodeSent()),
        emailCodeResent: () => fromTemplate(NotificationTemplates.auth.emailCodeResent()),
        emailCodeFailed: (reason?: string) => fromTemplate(NotificationTemplates.auth.emailCodeFailed(reason)),
        passwordResetSuccess: () => fromTemplate(NotificationTemplates.auth.passwordResetSuccess()),
        passwordResetFailed: (reason?: string) => fromTemplate(NotificationTemplates.auth.passwordResetFailed(reason)),
        passwordChangeSuccess: () => fromTemplate(NotificationTemplates.auth.passwordChangeSuccess()),
        passwordChangeFailed: (reason?: string) => fromTemplate(NotificationTemplates.auth.passwordChangeFailed(reason)),
        profileUpdateSuccess: () => fromTemplate(NotificationTemplates.auth.profileUpdateSuccess()),
        profileUpdateFailed: (reason?: string) => fromTemplate(NotificationTemplates.auth.profileUpdateFailed(reason)),
        accountDeleted: () => fromTemplate(NotificationTemplates.auth.accountDeleted()),
      },
      proxy: {
        enabled: () => fromTemplate(NotificationTemplates.proxy.enabled()),
        disabled: () => fromTemplate(NotificationTemplates.proxy.disabled()),
        toggleFailed: (reason?: string) => fromTemplate(NotificationTemplates.proxy.toggleFailed(reason)),
        healthCheckFailed: () => fromTemplate(NotificationTemplates.proxy.healthCheckFailed()),
      },
      favorite: {
        added: () => fromTemplate(NotificationTemplates.favorite.added()),
        removed: () => fromTemplate(NotificationTemplates.favorite.removed()),
        addFailed: (reason?: string) => fromTemplate(NotificationTemplates.favorite.addFailed(reason)),
        removeFailed: (reason?: string) => fromTemplate(NotificationTemplates.favorite.removeFailed(reason)),
        syncSuccess: (count: number) => fromTemplate(NotificationTemplates.favorite.syncSuccess(count)),
        syncFailed: (reason?: string) => fromTemplate(NotificationTemplates.favorite.syncFailed(reason)),
        loadFailed: () => fromTemplate(NotificationTemplates.favorite.loadFailed()),
      },
      source: {
        created: (name?: string) => fromTemplate(NotificationTemplates.source.created(name)),
        updated: () => fromTemplate(NotificationTemplates.source.updated()),
        deleted: () => fromTemplate(NotificationTemplates.source.deleted()),
        createFailed: (reason?: string) => fromTemplate(NotificationTemplates.source.createFailed(reason)),
        updateFailed: (reason?: string) => fromTemplate(NotificationTemplates.source.updateFailed(reason)),
        deleteFailed: (reason?: string) => fromTemplate(NotificationTemplates.source.deleteFailed(reason)),
        loadFailed: () => fromTemplate(NotificationTemplates.source.loadFailed()),
        enabled: (name?: string) => fromTemplate(NotificationTemplates.source.enabled(name)),
        disabled: (name?: string) => fromTemplate(NotificationTemplates.source.disabled(name)),
        batchEnabled: (count: number) => fromTemplate(NotificationTemplates.source.batchEnabled(count)),
        batchDisabled: (count: number) => fromTemplate(NotificationTemplates.source.batchDisabled(count)),
        exported: () => fromTemplate(NotificationTemplates.source.exported()),
        exportFailed: () => fromTemplate(NotificationTemplates.source.exportFailed()),
        imported: (count: number) => fromTemplate(NotificationTemplates.source.imported(count)),
        importFailed: (reason?: string) => fromTemplate(NotificationTemplates.source.importFailed(reason)),
        testSuccess: (name: string, reason?: string) => fromTemplate(NotificationTemplates.source.testSuccess(name, reason)),
        testFailed: (name: string, reason?: string) => fromTemplate(NotificationTemplates.source.testFailed(name, reason)),
      },
      category: {
        created: () => fromTemplate(NotificationTemplates.category.created()),
        updated: () => fromTemplate(NotificationTemplates.category.updated()),
        deleted: () => fromTemplate(NotificationTemplates.category.deleted()),
        createFailed: (reason?: string) => fromTemplate(NotificationTemplates.category.createFailed(reason)),
        updateFailed: (reason?: string) => fromTemplate(NotificationTemplates.category.updateFailed(reason)),
        deleteFailed: (reason?: string) => fromTemplate(NotificationTemplates.category.deleteFailed(reason)),
        loadFailed: () => fromTemplate(NotificationTemplates.category.loadFailed()),
      },
      search: {
        noKeyword: () => fromTemplate(NotificationTemplates.search.noKeyword()),
        noResults: () => fromTemplate(NotificationTemplates.search.noResults()),
        searchFailed: (reason?: string) => fromTemplate(NotificationTemplates.search.searchFailed(reason)),
        historyCleared: () => fromTemplate(NotificationTemplates.search.historyCleared()),
        exportSuccess: () => fromTemplate(NotificationTemplates.search.exportSuccess()),
      },
      community: {
        shared: () => fromTemplate(NotificationTemplates.community.shared()),
        shareFailed: (reason?: string) => fromTemplate(NotificationTemplates.community.shareFailed(reason)),
        liked: (isLiked: boolean) => fromTemplate(NotificationTemplates.community.liked(isLiked)),
        likeFailed: () => fromTemplate(NotificationTemplates.community.likeFailed()),
        imported: () => fromTemplate(NotificationTemplates.community.imported()),
        importFailed: (reason?: string) => fromTemplate(NotificationTemplates.community.importFailed(reason)),
        tagCreated: () => fromTemplate(NotificationTemplates.community.tagCreated()),
        tagCreateFailed: () => fromTemplate(NotificationTemplates.community.tagCreateFailed()),
        loadFailed: () => fromTemplate(NotificationTemplates.community.loadFailed()),
      },
      settings: {
        saved: () => fromTemplate(NotificationTemplates.settings.saved()),
        saveFailed: (reason?: string) => fromTemplate(NotificationTemplates.settings.saveFailed(reason)),
        emailChangeCodeSent: () => fromTemplate(NotificationTemplates.settings.emailChangeCodeSent()),
        emailChangeSuccess: () => fromTemplate(NotificationTemplates.settings.emailChangeSuccess()),
        emailChangeFailed: (reason?: string) => fromTemplate(NotificationTemplates.settings.emailChangeFailed(reason)),
      },
      admin: {
        userStatusChanged: (enabled: boolean) => fromTemplate(NotificationTemplates.admin.userStatusChanged(enabled)),
        userStatusChangeFailed: () => fromTemplate(NotificationTemplates.admin.userStatusChangeFailed()),
        userRoleChanged: () => fromTemplate(NotificationTemplates.admin.userRoleChanged()),
        userRoleChangeFailed: () => fromTemplate(NotificationTemplates.admin.userRoleChangeFailed()),
        loadFailed: (resource: string) => fromTemplate(NotificationTemplates.admin.loadFailed(resource)),
      },
      common: {
        validationError: (field?: string) => fromTemplate(NotificationTemplates.common.validationError(field || '')),
        networkError: () => fromTemplate(NotificationTemplates.common.networkError()),
        unknownError: () => fromTemplate(NotificationTemplates.common.unknownError()),
        comingSoon: (feature?: string) => fromTemplate(NotificationTemplates.common.comingSoon(feature)),
        loginRequired: () => fromTemplate(NotificationTemplates.common.loginRequired()),
      },
    };
  }

  return notificationRef.current;
}

export { useNotification as useToast };
