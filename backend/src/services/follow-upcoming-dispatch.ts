/**
 * 触发 GitHub Actions「关注动态即将发售」同步
 *
 * 背景：GitHub Actions 的原生 schedule 只是尽力而为，免费/公共仓库高峰期
 * 经常延迟十几分钟甚至跳过，表现为「配置了每 10 分钟但没有按点跑」。
 * Worker 本身已有每 10 分钟一次的 cron，这里通过 GitHub API 主动 dispatch 同一个 workflow，
 * 用「最近一次运行时间 < 8 分钟则跳过」避免与原生 schedule 重复触发。
 *
 * 需要 Worker secrets/vars：
 *   GITHUB_DISPATCH_TOKEN  GitHub PAT（actions:write）
 *   GITHUB_REPOSITORY      owner/repo
 *   GITHUB_DISPATCH_REF    可选，默认 main
 *
 * 未配置时直接跳过（不报错），保留 GitHub 原生 schedule 作为兜底。
 */
import type { Env } from '@/types';

const WORKFLOW_FILE = 'follow-upcoming-sync.yml';
const MIN_GAP_MS = 8 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export type DispatchResult = 'disabled' | 'skipped' | 'dispatched' | 'failed';

function githubHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'Atlas-Worker/1.0',
    'x-github-api-version': '2022-11-28',
  };
}

export async function dispatchFollowUpcomingSync(env: Env): Promise<DispatchResult> {
  const token = env.GITHUB_DISPATCH_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  if (!token || !repo) return 'disabled';

  const base = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}`;
  const headers = githubHeaders(token);

  try {
    // 最近一次运行（包含原生 schedule / 手动 / 本调度）距离现在不足 8 分钟则跳过
    const runsResp = await fetch(`${base}/runs?per_page=1`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (runsResp.ok) {
      const payload = await runsResp.json() as {
        workflow_runs?: Array<{ created_at?: string }>;
      };
      const latest = payload.workflow_runs?.[0]?.created_at;
      if (latest) {
        const createdAt = Date.parse(latest);
        if (Number.isFinite(createdAt) && Date.now() - createdAt < MIN_GAP_MS) {
          return 'skipped';
        }
      }
    } else {
      console.warn(`[follow-upcoming-dispatch] list runs failed: HTTP ${runsResp.status}`);
    }

    const dispatchResp = await fetch(`${base}/dispatches`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ ref: env.GITHUB_DISPATCH_REF || 'main' }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (dispatchResp.status === 204) return 'dispatched';

    console.error(
      `[follow-upcoming-dispatch] dispatch failed: HTTP ${dispatchResp.status} ${(await dispatchResp.text()).slice(0, 200)}`
    );
    return 'failed';
  } catch (err) {
    console.error('[follow-upcoming-dispatch] error:', err);
    return 'failed';
  }
}
