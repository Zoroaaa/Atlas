/**
 * 技术/发行属性标签过滤
 *
 * 这些标签描述画质、字幕、码制、发行形式，不是内容偏好，
 * 不管覆盖率高低都不应成为推荐依据。
 *
 * 注意：不再按 df/N 剔除大众标签；大众标签是否占满推荐位由分配逻辑解决。
 */
import { valueKey } from './recommendation-utils';

const TECHNICAL_TAGS = new Set(
  [
    // 画质 / 格式
    '高画质', '高画質', '高畫質', '高清', 'hd', 'fhd', 'uhd', '4k', '8k', 'sd',
    '高画质版', '高画質版', '高畫質版', '高清版', '高清修复', 'hd版', '4k版', '8k版',
    '高画质配信', '高画質配信', '高码率', '高帧率', '60帧', '60fps',
    'hdr', '杜比', 'dolby', 'remux', '蓝光', 'blu-ray', 'bd', 'dvd',
    // 字幕 / 语言
    '中文字幕', '中字', '字幕', '中文',
    '繁体字幕', '繁體字幕', '简繁字幕', '簡繁字幕',
    '英文字幕', '英字', '无字幕', '無字幕', '字幕付', '字幕付き',
    '内嵌字幕', '外挂字幕', '简中', '繁中', '简体', '繁体',
    // 发行 / 版本
    '单体作品', '單體作品', '単体作品', '单发', '單發', '単発',
    '合集', '总集篇', '總集篇', '精选', '精選', 'best', 'best版', '完全版',
    '重制版', '重製版', '复刻版', '復刻版', '复活版', '復活版',
    '无删减', '無刪減', '未删减', '未刪減',
    '无修正', '無修正', '无修', '破解', '破解版',
    '限定版', '初回限定', '初回版', '特典', '特典映像',
    // 码制
    '有码', '有碼', '无码', '無碼', '无码流出', '無碼流出',
    '无码破解', '無碼破解', '流出',
    // 独家 / 渠道
    '独家', '獨家', '独占', '獨佔', '独家配信', '獨家配信', '独占配信', '獨佔配信',
    '配信限定', '限定配信',
    'dmm限定', 'fanza限定',
    'dmm独家', 'dmm獨家', 'dmm独占', 'dmm獨佔', 'dmm专属', 'dmm專屬',
    'dmm専売', 'dmm専属',
    'fanza独家', 'fanza獨家', 'fanza独占', 'fanza獨佔',
    'fanza专属', 'fanza專屬',
  ].map(valueKey)
);

export function isTechnicalTagKey(key: string): boolean {
  return TECHNICAL_TAGS.has(key);
}

export function isTechnicalTag(tag: string): boolean {
  return isTechnicalTagKey(valueKey(tag));
}

/** 从种子/画像标签中剔除技术标签 */
export function filterContentTags(tags: string[]): string[] {
  return tags.filter((tag) => !isTechnicalTag(tag));
}
