/**
 * 真实在跑的抓取器 ↔ 搜索源配置 的映射
 *
 * 背景：动漫/影视/漫画三类此前「DB 配了源、前端从不渲染、后端也从不读」，
 * 用户在源管理里关源没有任何效果。这里把每个大类真实在用的抓取器与 DB 源的
 * URL host 对齐，做到两件事：
 *   1. 只为真实在跑的源生成跳转卡片（失效源不再出现在卡片里）
 *   2. 用户关掉某个源时，对应抓取器在本类搜索中真正跳过
 *
 * 语义沿用 repository 的黑名单约定：**没有配置行的抓取器视为启用**，
 * 只有「有配置行且用户显式禁用」才跳过。这样新增源不会因历史配置被永久挡住。
 */

import {
  listSourcesByCategory,
  filterEnabledSources,
  toSourceCards,
  type SearchSourceCard,
} from '@/repositories/search-source-repository';

interface ScraperSpec {
  /** 抓取器 key，与各 search 服务的 skip 集合一致 */
  key: string;
  /** DB 源 URL host（含子域匹配） */
  host: string;
}

const LIVE_SCRAPERS: Record<string, ScraperSpec[]> = {
  anime_sources: [
    { key: 'bangumi', host: 'bangumi.tv' },
    { key: 'mikan', host: 'mikanani.me' },
    { key: 'dmhy', host: 'share.dmhy.org' },
    { key: 'animetosho', host: 'animetosho.org' },
  ],
  movie_sources: [
    { key: 'tmdb', host: 'themoviedb.org' },
    { key: 'tpb', host: 'thepiratebay.org' },
    { key: 'eztv', host: 'eztv.re' },
  ],
  manga_sources: [
    { key: 'mangadex', host: 'mangadex.org' },
    { key: 'mangaupdates', host: 'mangaupdates.com' },
  ],
};

function hostOf(urlTemplate: string): string {
  try {
    return new URL(urlTemplate.replace('{keyword}', 'x')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export interface LiveSources {
  /** 真实在跑且未被用户关闭的源卡片 */
  cards: SearchSourceCard[];
  /** 用户关掉的抓取器 key（传给 search 服务的 skip 集合） */
  skip: Set<string>;
}

/**
 * 解析某大类真实在跑的源：
 *   - 有配置行且被禁用 → 加入 skip，不出卡片
 *   - 有配置行且启用   → 出卡片
 *   - 无配置行         → 视为启用，不出卡片（避免凭空造开关）
 */
export async function resolveLiveSources(
  db: D1Database,
  opts: { categoryId: string; userId: string; disabledSources?: Set<string> | null; keyword: string },
): Promise<LiveSources> {
  const specs = LIVE_SCRAPERS[opts.categoryId] || [];
  if (specs.length === 0) return { cards: [], skip: new Set() };

  const rows = await listSourcesByCategory(db, {
    categoryId: opts.categoryId,
    userId: opts.userId,
  });
  const enabled = filterEnabledSources(rows, opts.disabledSources ?? null);
  const enabledIds = new Set(enabled.map(row => row.id));

  const cards: SearchSourceCard[] = [];
  const skip = new Set<string>();

  for (const spec of specs) {
    // 同一 host 可能有多条配置（如 tmdb / themoviedb_cn 都指向 themoviedb.org）：
    // 只有「该 host 下的配置全部被禁用」才算关源，否则会因其中一条被关而误伤整个抓取器。
    const matched = rows.filter(r => hostOf(r.url_template).endsWith(spec.host));
    if (matched.length === 0) continue;

    const active = matched.filter(r => enabledIds.has(r.id));
    if (active.length === 0) {
      skip.add(spec.key);
      continue;
    }
    cards.push(...toSourceCards([active[0]], opts.keyword));
  }

  return { cards, skip };
}
