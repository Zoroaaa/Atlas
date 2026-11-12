/**
 * 查询词确定性归一化（L1）
 *
 * 只做「不需要外部知识」的变换：Unicode、大小写、简繁、日文新字体、
 * 假名/罗马音、拼音。真正的多语言实体对应关系在 alias-resolver 里解决。
 *
 * 所有变换都是纯函数/懒加载单例，可在 Workers 冷启动后复用。
 */
import OpenCC from 'opencc-js';
import * as wanakana from 'wanakana';
import { pinyin } from 'pinyin-pro';
import { isJavCodeLike } from '@codeseek/shared/utils';

export type VariantLang = 'zh' | 'zh-TW' | 'ja' | 'ko' | 'en' | 'romaji' | 'pinyin';

export interface QueryVariant {
  text: string;
  lang: VariantLang;
  /** 产生该变体的变换名，便于排查命中链路 */
  transform: string;
  /** 0~1，同一文本保留最高置信度 */
  confidence: number;
}

export type ScriptKind = 'code' | 'ja' | 'han' | 'hangul' | 'latin' | 'unknown';

const HAS_HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const HAS_KANA = /[\u3040-\u30FF\u31F0-\u31FF]/;
const HAS_HANGUL = /[\u1100-\u11FF\uAC00-\uD7AF]/;
const HAS_LATIN = /[A-Za-z]/;

/** 展示用归一化：NFKC + 折叠空白；不改变语义 */
export function normalizeDisplay(input: string): string {
  return input.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/**
 * 查询键：在展示归一化基础上小写并去掉所有空白与常见标点。
 * 只用于 entity_aliases.alias_key，不用于展示。
 */
export function aliasKey(input: string): string {
  return normalizeDisplay(input)
    .toLowerCase()
    .replace(/[\s\u3000·・:：\-–—_.,!?()[\]{}'"“”‘’「」『』、。，《》<>/\\|~`@#$%^&*+=;；]/g, '');
}

/** 判断输入形态：番号 / 日文（含假名）/ 汉字 / 韩文 / 拉丁 / 其他 */
export function detectScript(input: string): ScriptKind {
  const value = normalizeDisplay(input);
  if (!value) return 'unknown';
  if (isJavCodeLike(value)) return 'code';
  if (HAS_KANA.test(value)) return 'ja';
  if (HAS_HAN.test(value)) return 'han';
  if (HAS_HANGUL.test(value)) return 'hangul';
  if (HAS_LATIN.test(value)) return 'latin';
  return 'unknown';
}

/** 把外部数据源的语言码归一化为变体语言；未知语言返回 null */
export function toVariantLang(lang: string): VariantLang | null {
  const value = lang.toLowerCase();
  if (value === 'zh' || value === 'zh-hans' || value === 'zh-cn' || value === 'zh-sg' || value === 'chs') return 'zh';
  if (value === 'zh-hant' || value === 'zh-tw' || value === 'zh-hk' || value === 'cht') return 'zh-TW';
  if (value === 'ja' || value === 'jp' || value === 'jpn') return 'ja';
  if (value === 'ko' || value === 'kor') return 'ko';
  if (value === 'en' || value === 'eng') return 'en';
  if (value === 'romaji') return 'romaji';
  if (value === 'pinyin') return 'pinyin';
  return null;
}

// ─── OpenCC 转换器（懒加载）────────────────────────────────────────────

type Converter = (text: string) => string;

let toTradConverter: Converter | null = null;
let toSimpConverter: Converter | null = null;
let toJpConverter: Converter | null = null;

function converter(kind: 'trad' | 'simp' | 'jp'): Converter {
  if (kind === 'trad') {
    if (!toTradConverter) toTradConverter = OpenCC.Converter({ from: 'cn', to: 't' });
    return toTradConverter;
  }
  if (kind === 'simp') {
    if (!toSimpConverter) toSimpConverter = OpenCC.Converter({ from: 't', to: 'cn' });
    return toSimpConverter;
  }
  if (!toJpConverter) toJpConverter = OpenCC.Converter({ from: 'cn', to: 'jp' });
  return toJpConverter;
}

function safeConvert(kind: 'trad' | 'simp' | 'jp', text: string): string {
  try {
    return converter(kind)(text);
  } catch {
    return text;
  }
}

/** 简体/繁体 → 日文新字体（OpenCC t2jp 属实验特性，仅作兜底，不保证正确） */
export function toJapaneseShinjitai(text: string): string {
  return safeConvert('jp', text);
}

// ─── 罗马音 / 拼音 ─────────────────────────────────────────────────────

function kanaToRomaji(text: string): string {
  try {
    return wanakana.toRomaji(text);
  } catch {
    return text;
  }
}

function toPinyinList(text: string): string[] {
  try {
    const list = pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
    const spaced = list.join(' ').replace(/\s+/g, ' ').trim();
    const compact = list.join('').replace(/\s+/g, '');
    return [spaced, compact].filter(Boolean);
  } catch {
    return [];
  }
}

// ─── 变体构建 ──────────────────────────────────────────────────────────

function pushVariant(
  out: QueryVariant[],
  seen: Set<string>,
  text: string,
  lang: VariantLang,
  transform: string,
  confidence: number
): void {
  const value = normalizeDisplay(text);
  if (!value) return;
  const key = aliasKey(value);
  // 同一文本在不同语言下含义不同（如简繁同形、日文新字体），去重必须带上语言
  const dedupeKey = `${lang}|${key}`;
  if (!key || seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  out.push({ text: value, lang, transform, confidence });
}

/**
 * 确定性地生成查询变体（不含任何网络/模型调用）。
 * 顺序即优先级：原文永远第一，其次按“变换可信度”排序。
 */
export function buildQueryVariants(input: string): QueryVariant[] {
  const original = normalizeDisplay(input);
  const variants: QueryVariant[] = [];
  const seen = new Set<string>();
  if (!original) return variants;

  const script = detectScript(original);
  const originalLang: VariantLang =
    script === 'ja' ? 'ja' : script === 'hangul' ? 'ko' : script === 'latin' ? 'en' : 'zh';
  pushVariant(variants, seen, original, originalLang, 'original', 1);
  if (script === 'code') return variants;

  // 拉丁输入：只做大写折叠。不把英文词硬转假名（wanakana 会把整句英文
  // 按罗马字音节拆成无意义假名，对任何源站都是噪声）。
  if (script === 'latin') {
    pushVariant(variants, seen, original.toLowerCase(), 'en', 'lowercase', 0.9);
    return variants;
  }

  // 汉字输入：简体/繁体/日文新字体/拼音
  if (HAS_HAN.test(original)) {
    const simplified = safeConvert('simp', original);
    pushVariant(variants, seen, simplified, 'zh', 'simplified', 0.95);
    const traditional = safeConvert('trad', original);
    pushVariant(variants, seen, traditional, 'zh-TW', 'traditional', 0.9);
    if (HAS_HAN.test(original)) {
      const jp = toJapaneseShinjitai(original);
      pushVariant(variants, seen, jp, 'ja', 'opencc-jp', 0.7);
    }
    for (const py of toPinyinList(original)) {
      pushVariant(variants, seen, py, 'pinyin', 'pinyin', 0.5);
    }
  }

  // 日文输入：假名转罗马音（供只索引罗马音的源站）
  if (HAS_KANA.test(original)) {
    pushVariant(variants, seen, kanaToRomaji(original), 'romaji', 'kana-romaji', 0.8);
  }

  return variants;
}
