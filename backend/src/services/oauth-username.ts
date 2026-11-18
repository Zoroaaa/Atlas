/**
 * OAuth 首次注册的用户名生成：把第三方显示名清洗成合法且唯一的用户名。
 *
 * 约束：users.username 既是登录凭证又是 UNIQUE 列，生成结果必须一次落库成功——
 * 撞约束会让整个回调失败，用户只看到「登录失败」且无从修正。因此候选名必须
 * 与注册表单的字符集/长度口径一致，并在返回前实际查重。
 */
import type { Env } from '@/types';
import { VALIDATION_RULES } from '@/constants';

// 字符集必须与 registerSchema 的 VALIDATION_PATTERNS.USERNAME 一致；
// 该正则只用于匹配，无法直接取反，所以这里维护对应的排除式
const ILLEGAL_CHARS = /[^a-zA-Z0-9_]/g;
// 上限直接取共享契约，避免表单放宽后这里仍按旧值截断
const MAX_LENGTH = VALIDATION_RULES.USERNAME.MAX_LENGTH;
// 判断是否有信息量时忽略下划线：「张三」会被整体替换成「__」，按字符数算刚好合法，
// 但这种名字没有辨识度，必须回退到邮箱前缀。阈值比表单的 MIN_LENGTH 更严，故意不复用
const MIN_MEANINGFUL_LENGTH = 3;
// 冲突后缀固定为「_ + 6 位数字」，基名要为其预留 7 个字符
const SUFFIX_LENGTH = 7;
const MAX_ATTEMPTS = 5;

export interface OAuthUsernameInput {
  /** 第三方展示名：Google 的 name/given_name、GitHub 的 login，可能为空 */
  displayName?: string | null;
  /** 第三方账号邮箱，展示名无信息量时用其前缀兜底 */
  email: string;
  /** 全部兜底都失败时的固定前缀，用于区分来源（gh / g） */
  prefix: string;
}

/**
 * 返回一个当前库中不存在的 OAuth 用户名。
 *
 * 冲突时追加随机数字后缀并重新查重，最多尝试 5 次；仍失败则抛错交由回调兜底。
 */
export async function resolveOAuthUsername(db: Env['DB'], input: OAuthUsernameInput): Promise<string> {
  const base = pickBaseName(input);
  // 首轮直接用完整基名；需要后缀时把基名压到 13 位，保证「基名_6位数字」不超过 20
  const fullBase = base.slice(0, MAX_LENGTH);
  const shortBase = base.slice(0, MAX_LENGTH - SUFFIX_LENGTH);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? fullBase : `${shortBase}_${randomDigits(6)}`;
    const taken = await db.prepare('SELECT 1 FROM users WHERE username = ?').bind(candidate).first();
    if (!taken) return candidate;
  }

  // 6 位随机数连撞 5 次说明库内同名密度异常，此时宁可报错也不返回可能重复的名字
  throw new Error(`OAuth 用户名生成失败（基名 ${base}）`);
}

/** 依次尝试展示名、邮箱前缀，都不可用时退回「前缀_user」，保证结果一定合法 */
function pickBaseName(input: OAuthUsernameInput): string {
  const rawCandidates = [input.displayName ?? '', input.email.split('@')[0] ?? ''];

  for (const raw of rawCandidates) {
    const cleaned = raw.replace(ILLEGAL_CHARS, '_');
    if (cleaned.replace(/_/g, '').length >= MIN_MEANINGFUL_LENGTH) {
      return cleaned.slice(0, MAX_LENGTH);
    }
  }

  return `${input.prefix}_user`;
}

/** 生成指定长度的数字串；只用来错开重名，不承担安全职责 */
function randomDigits(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}
