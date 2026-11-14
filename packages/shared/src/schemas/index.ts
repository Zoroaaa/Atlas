/**
 * 共享请求契约入口
 *
 * - 后端通过 `schemas` 分组对象引用，与既有的 `schemas.xxx.yyy` 用法保持一致
 * - 前端可只引入实际用到的子模块（如 `@codeseek/shared/schemas/auth`），
 *   避免把全部契约与 zod 拖进首屏
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
} from './auth';
import {
  updateSettingsSchema,
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
import { importConfigSchema, recordAnalyticsEventSchema, updateConfigSchema } from './config';
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
  },

  user: {
    updateSettings: updateSettingsSchema,
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
