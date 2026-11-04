/**
 * JavActressResultsPanel — JAV 女优搜索结果面板
 *
 * 女优资料与女优作品为两个连续区段，不再各自套独立卡片。
 */
import { useState } from 'react';
import { Heart, Users, MapPin, Calendar, Cake, Sparkles, SearchX, Film, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { JavEnrichedData, ActressProfile } from '@/types/search';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { convertToProxyUrl } from '@/services/proxy';
import { ShareToCommunityButton } from '@/components/community/ShareToCommunityButton';
import {
  PanelSection,
  PanelHeader,
  MediaCard,
  Chip,
  CountBadge,
  Pagination,
  EmptyBlock,
  Notice,
} from '@/components/workbench';

const PAGE_SIZE = 10;

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-surface-400" />
      <span className="type-micro shrink-0 text-surface-500">{label}</span>
      <span className="type-micro min-w-0 truncate font-medium text-surface-700 dark:text-surface-200">{value}</span>
    </div>
  );
}

interface ActressCardProps {
  item: ActressProfile;
  isFavorited: boolean;
  isAuthenticated: boolean;
  isProxyEnabled: boolean;
  onToggleFavorite: (actress: ActressProfile) => void;
  onLoginRequired: () => void;
}

function ActressCard({ item, isFavorited, isAuthenticated, isProxyEnabled, onToggleFavorite, onLoginRequired }: ActressCardProps) {
  const { t } = useTranslation(['jav']);
  const imgSrc = item.cover ? getProxyImageUrl(item.cover) : undefined;
  const detailHref = isProxyEnabled ? convertToProxyUrl(item.detailUrl) : item.detailUrl;

  const metrics: string[] = [];
  if (item.height) metrics.push(`T${item.height}`);
  if (item.bust && item.cup) metrics.push(`B${item.bust}(${item.cup})`);
  if (item.waist) metrics.push(`W${item.waist}`);
  if (item.hip) metrics.push(`H${item.hip}`);

  return (
    <div className="flex items-start gap-3 border-b border-surface-100 py-3 last:border-b-0 dark:border-surface-800/70">
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={item.name}
          loading="lazy"
          className="h-20 w-16 shrink-0 rounded-[10px] bg-surface-100 object-cover dark:bg-surface-800"
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          {item.detailUrl ? (
            <a
              href={detailHref}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-[15px] font-semibold text-surface-900 transition-colors hover:text-primary-600 dark:text-surface-100 dark:hover:text-primary-300"
            >
              {item.name}
            </a>
          ) : (
            <span className="truncate text-[15px] font-semibold text-surface-900 dark:text-surface-100">{item.name}</span>
          )}
        </div>

        {metrics.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {metrics.map((metric, index) => (
              <Chip key={`${metric}-${index}`} tone="accent" size="xs">{metric}</Chip>
            ))}
          </div>
        ) : null}

        <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {item.birthday ? <InfoRow icon={Calendar} label={t('jav:actressResults.birthday')} value={item.birthday} /> : null}
          {item.age !== undefined ? <InfoRow icon={Cake} label={t('jav:actressResults.age')} value={String(item.age)} /> : null}
          {item.prefecture ? <InfoRow icon={MapPin} label={t('jav:actressResults.prefecture')} value={item.prefecture} /> : null}
          {item.hobby ? <InfoRow icon={Sparkles} label={t('jav:actressResults.hobby')} value={item.hobby} /> : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => onToggleFavorite(item)}
          disabled={!isAuthenticated}
          aria-label={isFavorited ? t('jav:actressResults.unfavorite') : t('jav:actressResults.favorite')}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            isFavorited
              ? 'bg-error-50 text-error-500 dark:bg-error-900/20'
              : 'text-surface-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-900/20'
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${isFavorited ? 'fill-current' : ''}`} />
        </button>
        <ShareToCommunityButton
          postData={{
            postType: 'actress',
            title: item.name,
            coverImage: item.cover ? getProxyImageUrl(item.cover) : '',
            contentData: JSON.stringify({
              id: item.id,
              name: item.name,
              birthday: item.birthday,
              age: item.age,
              height: item.height,
              bust: item.bust,
              cup: item.cup,
              waist: item.waist,
              hip: item.hip,
              prefecture: item.prefecture,
              hobby: item.hobby,
              detailUrl: item.detailUrl,
              cover: item.cover,
            }),
          }}
          isAuthenticated={isAuthenticated}
          onLoginRequired={onLoginRequired}
          size="small"
        />
      </div>
    </div>
  );
}

export interface JavActressResultsPanelProps {
  data: JavEnrichedData;
  favoritedCodes: Set<string>;
  isAuthenticated: boolean;
  isProxyEnabled?: boolean;
  onToggleFavorite: (actress: ActressProfile) => void;
  onLoginRequired: () => void;
  onWorkClick?: (code: string) => void;
}

export function JavActressResultsPanel({
  data,
  favoritedCodes,
  isAuthenticated,
  isProxyEnabled = false,
  onToggleFavorite,
  onLoginRequired,
  onWorkClick,
}: JavActressResultsPanelProps) {
  const { t } = useTranslation(['jav']);
  const [page, setPage] = useState(1);
  const actresses = data.actresses ?? [];
  const works = data.actressWorks ?? [];
  const errorMsg = data.errors?.search;

  const actressSearchUrl = `https://www.javbus.com/searchstar/${encodeURIComponent(data.normalizedKeyword ?? data.keyword)}`;
  const actressSearchHref = isProxyEnabled ? convertToProxyUrl(actressSearchUrl) : actressSearchUrl;
  const worksSearchUrl = `https://www.javbus.com/search/${encodeURIComponent(data.normalizedKeyword ?? data.keyword)}`;
  const worksSearchHref = isProxyEnabled ? convertToProxyUrl(worksSearchUrl) : worksSearchUrl;

  const totalPages = Math.max(1, Math.ceil(actresses.length / PAGE_SIZE));
  const paged = actresses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <PanelSection>
        <PanelHeader
          icon={<Users className="h-4 w-4 text-accent-500" />}
          title={t('jav:actressResults.title')}
          count={actresses.length > 0 ? <CountBadge>{t('jav:actressResults.actressCount', { count: actresses.length })}</CountBadge> : undefined}
          actions={
            <a
              href={actressSearchHref}
              target="_blank"
              rel="noopener noreferrer"
              className="type-micro text-primary-500 hover:underline"
            >
              {t('jav:actressResults.javbusActressSearch')}
            </a>
          }
        />

        {actresses.length > 0 ? (
          <div className="px-4 pb-3 sm:px-5 sm:pb-4">
            {paged.map((item) => (
              <ActressCard
                key={item.id}
                item={item}
                isFavorited={favoritedCodes.has(`actress:${item.id}`)}
                isAuthenticated={isAuthenticated}
                isProxyEnabled={isProxyEnabled}
                onToggleFavorite={onToggleFavorite}
                onLoginRequired={onLoginRequired}
              />
            ))}
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              prevLabel={t('jav:actressResults.previousPage')}
              nextLabel={t('jav:actressResults.nextPage')}
              totalLabel={t('jav:actressResults.totalCount', { count: actresses.length })}
            />
          </div>
        ) : (
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            {errorMsg ? (
              <Notice tone="error">{t('jav:actressResults.searchFailed', { message: errorMsg })}</Notice>
            ) : (
              <EmptyBlock
                icon={<SearchX className="h-7 w-7" />}
                title={t('jav:actressResults.notFound')}
                className="bg-transparent"
              />
            )}
          </div>
        )}
      </PanelSection>

      {works.length > 0 ? (
        <PanelSection>
          <PanelHeader
            icon={<Film className="h-4 w-4 text-accent-500" />}
            title={t('jav:actressResults.worksTitle')}
            count={<CountBadge>{t('jav:actressResults.worksCount', { count: works.length })}</CountBadge>}
            actions={
              <a
                href={worksSearchHref}
                target="_blank"
                rel="noopener noreferrer"
                className="type-micro inline-flex items-center gap-1 text-primary-500 hover:underline"
              >
                {t('jav:actressResults.javbusSearch')}
                <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {works.map((work, index) => (
                <MediaCard
                  key={`${work.code}-${index}`}
                  orientation="tile"
                  cover={work.cover ? getProxyImageUrl(work.cover) : undefined}
                  coverFallback={<Film className="h-6 w-6" />}
                  title={work.title}
                  badges={
                    <>
                      <Chip tone="accent" size="xs">{work.code}</Chip>
                      {work.date ? <Chip tone="neutral" size="xs">{work.date}</Chip> : null}
                    </>
                  }
                  onSelect={onWorkClick ? () => onWorkClick(work.code) : undefined}
                />
              ))}
            </div>
            {onWorkClick ? (
              <p className="type-micro mt-3 text-center text-surface-400">{t('jav:actressResults.workClickHint')}</p>
            ) : null}
          </div>
        </PanelSection>
      ) : null}
    </>
  );
}
