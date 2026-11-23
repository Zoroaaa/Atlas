/**
 * 共享请求契约桶文件：re-export 各域 zod schema，并组装 `schemas` 分组对象供后端引用。
 *
 * 契约约束：字段调整同时影响前后端；前端可用 `@codeseek/shared/schemas/*` 单模块引入，
 * 避免把全部契约与 zod 拖进首屏。
 */
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  deleteAccountSchema,
  sendRegistrationCodeSchema,
  verifyCurrentEmailSchema,
  requestEmailChangeSchema,
  verifyEmailChangeCodeSchema,
  sendEmailChangeCodeSchema,
  cancelEmailChangeRequestSchema,
  exchangeOAuthCodeSchema,
} from './auth';
import {
  updateSettingsSchema,
  updateProfileSchema,
  addFavoriteSchema,
  updateSearchHistorySchema,
  batchDeleteSearchHistorySchema,
  updateFavoriteStatusSchema,
  updateSourceConfigSchema,
} from './user';
import { searchSchema } from './search';
import {
  createMajorCategorySchema,
  updateMajorCategorySchema,
  createCategorySchema,
  updateCategorySchema,
  createSourceSchema,
  updateSourceSchema,
  batchUpdateUserConfigsSchema,
} from './sources';
import {
  createTagSchema,
  updateTagSchema,
  updatePostStatusSchema,
  createPostSchema,
  updatePostSchema,
  createCommentSchema,
  reportPostSchema,
} from './community';
import { reportErrorSchema, batchSourceStatusSchema } from './system';
import {
  updateUserRoleSchema,
  updateUserStatusSchema,
  handleReportSchema,
  updateDataRecordStatusSchema,
} from './admin';
import { importConfigSchema, recordAnalyticsEventSchema, updateConfigSchema, testEmailSchema } from './config';
import { createAnnouncementSchema, updateAnnouncementSchema } from './announcement';
import { createFeedbackSchema, updateFeedbackSchema } from './feedback';
import { relatedSchema } from './recommend';

export * from './auth';
export * from './user';
export * from './search';
export * from './sources';
export * from './community';
export * from './system';
export * from './admin';
export * from './config';
export * from './announcement';
export * from './feedback';
export * from './recommend';

// ── 分组对象 ─────────────────────────────

/** 后端统一引用的 schema 分组；键名即路由校验处的调用路径。 */
export const schemas = {
  auth: {
    login: loginSchema,
    register: registerSchema,
    forgotPassword: forgotPasswordSchema,
    resetPassword: resetPasswordSchema,
    changePassword: changePasswordSchema,
    deleteAccount: deleteAccountSchema,
    sendRegistrationCode: sendRegistrationCodeSchema,
    verifyCurrentEmail: verifyCurrentEmailSchema,
    requestEmailChange: requestEmailChangeSchema,
    verifyEmailChangeCode: verifyEmailChangeCodeSchema,
    sendEmailChangeCode: sendEmailChangeCodeSchema,
    cancelEmailChangeRequest: cancelEmailChangeRequestSchema,
    exchangeOAuthCode: exchangeOAuthCodeSchema,
  },

  user: {
    updateSettings: updateSettingsSchema,
    updateProfile: updateProfileSchema,
    addFavorite: addFavoriteSchema,
    updateSearchHistory: updateSearchHistorySchema,
    batchDeleteSearchHistory: batchDeleteSearchHistorySchema,
    updateFavoriteStatus: updateFavoriteStatusSchema,
    updateSourceConfig: updateSourceConfigSchema,
  },

  search: {
    search: searchSchema,
  },

  sources: {
    createMajorCategory: createMajorCategorySchema,
    updateMajorCategory: updateMajorCategorySchema,
    createCategory: createCategorySchema,
    updateCategory: updateCategorySchema,
    createSource: createSourceSchema,
    updateSource: updateSourceSchema,
    batchUpdateUserConfigs: batchUpdateUserConfigsSchema,
  },

  community: {
    createTag: createTagSchema,
    updateTag: updateTagSchema,
    updatePostStatus: updatePostStatusSchema,
    createPost: createPostSchema,
    updatePost: updatePostSchema,
    createComment: createCommentSchema,
    reportPost: reportPostSchema,
  },

  system: {
    reportError: reportErrorSchema,
    batchSourceStatus: batchSourceStatusSchema,
  },

  admin: {
    updateUserRole: updateUserRoleSchema,
    updateUserStatus: updateUserStatusSchema,
    handleReport: handleReportSchema,
    updateDataRecordStatus: updateDataRecordStatusSchema,
  },

  config: {
    importConfig: importConfigSchema,
    recordAnalyticsEvent: recordAnalyticsEventSchema,
    updateConfig: updateConfigSchema,
    testEmail: testEmailSchema,
  },

  announcement: {
    create: createAnnouncementSchema,
    update: updateAnnouncementSchema,
  },

  feedback: {
    create: createFeedbackSchema,
    update: updateFeedbackSchema,
  },

  recommend: {
    related: relatedSchema,
  },
};
