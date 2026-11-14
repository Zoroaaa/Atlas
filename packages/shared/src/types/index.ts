export type { User, UserSettings, LoginRequest, RegisterRequest, AuthResponse,
  ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest,
  DeleteAccountRequest, SendVerificationCodeRequest, VerificationStatusResponse,
  TokenVerifyResponse, UserLoginLog, EmailChangeRequest,
  SendEmailChangeCodeRequest, VerifyEmailChangeCodeRequest,
  SendRegistrationCodeRequest, VerifyCurrentEmailRequest, CancelEmailChangeRequest } from './auth';
export { DEFAULT_USER_SETTINGS } from './auth';

export type { SearchHistoryItem, FavoriteItem, SearchResult,
  SearchRequest, SearchResponse, SearchSuggestion, TrendingSearch,
  AddFavoriteRequest, SaveSearchHistoryRequest, SearchStats } from './search';

export type { SourceStatus, SiteType, SearchSource, Category,
  MajorCategory, SourceCheckResult, UserSourceConfig, SourceStats,
  CreateMajorCategoryRequest, UpdateMajorCategoryRequest,
  CreateCategoryRequest, UpdateCategoryRequest,
  CreateSourceRequest, UpdateSourceRequest,
  UpdateUserSourceConfigRequest, BatchUpdateUserSourceConfigRequest } from './source';

export type { PostStatus, PostType, LikeType,
  CommunityPost, CommunityTag, CommunityComment,
  CreatePostRequest, UpdatePostRequest, CreateCommentRequest,
  CreateTagRequest, UpdateTagRequest, ReportRequest,
  CommunityUserStats } from './community';

export type { ApiError, ApiSuccess, ApiResponse,
  PaginatedResponse, PaginationParams } from './common';

export type { DataRecordType, DataRecordStatus, DataSourceType,
  DataRecordSource, DataRecord, DataRecordDetail,
  DataStorageStats, DataStorageTrends, DataRecordsQuery,
  JavDetailFieldName, JavDetailStatus, JavDetailStats,
  JavDetailJob, JavDetailFailure, JavDetailJobView } from './data-storage';

// ── 由 zod schema 推导的请求契约类型 ──
export type {
  UpdateSettingsRequest,
  UpdateSearchHistoryRequest,
  BatchDeleteSearchHistoryRequest,
  UpdateFavoriteStatusRequest,
} from '../schemas/user';
export type { ReportErrorRequest, BatchSourceStatusRequest } from '../schemas/system';
export type {
  UpdateUserRoleRequest,
  UpdateUserStatusRequest,
  HandleReportRequest,
  UpdateDataRecordStatusRequest,
} from '../schemas/admin';
export type { ConfigImportRequest, AnalyticsEvent, UpdateConfigRequest } from '../schemas/config';
export type { AnnouncementCreateRequest, AnnouncementUpdateRequest } from '../schemas/announcement';
export type { FeedbackCreateRequest, FeedbackUpdateRequest } from '../schemas/feedback';
export type { JavRelatedRequest } from '../schemas/recommend';
