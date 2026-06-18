import { Env } from '@/types';
import { generateId } from '@/utils';

export interface SourceStatusCheckOptions {
  timeout?: number;
  checkContentMatch?: boolean;
  env: Env;
}

export interface SourceStatusResult {
  sourceId: string;
  sourceName: string;
  status: 'available' | 'unavailable' | 'timeout' | 'error';
  available: boolean;
  contentMatch: boolean;
  responseTime: number;
  qualityScore?: number;
  httpStatus?: number;
  lastChecked: number;
  matchDetails?: Record<string, unknown>;
  error?: string;
  fromCache: boolean;
}

export interface ContentAnalysisResult {
  hasMatch: boolean;
  qualityScore: number;
  details: {
    titleMatch: boolean;
    bodyMatch: boolean;
    exactMatch: boolean;
    partialMatch: boolean;
    resultCount: number;
    keywordPositions: number[];
  };
}

export interface CachedSourceStatus {
  id: string;
  source_id: string;
  keyword: string;
  keyword_hash: string;
  status: string;
  available: number;
  content_match: number;
  response_time: number;
  quality_score: number;
  match_details: string;
  page_info: string;
  check_error: string | null;
  expires_at: number;
  created_at: number;
  last_accessed: number;
  access_count: number;
}

export const checkSingleSourceStatus = async (
  source: { id?: string; name: string; urlTemplate: string },
  keyword: string,
  keywordHash: string,
  options: SourceStatusCheckOptions
): Promise<SourceStatusResult> => {
  const { timeout = 10000, checkContentMatch = false, env } = options;
  const sourceId = source.id || source.name;
  const startTime = Date.now();

  try {
    const cached = await getCachedSourceStatus(env, sourceId, keywordHash);
    if (cached && isCacheValid(cached)) {
      console.log(`使用缓存结果: ${sourceId}`);
      return {
        sourceId,
        sourceName: source.name,
        status: cached.status as SourceStatusResult['status'],
        available: cached.available === 1,
        contentMatch: cached.content_match === 1,
        responseTime: cached.response_time,
        lastChecked: cached.created_at,
        fromCache: true,
      };
    }

    const checkUrl = source.urlTemplate.replace('{keyword}', encodeURIComponent(keyword));
    console.log(`检查URL: ${checkUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(checkUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'MagnetSearch-StatusChecker/1.3.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.8,en;q=0.6',
        'Cache-Control': 'no-cache',
      },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    const isAvailable = response.ok && response.status < 400;
    let contentMatch = false;
    let qualityScore = 0;
    let matchDetails = {};

    if (isAvailable && checkContentMatch) {
      try {
        const content = await response.text();
        const matchResult = analyzePageContent(content, keyword, source);
        contentMatch = matchResult.hasMatch;
        qualityScore = matchResult.qualityScore;
        matchDetails = matchResult.details;

        console.log(`内容匹配检查 ${sourceId}: ${contentMatch ? '匹配' : '不匹配'}, 质量分数: ${qualityScore}`);
      } catch (contentError) {
        console.warn(`内容检查失败 ${sourceId}:`, (contentError as Error).message);
      }
    }

    let finalStatus: SourceStatusResult['status'] = 'error';
    if (isAvailable) {
      if (checkContentMatch) {
        finalStatus = contentMatch ? 'available' : 'unavailable';
      } else {
        finalStatus = 'available';
      }
    } else if (response.status === 404) {
      finalStatus = 'unavailable';
    } else if (responseTime >= timeout * 0.9) {
      finalStatus = 'timeout';
    } else {
      finalStatus = 'unavailable';
    }

    const result: SourceStatusResult = {
      sourceId,
      sourceName: source.name,
      status: finalStatus,
      available: finalStatus === 'available',
      contentMatch,
      responseTime,
      qualityScore,
      httpStatus: response.status,
      lastChecked: Date.now(),
      matchDetails,
      fromCache: false,
    };

    saveSingleStatusToCache(env, sourceId, keyword, keywordHash, result).catch(console.error);

    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;

    console.error(`检查源失败 ${sourceId}:`, (error as Error).message);

    let status: SourceStatusResult['status'] = 'error';
    if ((error as Error).name === 'AbortError' || (error as Error).message.includes('timeout')) {
      status = 'timeout';
    } else if ((error as Error).message.includes('network') || (error as Error).message.includes('fetch')) {
      status = 'unavailable';
    }

    const result: SourceStatusResult = {
      sourceId,
      sourceName: source.name,
      status,
      available: false,
      contentMatch: false,
      responseTime,
      qualityScore: 0,
      lastChecked: Date.now(),
      error: (error as Error).message,
      fromCache: false,
    };

    saveSingleStatusToCache(env, sourceId, keyword, keywordHash, result).catch(console.error);

    return result;
  }
};

export const analyzePageContent = (
  content: string,
  keyword: string,
  _source: { id?: string; name: string; urlTemplate: string }
): ContentAnalysisResult => {
  const lowerContent = content.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  let qualityScore = 0;
  const details: ContentAnalysisResult['details'] = {
    titleMatch: false,
    bodyMatch: false,
    exactMatch: false,
    partialMatch: false,
    resultCount: 0,
    keywordPositions: [],
  };

  if (lowerContent.includes(lowerKeyword)) {
    details.exactMatch = true;
    qualityScore += 50;

    let position = 0;
    while ((position = lowerContent.indexOf(lowerKeyword, position)) !== -1) {
      details.keywordPositions.push(position);
      position += lowerKeyword.length;
    }
  }

  const titleMatch = content.match(/<title[^>]*>([^<]*)/i);
  if (titleMatch && titleMatch[1].toLowerCase().includes(lowerKeyword)) {
    details.titleMatch = true;
    qualityScore += 30;
  }

  if (/^[A-Za-z]+-?\d+$/i.test(keyword)) {
    const numberPattern = keyword.replace('-', '-?');
    const regex = new RegExp(numberPattern, 'gi');
    const matches = content.match(regex);
    if (matches) {
      details.exactMatch = true;
      qualityScore += 40;
      details.resultCount = matches.length;
    }
  }

  if (!details.exactMatch && keyword.length > 3) {
    const parts = keyword.split(/[-_\s]+/);
    let partialMatches = 0;

    parts.forEach((part) => {
      if (part.length > 2 && lowerContent.includes(part.toLowerCase())) {
        partialMatches++;
      }
    });

    if (partialMatches > 0) {
      details.partialMatch = true;
      qualityScore += Math.min(partialMatches * 10, 30);
    }
  }

  const resultIndicators = [
    /result/gi,
    /search.*result/gi,
    /找到.*结果/gi,
    /共.*条/gi,
    /<div[^>]*class[^>]*result/gi,
  ];

  let resultCount = 0;
  resultIndicators.forEach((indicator) => {
    const matches = content.match(indicator);
    if (matches) resultCount += matches.length;
  });

  if (resultCount > 0) {
    details.resultCount = resultCount;
    qualityScore += Math.min(resultCount * 5, 20);
  }

  const noResultIndicators = [
    /no.*result/gi,
    /not.*found/gi,
    /没有.*结果/gi,
    /未找到/gi,
    /暂无.*内容/gi,
  ];

  const hasNoResultIndicator = noResultIndicators.some((indicator) => content.match(indicator));

  if (hasNoResultIndicator) {
    qualityScore = Math.max(0, qualityScore - 30);
  }

  qualityScore = Math.min(100, Math.max(0, qualityScore));

  const hasMatch = details.exactMatch || (details.partialMatch && qualityScore > 20);

  return {
    hasMatch,
    qualityScore,
    details,
  };
};

export const updateTagUsageCount = async (env: Env, tagIds: string[]): Promise<void> => {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    return;
  }

  try {
    for (const tagId of tagIds) {
      if (tagId && typeof tagId === 'string') {
        await env.DB.prepare(
          `UPDATE community_tags
           SET tag_active = 1, updated_at = ?
           WHERE id = ?`
        )
          .bind(Date.now(), tagId)
          .run();
      }
    }
  } catch (error) {
    console.error('更新标签使用统计失败:', error);
  }
};

export const getCachedSourceStatus = async (
  env: Env,
  sourceId: string,
  keywordHash: string
): Promise<CachedSourceStatus | null> => {
  try {
    return (await env.DB.prepare(
      `SELECT * FROM source_status_cache 
       WHERE source_id = ? AND keyword_hash = ? 
       ORDER BY created_at DESC 
       LIMIT 1`
    )
      .bind(sourceId, keywordHash)
      .first()) as CachedSourceStatus | null;
  } catch (error) {
    console.error('获取缓存状态失败:', error);
    return null;
  }
};

export const isCacheValid = (cached: CachedSourceStatus | null, maxAge = 300000): boolean => {
  if (!cached) return false;
  return Date.now() - cached.created_at < maxAge;
};

export const saveSingleStatusToCache = async (
  env: Env,
  sourceId: string,
  keyword: string,
  keywordHash: string,
  result: SourceStatusResult
): Promise<void> => {
  try {
    const cacheId = generateId();
    await env.DB.prepare(
      `INSERT INTO source_status_cache (
        id, source_id, keyword, keyword_hash, status, available, content_match,
        response_time, quality_score, match_details, page_info, check_error,
        expires_at, created_at, last_accessed, access_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        cacheId,
        sourceId,
        keyword,
        keywordHash,
        result.status,
        result.available ? 1 : 0,
        result.contentMatch ? 1 : 0,
        result.responseTime,
        result.qualityScore || 0,
        JSON.stringify(result.matchDetails || {}),
        JSON.stringify({ httpStatus: result.httpStatus }),
        result.error || null,
        Date.now() + 300000,
        Date.now(),
        Date.now(),
        1
      )
      .run();
  } catch (error) {
    console.error('保存缓存状态失败:', error);
  }
};

export const updateUserStatsAfterDelete = async (env: Env, userId: string): Promise<void> => {
  try {
    const realStats = (await env.DB.prepare(
      `SELECT COUNT(*) as posts_count FROM community_posts
       WHERE user_id = ? AND status = 'active'`
    )
      .bind(userId)
      .first()) as { posts_count: number };

    await env.DB.prepare(
      `INSERT OR REPLACE INTO community_user_stats (
        id, user_id, posts_count, updated_at,
        likes_received, favorites_received, comments_count,
        reputation_score, contribution_level,
        created_at
      ) VALUES (
        COALESCE((SELECT id FROM community_user_stats WHERE user_id = ?), ? || '_stats'),
        ?,
        ?,
        ?,
        COALESCE((SELECT likes_received FROM community_user_stats WHERE user_id = ?), 0),
        COALESCE((SELECT favorites_received FROM community_user_stats WHERE user_id = ?), 0),
        COALESCE((SELECT comments_count FROM community_user_stats WHERE user_id = ?), 0),
        COALESCE((SELECT reputation_score FROM community_user_stats WHERE user_id = ?), 0),
        COALESCE((SELECT contribution_level FROM community_user_stats WHERE user_id = ?), 'beginner'),
        COALESCE((SELECT created_at FROM community_user_stats WHERE user_id = ?), strftime('%s', 'now') * 1000)
      )`
    )
      .bind(
        userId,
        userId,
        userId,
        realStats.posts_count || 0,
        Date.now(),
        userId,
        userId,
        userId,
        userId,
        userId,
        userId,
        userId,
        userId,
        userId
      )
      .run();

    console.log('用户统计更新成功，新的帖子数:', realStats.posts_count);
  } catch (error) {
    console.error('更新用户统计失败:', error);
  }
};
