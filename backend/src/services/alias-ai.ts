/**
 * AI 别名候选生成（旁路）
 *
 * 定位：只在本地别名表与免费数据源都未命中时，生成少量候选，
 * 且必须经 Wikidata 校验后才允许写库。绝不把模型输出直接当作查询词。
 *
 * 开关：
 *   - wrangler.toml 配置 [ai] binding = "AI"
 *   - [vars] ENABLE_ALIAS_AI = "1"
 *   - 可选 ALIAS_AI_MODEL（默认 @cf/meta/m2m100-1.2b）
 */
import type { Env } from '@/types';
import { detectScript } from '@/services/query-normalizer';
import { verifyAliasCandidate } from '@/services/alias-resolver';

export interface AiAliasSuggestion {
  text: string;
  lang: 'ja' | 'en';
  verified: boolean;
}

const DEFAULT_MODEL = '@cf/meta/m2m100-1.2b';

const TARGET_LANG_NAME = {
  ja: 'japanese',
  en: 'english',
} as const;

function extractText(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    for (const key of ['translated_text', 'response', 'result', 'text']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return '';
}

/**
 * 生成并校验候选别名。
 * 未开启、无 AI 绑定、模型失败时统一返回空数组，调用方无需做异常分支。
 */
export async function suggestAliasesWithAi(
  env: Env,
  keyword: string,
  targetLang: 'ja' | 'en'
): Promise<AiAliasSuggestion[]> {
  if (!env.AI || env.ENABLE_ALIAS_AI !== '1') return [];

  const model = env.ALIAS_AI_MODEL || DEFAULT_MODEL;
  const sourceLang = detectScript(keyword) === 'ja' ? 'japanese' : 'chinese';

  try {
    const raw = await env.AI.run(model, {
      text: keyword,
      source_lang: sourceLang,
      target_lang: TARGET_LANG_NAME[targetLang],
    });
    const translated = extractText(raw);
    if (!translated || translated === keyword || translated.length > 80) return [];

    const verified = await verifyAliasCandidate(keyword, translated, targetLang);
    return [{ text: translated, lang: targetLang, verified }];
  } catch (err) {
    console.error('[alias-ai] suggestion failed:', err);
    return [];
  }
}
