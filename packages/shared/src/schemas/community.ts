/**
 * 社区请求契约 — 前后端共用同一份 zod schema
 */
import { z } from 'zod';
import { VALIDATION_RULES } from '../validations';

const R = VALIDATION_RULES;

// ──────────────────────────────────────────────
// 社区帖子 contentData 结构校验
// contentData 是前端把整份搜索结果 JSON.stringify 后整体提交的字符串。
// 之前只限制总长度、不校验内容，等价于允许任意大文本入库，
// 且结构与渲染层假设不一致时只能等到渲染报错才发现。
// 这里按 postType 校验渲染层依赖的字段，并把上限收敛到真实数据规模
// （各 provider 返回条数均有上限：anime ≤30/源、movie ≤20、manga/novel ≤20、jav 磁力 ≤30）。
// ──────────────────────────────────────────────
const COMMUNITY_CONTENT_MAX_LENGTH = 128_000;
const COMMUNITY_COVER_MAX_LENGTH = 4_000;

type CommunityContent = Record<string, unknown>;

const isPlainObject = (value: unknown): value is CommunityContent =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 可选字符串字段：缺省/null 放行，出现则必须是长度受限的字符串 */
const checkOptionalString = (data: CommunityContent, key: string, max: number): string | null => {
  const value = data[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return `${key} 必须是字符串`;
  if (value.length > max) return `${key} 最多 ${max} 个字符`;
  return null;
};

/** 必填字符串字段：用于渲染层强依赖的标识（番号/女优名） */
const checkRequiredString = (data: CommunityContent, key: string, max: number): string | null => {
  const value = data[key];
  if (typeof value !== 'string' || value.trim().length === 0) return `缺少 ${key}`;
  if (value.length > max) return `${key} 最多 ${max} 个字符`;
  return null;
};

/** 可选数组字段：缺省/null 放行，出现则必须是长度受限的数组 */
const checkArray = (data: CommunityContent, key: string, max: number): string | null => {
  const value = data[key];
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return `${key} 必须是数组`;
  if (value.length > max) return `${key} 最多 ${max} 项`;
  return null;
};

const firstError = (...errors: (string | null)[]): string | null =>
  errors.find((message): message is string => message !== null) ?? null;

const COMMUNITY_CONTENT_VALIDATORS: Record<
  'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress',
  (data: CommunityContent) => string | null
> = {
  jav: (data) => firstError(
    checkRequiredString(data, 'code', 64),
    checkOptionalString(data, 'title', 500),
    checkArray(data, 'tags', 20),
    checkArray(data, 'actresses', 50),
    checkArray(data, 'magnets', 100),
  ),
  anime: (data) => firstError(
    checkOptionalString(data, 'keyword', 200),
    checkArray(data, 'bgm', 20),
    checkArray(data, 'nyaa', 60),
    checkArray(data, 'mikan', 60),
    checkArray(data, 'animetosho', 60),
    checkArray(data, 'dmhy', 60),
  ),
  movie: (data) => firstError(
    checkOptionalString(data, 'keyword', 200),
    checkArray(data, 'results', 30),
    checkArray(data, 'resources', 60),
  ),
  manga: (data) => firstError(
    checkOptionalString(data, 'keyword', 200),
    checkArray(data, 'manga', 30),
  ),
  novel: (data) => firstError(
    checkOptionalString(data, 'keyword', 200),
    checkArray(data, 'novels', 30),
  ),
  actress: (data) => firstError(
    checkRequiredString(data, 'name', 200),
    checkOptionalString(data, 'detailUrl', 1000),
  ),
};

/** 返回错误文案；null 表示通过 */
const validateCommunityContentData = (
  postType: keyof typeof COMMUNITY_CONTENT_VALIDATORS,
  raw: string,
): string | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return '内容数据必须是合法的 JSON';
  }
  if (!isPlainObject(parsed)) return '内容数据必须是 JSON 对象';
  return COMMUNITY_CONTENT_VALIDATORS[postType](parsed);
};

export const createTagSchema = z.object({
  name: z.string()
    .min(R.TAG.NAME_MIN_LENGTH, `标签名称至少${R.TAG.NAME_MIN_LENGTH}个字符`)
    .max(R.TAG.NAME_MAX_LENGTH, `标签名称最多${R.TAG.NAME_MAX_LENGTH}个字符`),
  description: z.string().max(R.TAG.DESCRIPTION_MAX_LENGTH).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色格式不正确').optional(),
});

export const createPostSchema = z.object({
  postType: z.enum(['jav', 'anime', 'movie', 'manga', 'novel', 'actress']),
  title: z.string().min(1, '标题不能为空').max(200, '标题最多200个字符'),
  // 封面允许为空：部分来源（关注动态、无封面详情、影视无海报等）没有封面，
  // 前端卡片与详情页都已按「无封面」渲染占位。非空时仍限制为 http(s) 或站内相对路径，
  // 避免把任意文本/大体积内联数据塞进列表卡片。
  coverImage: z.string().max(COMMUNITY_COVER_MAX_LENGTH, '封面图片地址过长')
    .refine(value => value === '' || /^(https?:\/\/|\/)/.test(value), '封面图片必须是有效地址'),
  contentData: z.string().min(1, '内容数据不能为空').max(COMMUNITY_CONTENT_MAX_LENGTH, '内容数据过大'),
  caption: z.string().max(2000, '简介最多2000个字符').optional(),
  tags: z.array(z.string().min(1).max(R.TAG.NAME_MAX_LENGTH))
    .max(R.TAG.MAX_COUNT_PER_SOURCE, `最多${R.TAG.MAX_COUNT_PER_SOURCE}个标签`)
    .optional(),
}).superRefine((value, ctx) => {
  const message = validateCommunityContentData(value.postType, value.contentData);
  if (message) {
    ctx.addIssue({ code: 'custom', path: ['contentData'], message });
  }
});

export const updatePostSchema = z.object({
  caption: z.string().max(2000, '简介最多2000个字符').optional(),
  tags: z.array(z.string().min(1).max(R.TAG.NAME_MAX_LENGTH))
    .max(R.TAG.MAX_COUNT_PER_SOURCE, `最多${R.TAG.MAX_COUNT_PER_SOURCE}个标签`)
    .optional(),
});

export const createCommentSchema = z.object({
  postId: z.string().min(1, '帖子ID不能为空'),
  content: z.string().min(1, '评论内容不能为空').max(1000, '评论内容最多1000个字符'),
});

export const reportPostSchema = z.object({
  reason: z.string().min(1, '请提供举报原因').max(R.REPORT.REASON_MAX_LENGTH, `举报原因最多${R.REPORT.REASON_MAX_LENGTH}个字符`),
  details: z.string().max(R.REPORT.DETAILS_MAX_LENGTH).optional(),
});

export type CreateTagRequest = z.infer<typeof createTagSchema>;
export type CreatePostRequest = z.infer<typeof createPostSchema>;
export type UpdatePostRequest = z.infer<typeof updatePostSchema>;
export type CreateCommentRequest = z.infer<typeof createCommentSchema>;
export type ReportRequest = z.infer<typeof reportPostSchema>;
