import React from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from '@/components/workbench';
import { releaseCountdownDays } from '@/utils/releaseCountdown';

interface ReleaseCountdownChipProps {
  releaseDate?: string;
}

/** 即将发售倒计时：只在今天及未来发售时渲染 */
export const ReleaseCountdownChip: React.FC<ReleaseCountdownChipProps> = ({ releaseDate }) => {
  const { t } = useTranslation(['follow']);
  const days = releaseCountdownDays(releaseDate);
  if (days === null || days < 0) return null;

  return (
    <Chip tone="accent" size="xs">
      {days === 0 ? t('follow:releaseToday') : t('follow:releaseInDays', { days })}
    </Chip>
  );
};
