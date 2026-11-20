/**
 * 资源 → 作品的归属判定：打分 + 硬约束否决 + 边际接受。
 *
 * 与旧实现（title-grouping.ts 的 groupResourcesBySubject）的根本差别：
 * - 旧实现「命中即归属、先到先得」，一条资源归给第一个包含它的作品，顺序决定结果；
 * - 本实现先算全部 (资源 × 作品) 分数，再按分数全局分配，并要求与第二名拉开差距。
 *
 * 取舍：宁可漏，不可错。错配让用户下载错内容、摧毁信任；漏配只是多一屏「其他资源」。
 * 所以未达阈值的资源保持 ungrouped，由调用方照常展示。
 */

import { parseReleaseTitle, scoreTitleCandidates, type ParsedRelease } from '@/utils/release-title';

export interface SubjectCandidateInput {
  /** 稳定 ID（bangumi:123 / tmdb:movie:456），用于日志与前端关联 */
  id: string;
  /** 全语种候选标题 */
  titles: string[];
  /** 发行年，字符串形态（'2021'） */
  year?: string;
  /** 作品类型；只有影视需要，用于否决「剧集包归给电影」 */
  mediaType?: 'movie' | 'tv';
  /** 总集数；已知时可否决「第 300 集归给 12 集番」 */
  totalEpisodes?: number;
}

/** 否决原因：命中任意一条即不参与打分 */
export type RejectReason = 'mediaType' | 'year' | 'episode';

export interface SubjectScore {
  subjectId: string;
  score: number;
  /** 有值表示被硬约束否决，score 无意义 */
  rejectedBy?: RejectReason;
}

export interface MatchDecision {
  /** 归属作品；无值表示 ungrouped */
  subjectId?: string;
  score: number;
  runnerUpScore: number;
  margin: number;
  /** 未归属时的原因，便于日志归因 */
  reason: 'accepted' | 'belowThreshold' | 'ambiguous' | 'noCandidate';
  /** 被否决时的原因（accepted 时为空） */
  rejectedBy?: RejectReason;
}

export interface ResolveOptions {
  /** 最低接受分；低于此值保持 ungrouped */
  minScore?: number;
  /** 与第二名的差距；低于此值视为同名歧义，保持 ungrouped */
  minMargin?: number;
}

/** 默认阈值：60 分（至少是"整词出现"级别）且与次名差 12 分 */
export const DEFAULT_MIN_SCORE = 60;
export const DEFAULT_MIN_MARGIN = 12;

/**
 * 归属判定实现开关。
 *
 * true = 打分版（本模块）；false = 旧实现（title-grouping.ts 的 groupResourcesBySubject）。
 * 出问题时改这一行即可回退，调用点与返回结构不变；影子日志不依赖这个开关，两种模式都会打。
 */
export const USE_SCORED_MATCHER = true;

/** 年份差 1 年容差：首映年与发行年常不一致 */
const YEAR_TOLERANCE = 1;
/** 电影年份窗口：差 ≥2 年直接否决（同名不同年的唯一硬解） */
const MOVIE_YEAR_WINDOW = 2;
/** 集数容差：资源可能带总集数之外的特别篇 */
const EPISODE_SLACK = 2;

function parseYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /(19[5-9]\d|20\d{2})/.exec(value);
  return m ? parseInt(m[1], 10) : undefined;
}

/** 资源是否带「明确是剧集」的标记（SxxExx / Season N），用于电影否决 */
function hasTvMarker(parsed: ParsedRelease): boolean {
  return parsed.season !== undefined;
}

/**
 * 计算单个作品的得分；命中硬约束返回 rejectedBy。
 *
 * 硬约束只用「资源侧确实提供了证据」的字段：没写年份的资源不因年份被否，
 * 否则大量不带年份的发布名会被误杀。
 */
export function scoreSubject(
  parsed: ParsedRelease,
  subject: SubjectCandidateInput,
): SubjectScore {
  // 电影不可能有 SxxExx / Season N：这类资源是剧集包，直接否决
  if (subject.mediaType === 'movie' && hasTvMarker(parsed)) {
    return { subjectId: subject.id, score: 0, rejectedBy: 'mediaType' };
  }

  const subjectYear = parseYear(subject.year);
  if (subject.mediaType === 'movie' && subjectYear && parsed.year) {
    if (Math.abs(subjectYear - parsed.year) >= MOVIE_YEAR_WINDOW) {
      return { subjectId: subject.id, score: 0, rejectedBy: 'year' };
    }
  }

  if (subject.totalEpisodes && parsed.episode && parsed.episode > subject.totalEpisodes + EPISODE_SLACK) {
    return { subjectId: subject.id, score: 0, rejectedBy: 'episode' };
  }

  let score = scoreTitleCandidates(parsed.segments, subject.titles);
  if (score === 0) return { subjectId: subject.id, score: 0 };

  if (subjectYear && parsed.year) {
    const delta = Math.abs(subjectYear - parsed.year);
    if (delta === 0) score += 15;
    else if (delta <= YEAR_TOLERANCE) score += 8;
  }
  if (subject.totalEpisodes && parsed.episode && parsed.episode <= subject.totalEpisodes) {
    score += 5;
  }

  return { subjectId: subject.id, score };
}

/**
 * 为一条资源选出归属作品。
 *
 * 返回 accepted 的条件：最高分 ≥ minScore 且与第二名差距 ≥ minMargin。
 * 只有一条候选时 runnerUp=0，等价于要求最高分本身足够高。
 */
export function resolveSubject(
  parsed: ParsedRelease,
  subjects: SubjectCandidateInput[],
  options: ResolveOptions = {},
): MatchDecision {
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const minMargin = options.minMargin ?? DEFAULT_MIN_MARGIN;

  if (parsed.segments.length === 0 || subjects.length === 0) {
    return { score: 0, runnerUpScore: 0, margin: 0, reason: 'noCandidate' };
  }

  const scored = subjects
    .map(subject => scoreSubject(parsed, subject))
    .filter(item => item.rejectedBy === undefined && item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // 全被否决：把第一个否决原因带出去，便于判断是类型/年份/集数规则过严
    const rejected = subjects.map(subject => scoreSubject(parsed, subject)).find(item => item.rejectedBy);
    return {
      score: 0,
      runnerUpScore: 0,
      margin: 0,
      reason: 'noCandidate',
      rejectedBy: rejected?.rejectedBy,
    };
  }

  const best = scored[0];
  const runnerUpScore = scored[1]?.score ?? 0;
  const margin = best.score - runnerUpScore;

  if (best.score < minScore) {
    return { score: best.score, runnerUpScore, margin, reason: 'belowThreshold' };
  }
  if (margin < minMargin) {
    return { score: best.score, runnerUpScore, margin, reason: 'ambiguous' };
  }
  return { subjectId: best.subjectId, score: best.score, runnerUpScore, margin, reason: 'accepted' };
}

// ── 归组适配器 ────────────────────────────────────────────────────────

export interface ScoredGroupConfig<S, R> {
  subjectId: (subject: S) => string;
  subjectTitles: (subject: S) => string[];
  subjectYear?: (subject: S) => string | undefined;
  subjectMediaType?: (subject: S) => 'movie' | 'tv' | undefined;
  subjectTotalEpisodes?: (subject: S) => number | undefined;
  resourceTitle: (resource: R) => string;
  resourceId: (resource: R) => string;
}

export interface ScoredGroupResult<S, R> {
  groups: Array<{ subject: S; resources: R[] }>;
  ungrouped: R[];
  /** 每条资源的判定结果，供影子对比与决策日志使用 */
  decisions: Array<{ resourceId: string; title: string; decision: MatchDecision }>;
}

/** 按作品归组（打分版）；groups 保持入参顺序，仅按资源数降序排列 */
export function groupResourcesBySubjectV2<S, R>(
  subjects: S[],
  resources: R[],
  config: ScoredGroupConfig<S, R>,
  options: ResolveOptions = {},
): ScoredGroupResult<S, R> {
  const candidates: SubjectCandidateInput[] = subjects.map(subject => ({
    id: config.subjectId(subject),
    titles: config.subjectTitles(subject)
      .map(title => title.trim())
      .filter(title => title.length > 0),
    year: config.subjectYear?.(subject),
    mediaType: config.subjectMediaType?.(subject),
    totalEpisodes: config.subjectTotalEpisodes?.(subject),
  }));

  const byId = new Map<string, R[]>();
  const ungrouped: R[] = [];
  const decisions: ScoredGroupResult<S, R>['decisions'] = [];

  for (const resource of resources) {
    const title = config.resourceTitle(resource);
    const parsed = parseReleaseTitle(title);
    const decision = resolveSubject(parsed, candidates, options);
    decisions.push({ resourceId: config.resourceId(resource), title, decision });

    if (!decision.subjectId) {
      ungrouped.push(resource);
      continue;
    }
    const bucket = byId.get(decision.subjectId);
    if (bucket) bucket.push(resource);
    else byId.set(decision.subjectId, [resource]);
  }

  const groups = subjects.map(subject => ({
    subject,
    resources: byId.get(config.subjectId(subject)) ?? [],
  }));
  groups.sort((a, b) => b.resources.length - a.resources.length);

  return { groups, ungrouped, decisions };
}
