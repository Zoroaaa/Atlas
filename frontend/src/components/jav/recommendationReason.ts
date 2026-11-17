import type { TFunction } from 'i18next';
import type { JavRecommendationItem } from '@/types';

/** 推荐卡片上的理由文案：面板与移动端横滑卡片共用，避免两处判断分叉。 */
export function reasonText(t: TFunction, item: JavRecommendationItem): string {
  switch (item.reason.type) {
    case 'ranking':
      return item.reason.period === 'weekly'
        ? t('jav:recommend.reasonRankingWeekly', { rank: item.rank ?? '' })
        : t('jav:recommend.reasonRankingMonthly', { rank: item.rank ?? '' });
    case 'actor':
      return item.reason.value
        ? t('jav:recommend.reasonActor', { value: item.reason.value })
        : t('jav:recommend.reasonPopular');
    case 'tag':
      return t('jav:recommend.reasonTag', { value: item.reason.value ?? '' });
    case 'publisher':
      return t('jav:recommend.reasonPublisher', { value: item.reason.value ?? '' });
    default:
      return t('jav:recommend.reasonPopular');
  }
}
