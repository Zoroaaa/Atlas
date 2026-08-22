import i18next from '@/i18n';
import type { ToastType } from '@/types';

export interface NotificationTemplate {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

/**
 * 集中式 Toast 通知模板
 *
 * 设计：所有字符串走 i18next.t()，响应语言切换；
 *   - 后端返回的 reason 字符串原样透传（不翻译，遵循"仅前端报错"约定）；
 *   - 函数签名保持不变，调用方零改动。
 */
export const NotificationTemplates = {
  auth: {
    loginSuccess: (username: string): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:auth.loginSuccessTitle'),
      message: i18next.t('notifications:auth.loginSuccessMessage', { username }),
    }),
    loginFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:auth.loginFailedTitle'),
      message: reason || i18next.t('notifications:auth.loginFailedDefault'),
    }),
    logoutSuccess: (): NotificationTemplate => ({
      type: 'info',
      title: i18next.t('notifications:auth.logoutSuccessTitle'),
      message: i18next.t('notifications:auth.logoutSuccessMessage'),
    }),
    registerSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:auth.registerSuccessTitle'),
      message: i18next.t('notifications:auth.registerSuccessMessage'),
    }),
    registerFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:auth.registerFailedTitle'),
      message: reason || i18next.t('notifications:auth.registerFailedDefault'),
    }),
    emailCodeSent: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:auth.emailCodeSentTitle'),
      message: i18next.t('notifications:auth.emailCodeSentMessage'),
    }),
    emailCodeResent: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:auth.emailCodeResentTitle'),
    }),
    emailCodeFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:auth.emailCodeFailedTitle'),
      message: reason || i18next.t('notifications:auth.emailCodeFailedDefault'),
    }),
    passwordResetSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:auth.passwordResetSuccessTitle'),
      message: i18next.t('notifications:auth.passwordResetSuccessMessage'),
    }),
    passwordResetFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:auth.passwordResetFailedTitle'),
      message: reason || i18next.t('notifications:auth.passwordResetFailedDefault'),
    }),
    passwordChangeSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:auth.passwordChangeSuccessTitle'),
      message: i18next.t('notifications:auth.passwordChangeSuccessMessage'),
    }),
    passwordChangeFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:auth.passwordChangeFailedTitle'),
      message: reason || i18next.t('notifications:auth.passwordChangeFailedDefault'),
    }),
    profileUpdateSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:auth.profileUpdateSuccessTitle'),
      message: i18next.t('notifications:auth.profileUpdateSuccessMessage'),
    }),
    profileUpdateFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:auth.profileUpdateFailedTitle'),
      message: reason || i18next.t('notifications:auth.profileUpdateFailedDefault'),
    }),
    accountDeleted: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:auth.accountDeletedTitle'),
      message: i18next.t('notifications:auth.accountDeletedMessage'),
    }),
  },

  proxy: {
    enabled: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:proxy.enabledTitle'),
      message: i18next.t('notifications:proxy.enabledMessage'),
    }),
    disabled: (): NotificationTemplate => ({
      type: 'info',
      title: i18next.t('notifications:proxy.disabledTitle'),
      message: i18next.t('notifications:proxy.disabledMessage'),
    }),
    toggleFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:proxy.toggleFailedTitle'),
      message: reason || i18next.t('notifications:proxy.toggleFailedDefault'),
    }),
    healthCheckFailed: (): NotificationTemplate => ({
      type: 'warning',
      title: i18next.t('notifications:proxy.healthCheckFailedTitle'),
      message: i18next.t('notifications:proxy.healthCheckFailedMessage'),
    }),
  },

  favorite: {
    added: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:favorite.addedTitle'),
    }),
    removed: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:favorite.removedTitle'),
    }),
    addFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:favorite.addFailedTitle'),
      message: reason || i18next.t('notifications:favorite.addFailedDefault'),
    }),
    removeFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:favorite.removeFailedTitle'),
      message: reason || i18next.t('notifications:favorite.removeFailedDefault'),
    }),
    syncSuccess: (count: number): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:favorite.syncSuccessTitle'),
      message: i18next.t('notifications:favorite.syncSuccessMessage', { count }),
    }),
    syncFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:favorite.syncFailedTitle'),
      message: reason || i18next.t('notifications:favorite.syncFailedDefault'),
    }),
    loadFailed: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:favorite.loadFailedTitle'),
      message: i18next.t('notifications:favorite.loadFailedMessage'),
    }),
  },

  source: {
    created: (name?: string): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:source.createdTitle'),
      message: name ? i18next.t('notifications:source.createdMessage', { name }) : undefined,
    }),
    updated: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:source.updatedTitle'),
    }),
    deleted: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:source.deletedTitle'),
    }),
    createFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:source.createFailedTitle'),
      message: reason || i18next.t('notifications:source.createFailedDefault'),
    }),
    updateFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:source.updateFailedTitle'),
      message: reason || i18next.t('notifications:source.updateFailedDefault'),
    }),
    deleteFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:source.deleteFailedTitle'),
      message: reason || i18next.t('notifications:source.deleteFailedDefault'),
    }),
    loadFailed: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:source.loadFailedTitle'),
      message: i18next.t('notifications:source.loadFailedMessage'),
    }),
    enabled: (name?: string): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:source.enabledTitle'),
      message: name ? i18next.t('notifications:source.enabledMessage', { name }) : undefined,
    }),
    disabled: (name?: string): NotificationTemplate => ({
      type: 'info',
      title: i18next.t('notifications:source.disabledTitle'),
      message: name ? i18next.t('notifications:source.disabledMessage', { name }) : undefined,
    }),
    batchEnabled: (count: number): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:source.batchEnabledTitle'),
      message: i18next.t('notifications:source.batchEnabledMessage', { count }),
    }),
    batchDisabled: (count: number): NotificationTemplate => ({
      type: 'info',
      title: i18next.t('notifications:source.batchDisabledTitle'),
      message: i18next.t('notifications:source.batchDisabledMessage', { count }),
    }),
    exported: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:source.exportedTitle'),
    }),
    exportFailed: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:source.exportFailedTitle'),
      message: i18next.t('notifications:source.exportFailedMessage'),
    }),
    imported: (count: number): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:source.importedTitle'),
      message: i18next.t('notifications:source.importedMessage', { count }),
    }),
    importFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:source.importFailedTitle'),
      message: reason || i18next.t('notifications:source.importFailedDefault'),
    }),
    testSuccess: (name: string, reason?: string): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:source.testSuccessTitle'),
      message: reason || i18next.t('notifications:source.testSuccessDefault', { name }),
    }),
    testFailed: (name: string, reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:source.testFailedTitle'),
      message: reason || i18next.t('notifications:source.testFailedDefault', { name }),
    }),
  },

  category: {
    created: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:category.createdTitle'),
    }),
    updated: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:category.updatedTitle'),
    }),
    deleted: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:category.deletedTitle'),
    }),
    createFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:category.createFailedTitle'),
      message: reason || i18next.t('notifications:category.createFailedDefault'),
    }),
    updateFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:category.updateFailedTitle'),
      message: reason || i18next.t('notifications:category.updateFailedDefault'),
    }),
    deleteFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:category.deleteFailedTitle'),
      message: reason || i18next.t('notifications:category.deleteFailedDefault'),
    }),
    loadFailed: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:category.loadFailedTitle'),
      message: i18next.t('notifications:category.loadFailedMessage'),
    }),
  },

  search: {
    noKeyword: (): NotificationTemplate => ({
      type: 'warning',
      title: i18next.t('notifications:search.noKeywordTitle'),
    }),
    noResults: (): NotificationTemplate => ({
      type: 'info',
      title: i18next.t('notifications:search.noResultsTitle'),
      message: i18next.t('notifications:search.noResultsMessage'),
    }),
    searchFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:search.searchFailedTitle'),
      message: reason || i18next.t('notifications:search.searchFailedDefault'),
    }),
    historyCleared: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:search.historyClearedTitle'),
    }),
    exportSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:search.exportSuccessTitle'),
    }),
  },

  community: {
    shared: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:community.sharedTitle'),
      message: i18next.t('notifications:community.sharedMessage'),
    }),
    shareFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:community.shareFailedTitle'),
      message: reason || i18next.t('notifications:community.shareFailedDefault'),
    }),
    liked: (isLiked: boolean): NotificationTemplate => ({
      type: 'success',
      title: isLiked
        ? i18next.t('notifications:community.likedAddedTitle')
        : i18next.t('notifications:community.likedRemovedTitle'),
    }),
    likeFailed: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:community.likeFailedTitle'),
      message: i18next.t('notifications:community.likeFailedMessage'),
    }),
    imported: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:community.importedTitle'),
      message: i18next.t('notifications:community.importedMessage'),
    }),
    importFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:community.importFailedTitle'),
      message: reason || i18next.t('notifications:community.importFailedDefault'),
    }),
    tagCreated: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:community.tagCreatedTitle'),
    }),
    tagCreateFailed: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:community.tagCreateFailedTitle'),
      message: i18next.t('notifications:community.tagCreateFailedMessage'),
    }),
    loadFailed: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:community.loadFailedTitle'),
      message: i18next.t('notifications:community.loadFailedMessage'),
    }),
  },

  settings: {
    saved: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:settings.savedTitle'),
    }),
    saveFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:settings.saveFailedTitle'),
      message: reason || i18next.t('notifications:settings.saveFailedDefault'),
    }),
    emailChangeCodeSent: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:settings.emailChangeCodeSentTitle'),
    }),
    emailChangeSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:settings.emailChangeSuccessTitle'),
      message: i18next.t('notifications:settings.emailChangeSuccessMessage'),
    }),
    emailChangeFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:settings.emailChangeFailedTitle'),
      message: reason || i18next.t('notifications:settings.emailChangeFailedDefault'),
    }),
  },

  admin: {
    userStatusChanged: (enabled: boolean): NotificationTemplate => ({
      type: 'success',
      title: enabled
        ? i18next.t('notifications:admin.userStatusChangedEnabledTitle')
        : i18next.t('notifications:admin.userStatusChangedDisabledTitle'),
    }),
    userStatusChangeFailed: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:admin.userStatusChangeFailedTitle'),
      message: i18next.t('notifications:admin.userStatusChangeFailedMessage'),
    }),
    userRoleChanged: (): NotificationTemplate => ({
      type: 'success',
      title: i18next.t('notifications:admin.userRoleChangedTitle'),
    }),
    userRoleChangeFailed: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:admin.userRoleChangeFailedTitle'),
      message: i18next.t('notifications:admin.userRoleChangeFailedMessage'),
    }),
    loadFailed: (resource: string): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:admin.loadFailedTitle'),
      message: i18next.t('notifications:admin.loadFailedMessage', { resource }),
    }),
  },

  common: {
    validationError: (field: string): NotificationTemplate => ({
      type: 'warning',
      title: i18next.t('notifications:common.validationErrorTitle'),
      message: field ? i18next.t('notifications:common.validationErrorMessage', { field }) : undefined,
    }),
    networkError: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:common.networkErrorTitle'),
      message: i18next.t('notifications:common.networkErrorMessage'),
    }),
    unknownError: (): NotificationTemplate => ({
      type: 'error',
      title: i18next.t('notifications:common.unknownErrorTitle'),
      message: i18next.t('notifications:common.unknownErrorMessage'),
    }),
    comingSoon: (feature?: string): NotificationTemplate => ({
      type: 'info',
      title: i18next.t('notifications:common.comingSoonTitle'),
      message: feature ? i18next.t('notifications:common.comingSoonMessage', { feature }) : undefined,
    }),
    loginRequired: (): NotificationTemplate => ({
      type: 'warning',
      title: i18next.t('notifications:common.loginRequiredTitle'),
      message: i18next.t('notifications:common.loginRequiredMessage'),
    }),
  },
} as const;

export type NotificationCategory = keyof typeof NotificationTemplates;
export type NotificationAction<C extends NotificationCategory> = keyof typeof NotificationTemplates[C];
