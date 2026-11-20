/**
 * 搜索源健康探测：用固定探测词请求真实搜索页，判断「能不能搜出内容」，而不只是「首页是否 200」。
 *
 * 约束：结果只用于展示（可用/不可用 + 原因备注），不自动禁用、不产出禁用建议；
 * 探测只由用户手动触发，不做定时轮询，避免放大上游压力。
 */
import type { SourceHealthResult, SourceHealthStatus } from '@codeseek/shared/types';

export type { SourceHealthResult, SourceHealthStatus };

/** 固定探测词：选一个格式稳定的番号，便于跨站点用同一套命中规则比较 */
export const HEALTH_PROBE_KEYWORD = 'ABP-984';

const DEFAULT_TIMEOUT_MS = 10_000;
// 首页只用于区分「搜索路径失效」与「整站不可达」，给更短预算，避免单源探测拖到 20 秒
const HOMEPAGE_TIMEOUT_MS = 5_000;
// 只分析前 512KB：结果列表在正文后半段的情况极少，读整页会放大 Worker 内存与 CPU
const MAX_ANALYZE_BYTES = 512 * 1024;

export interface ProbeSourceInput {
  id: string;
  name: string;
  url_template: string;
  homepage_url?: string | null;
}

interface FetchOutcome {
  httpStatus: number | null;
  responseTime: number;
  html: string;
  networkError: string | null;
  timedOut: boolean;
}

// ── 页面特征 ─────────────────────────────────────────────

// 命中探测词优先于所有特征判断：结果页底部挂验证码组件很常见，不能因为有验证码就判失败
const CHALLENGE_PATTERNS: RegExp[] = [
  /cf-chl|cf_chl_opt|challenge-platform|__cf_chl/i,
  /just a moment|checking your browser|attention required/i,
  /captcha|recaptcha|hcaptcha|turnstile/i,
  /人机验证|安全验证|滑动验证|拖动滑块|验证码/,
];

const LOGIN_PATTERNS: RegExp[] = [
  /请先登录|登录后(查看|可见)|会员登录|需要登录|账号登录/,
  /sign in to continue|login required|please (log|sign) in/i,
];

const EMPTY_RESULT_PATTERNS: RegExp[] = [
  /没有找到|未找到|暂无(结果|内容|数据)|没有相关|搜索结果为空/,
  /no results?|nothing found|0 results?|not found/i,
];

/** 把探测词写成「横杠/空格可有可无」的正则：ABP-984 与 ABP984、ABP 984 视为同一次检索 */
function buildKeywordPattern(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped.replace(/[-\s]/g, '[-\\s]?'), 'i');
}

/** 探测词被拆成两段时（如 ABP + 984）允许判为部分命中，用于区分「页面完全无关」 */
function buildPartialTokens(keyword: string): string[] {
  return keyword
    .split(/[-\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2);
}

// ── 请求 ─────────────────────────────────────────────────

/**
 * 单次 GET：统一 UA 与超时，网络错误不抛出，交给调用方按状态归类。
 * 读取正文只在需要内容判定时发生，且截断到 MAX_ANALYZE_BYTES。
 */
async function fetchPage(url: string, timeoutMs: number, readBody: boolean): Promise<FetchOutcome> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    const responseTime = Date.now() - startTime;

    let html = '';
    if (readBody && response.ok) {
      try {
        const text = await response.text();
        html = text.length > MAX_ANALYZE_BYTES ? text.slice(0, MAX_ANALYZE_BYTES) : text;
      } catch {
        // 正文读取失败不影响 HTTP 层判定，按空正文处理
      }
    }

    return { httpStatus: response.status, responseTime, html, networkError: null, timedOut: false };
  } catch (err) {
    const responseTime = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof Error && (err.name === 'AbortError' || /timeout/i.test(message));
    return { httpStatus: null, responseTime, html: '', networkError: message, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

// ── 判定 ─────────────────────────────────────────────────

interface HtmlVerdict {
  status: Extract<SourceHealthStatus, 'online' | 'empty_result' | 'degraded' | 'challenge' | 'login_required'>;
  note: string;
}

/** 只有 HTTP 成功时才看正文：200 也可能是一张验证码页或登录墙 */
export function analyzeProbeHtml(html: string, keyword: string): HtmlVerdict {
  const keywordPattern = buildKeywordPattern(keyword);

  if (keywordPattern.test(html)) {
    return { status: 'online', note: `搜索页正常，命中探测词 ${keyword}` };
  }

  const tokens = buildPartialTokens(keyword);
  if (tokens.length > 1 && tokens.every((token) => html.toLowerCase().includes(token))) {
    return { status: 'online', note: `搜索页正常，探测词 ${keyword} 仅部分命中，需人工确认结果质量` };
  }

  if (CHALLENGE_PATTERNS.some((pattern) => pattern.test(html))) {
    return { status: 'challenge', note: '返回验证码/人机校验页（HTTP 200），需浏览器验证后才能搜索' };
  }

  if (LOGIN_PATTERNS.some((pattern) => pattern.test(html))) {
    return { status: 'login_required', note: '返回登录墙，需登录后才能看到搜索结果' };
  }

  if (EMPTY_RESULT_PATTERNS.some((pattern) => pattern.test(html))) {
    return {
      status: 'empty_result',
      note: `搜索页正常，但没有探测词 ${keyword} 的结果（非 JAV 源属正常现象）`,
    };
  }

  return {
    status: 'degraded',
    note: '页面可访问，但服务端看不到搜索结果（可能由前端渲染，或页面结构已变更）',
  };
}

/** 搜索地址异常时补探首页，用来区分「搜索路径失效」与「整站不可达」 */
async function probeHomepage(homepageUrl: string | null | undefined): Promise<number | null> {
  if (!homepageUrl || !/^https?:\/\//i.test(homepageUrl)) return null;
  const outcome = await fetchPage(homepageUrl, HOMEPAGE_TIMEOUT_MS, false);
  return outcome.httpStatus;
}

/**
 * 探测单个搜索源。
 *
 * 探测目标是「URL 模板替换探测词后的搜索地址」，首页只在搜索地址返回 404/410 时补探：
 * 首页正常而搜索地址 404，说明站还在、搜索路径变了，这两类问题处理方式完全不同。
 */
export async function probeSourceHealth(
  source: ProbeSourceInput,
  options: { timeoutMs?: number } = {}
): Promise<SourceHealthResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const checkedAt = Date.now();
  const base = {
    sourceId: source.id,
    sourceName: source.name,
    probeKeyword: HEALTH_PROBE_KEYWORD,
    checkedAt,
    homepageHttpStatus: null as number | null,
  };

  if (!source.url_template) {
    return {
      ...base,
      status: 'error',
      available: false,
      httpStatus: null,
      responseTime: 0,
      note: '没有配置 URL 模板，无法探测',
      probeUrl: '',
    };
  }

  const hasKeywordPlaceholder = source.url_template.includes('{keyword}');
  const probeUrl = hasKeywordPlaceholder
    ? source.url_template.replace('{keyword}', encodeURIComponent(HEALTH_PROBE_KEYWORD))
    : source.url_template;

  const outcome = await fetchPage(probeUrl, timeoutMs, true);

  if (outcome.timedOut) {
    return {
      ...base,
      status: 'timeout',
      available: false,
      httpStatus: null,
      responseTime: outcome.responseTime,
      note: `请求超时（>${Math.round(timeoutMs / 1000)} 秒）`,
      probeUrl,
    };
  }

  if (outcome.networkError) {
    return {
      ...base,
      status: 'offline',
      available: false,
      httpStatus: null,
      responseTime: outcome.responseTime,
      note: `网络不可达：${outcome.networkError.slice(0, 120)}`,
      probeUrl,
    };
  }

  const httpStatus = outcome.httpStatus as number;

  // ── 搜索地址失效 ─────────────────────────────────────
  if (httpStatus === 404 || httpStatus === 410) {
    const homepageHttpStatus = await probeHomepage(source.homepage_url);
    if (homepageHttpStatus !== null && homepageHttpStatus >= 200 && homepageHttpStatus < 400) {
      return {
        ...base,
        homepageHttpStatus,
        status: 'search_path_changed',
        available: false,
        httpStatus,
        responseTime: outcome.responseTime,
        note: `首页可访问（HTTP ${homepageHttpStatus}），搜索地址返回 ${httpStatus}：URL 模板可能已失效，也可能是该站对无结果直接返回 404`,
        probeUrl,
      };
    }
    return {
      ...base,
      homepageHttpStatus,
      status: 'error',
      available: false,
      httpStatus,
      responseTime: outcome.responseTime,
      note: homepageHttpStatus
        ? `搜索地址返回 ${httpStatus}，首页也返回 ${homepageHttpStatus}`
        : `搜索地址返回 ${httpStatus}，且没有可用的首页地址可对照`,
      probeUrl,
    };
  }

  // ── 站点存在但拒绝我们 ──────────────────────────────
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
    const note = httpStatus === 429
      ? '被限频（HTTP 429），暂时不可用，稍后重试'
      : httpStatus === 401
        ? '需要鉴权（HTTP 401），匿名请求被拒绝'
        : '站点拒绝服务端访问（HTTP 403）；若浏览器能正常打开，说明只拦机房 IP';
    return {
      ...base,
      status: 'restricted',
      available: false,
      httpStatus,
      responseTime: outcome.responseTime,
      note,
      probeUrl,
    };
  }

  if (httpStatus >= 500) {
    return {
      ...base,
      status: 'error',
      available: false,
      httpStatus,
      responseTime: outcome.responseTime,
      note: `服务端错误（HTTP ${httpStatus}），可能是瞬时故障，建议稍后重测`,
      probeUrl,
    };
  }

  if (httpStatus >= 400) {
    return {
      ...base,
      status: 'error',
      available: false,
      httpStatus,
      responseTime: outcome.responseTime,
      note: `请求被拒绝（HTTP ${httpStatus}）`,
      probeUrl,
    };
  }

  // ── HTTP 成功后再看正文 ─────────────────────────────
  const verdict = analyzeProbeHtml(outcome.html, HEALTH_PROBE_KEYWORD);
  // 空结果与页面可达都算「能用」：非 JAV 源本来就不会有 ABP-984 的结果
  const available = verdict.status !== 'challenge' && verdict.status !== 'login_required';

  const templateNote = hasKeywordPlaceholder
    ? ''
    : '；URL 模板不含 {keyword}，只验证了页面可达性';

  return {
    ...base,
    status: verdict.status,
    available,
    httpStatus,
    responseTime: outcome.responseTime,
    note: `${verdict.note}${templateNote}`,
    probeUrl,
  };
}
