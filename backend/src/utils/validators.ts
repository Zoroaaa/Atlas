import { z } from 'zod';

export const userActivitySchema = z.object({
  id: z.string(),
  user_id: z.string(),
  action: z.string(),
  data: z.string().optional(),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  created_at: z.number(),
});

export const feedbackSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  type: z.enum(['bug', 'suggestion', 'other']),
  title: z.string(),
  content: z.string().nullable(),
  contact_email: z.string().nullable(),
  page_url: z.string().nullable(),
  user_agent: z.string().nullable(),
  ip_address: z.string().nullable(),
  status: z.enum(['pending', 'processing', 'resolved', 'closed']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  admin_user_id: z.string().nullable(),
  admin_reply: z.string().nullable(),
  admin_notes: z.string().nullable(),
  resolved_at: z.number().nullable(),
  email_sent: z.number(),
  username: z.string().nullable(),
  user_email: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});

export const communityStatsSchema = z.object({
  likes: z.number().default(0),
  reviews: z.number().default(0),
  downloads: z.number().default(0),
  reports: z.number().default(0),
});

export const adminSessionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  token_hash: z.string(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  created_at: z.number(),
  expires_at: z.number(),
  last_activity: z.number(),
});

export const adminEventSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  message: z.string(),
  data: z.string().nullable(),
  source: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_id: z.string().nullable(),
  user_agent: z.string().nullable(),
  session_id: z.string().nullable(),
  referer: z.string().nullable(),
  created_at: z.number(),
});

export const adminActionSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  action: z.string(),
  data: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  created_at: z.number(),
});

type InferSchema<T> = z.infer<T>;

export type UserActivity = InferSchema<typeof userActivitySchema>;
export type Feedback = InferSchema<typeof feedbackSchema>;
export type CommunityStats = InferSchema<typeof communityStatsSchema>;
export type AdminSession = InferSchema<typeof adminSessionSchema>;
export type AdminEvent = InferSchema<typeof adminEventSchema>;
export type AdminAction = InferSchema<typeof adminActionSchema>;
