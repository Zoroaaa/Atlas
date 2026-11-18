/**
 * 本地库详情卡：历史 / 收藏 / 关注动态 / 发现页点击影片的统一入口，按五个类别分派渲染。
 *
 * 数据只读 /api/library/record；JAV 记录无磁力时须给出回源或重新搜索出口，不能显示空详情。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, BookOpen, Building2, Calendar, Clock, ExternalLink,
  FileDown, Film, Heart, Loader2, Magnet, RefreshCw, Search, Star, Tag, Tv,
  User, Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Modal, Loading, ProxyImage } from '@/components/ui';
import { CopyButton } from '@/components/ui/CopyButton';
import { Chip, CountBadge, EmptyBlock, ResourceRow } from '@/components/workbench';
import { libraryApi, apiClient } from '@/services/api';
import { useToast } from '@/hooks/useNotification';
import type { LibraryRecord, LibraryRecordSource, LibraryRecordType } from '@/services/api/library';
import type { JavEntityKind, JavEntityLink, JavEntityTarget } from '@/types';
import { JavEntityWorksPanel } from '@/components/jav/JavEntityWorksPanel';
import { JavRecommendationsPanel } from '@/components/jav/JavRecommendationsPanel';
import { JavActressList, JavPlayOnlineEntry, JavTagButton, JAV_ENTITY_LINK_CLASS } from '@/components/jav/JavDetailShared';
import { normalizeImageUrl } from '@/utils/imageProxy';

/** 本地存档详情封面：始终按原图比例展示（object-contain），移动端铺满整行，PC 端限宽，高度随图片比例自适应 */
const DETAIL_COVER_CLASS = 'w-full shrink-0 self-start rounded-[10px] bg-surface-100 object-contain dark:bg-surface-800 sm:w-[240px]';

/** 详情卡入参：类别提示用于在本地记录未命中时回退到对应搜索 */
export interface LibraryDetailTarget {
  /** 类别提示：来源页面传入的类别（历史记录的 source、榜单的记录类型等） */
  type?: string;
  code?: string;
  url?: string;
  title?: string;
}

interface LibraryDetailModalProps {
  target: LibraryDetailTarget | null;
  onClose: () => void;
  /** 查不到本地存档时，用户主动跳到搜索 */
  onSearch?: (keyword: string, type?: LibraryRecordType) => void;
  /** 点击演员：与搜索详情卡片一致，复用现有的女优搜索卡片路径 */
  onActressClick?: (name: string) => void;
}

type Status = 'idle' | 'loading' | 'success' | 'not_found' | 'error';

const RECORD_TYPES: LibraryRecordType[] = ['jav', 'anime', 'movie', 'manga', 'novel'];

const isRecordType = (value?: string): value is LibraryRecordType =>
  !!value && (RECORD_TYPES as string[]).includes(value);

const TYPE_LABEL_KEY: Record<LibraryRecordType, string> = {
  jav: 'search:libraryDetail.type.jav',
  anime: 'search:libraryDetail.type.anime',
  movie: 'search:libraryDetail.type.movie',
  manga: 'search:libraryDetail.type.manga',
  novel: 'search:libraryDetail.type.novel',
};

const typeLabel = (t: TFunction, tf?: string | number) => {
  const map: Record<string | number, string> = {
    2: 'TV',
    6: t('search:anime.type.movie'),
    4: 'Web',
    3: t('search:anime.type.music'),
    tv: 'TV',
    movie: t('search:anime.type.movie'),
    ova: 'OVA',
    web: 'Web',
    music: t('search:anime.type.music'),
  };
  return tf != null ? (map[tf] ?? String(tf)) : '';
};

const ratingColor = (n: number) =>
  n >= 8 ? 'text-success-500' : n >= 6 ? 'text-warning-500' : 'text-surface-400';

const resolveUrl = (relativePath: string, referenceUrl?: string): string => {
  if (!relativePath) return '';
  if (!referenceUrl) return relativePath;
  try {
    return new URL(relativePath, new URL(referenceUrl)).href;
  } catch {
    return relativePath;
  }
};

const magnetSources = (record: LibraryRecord): LibraryRecordSource[] =>
  record.sources.filter((s) => s.sourceUrl?.startsWith('magnet:'));

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];

const JAV_ENTITY_KINDS: JavEntityKind[] = ['director', 'studio', 'label', 'series', 'tag'];

/** 从 content_data 读取实体链接；老记录没有该字段时返回空数组，交给点击时回源解析 */
const readEntityLinks = (extra: Record<string, unknown>, key: string): JavEntityLink[] => {
  const value = extra[key];
  if (!Array.isArray(value)) return [];
  const links: JavEntityLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const kind = str(entry.kind);
    const name = str(entry.name);
    const path = str(entry.path);
    if (!kind || !name || !path) continue;
    if (!JAV_ENTITY_KINDS.includes(kind as JavEntityKind)) continue;
    if (!links.some((link) => link.name === name)) {
      links.push({ kind: kind as JavEntityKind, name, path });
    }
  }
  return links;
};

const findEntityPath = (links: JavEntityLink[], name?: string): string | undefined => {
  if (links.length === 0) return undefined;
  if (!name) return links[0]?.path;
  const exact = links.find((link) => link.name === name);
  if (exact) return exact.path;
  // 多值字段用 " / " 拼接（如发行商 A / B），按包含关系匹配第一个
  return (links.find((link) => name.includes(link.name)) ?? links[0])?.path;
};

// ── 片段 ─────────────────────────────────────────────────────────────

const InfoRow: React.FC<{
  icon: React.ElementType;
  label: string;
  value?: string;
  onClick?: () => void;
}> = ({ icon: Icon, label, value, onClick }) => {
  if (!value) return null;
  const content = (
    <>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-surface-400" />
      <span className="shrink-0 text-surface-500">{label}：</span>
      <span
        className={
          onClick
            ? `break-all ${JAV_ENTITY_LINK_CLASS} group-hover:text-primary-500`
            : 'break-all text-surface-700 dark:text-surface-300'
        }
      >
        {value}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="flex items-start gap-2 text-[12px]">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={value}
      className="group flex items-start gap-2 text-left text-[12px]"
    >
      {content}
    </button>
  );
};

const SectionLabel: React.FC<{ icon: React.ElementType; text: string; count?: number }> = ({ icon: Icon, text, count }) => (
  <div className="mb-1.5 flex items-center gap-1.5">
    <Icon className="h-3.5 w-3.5 text-surface-400" />
    <span className="type-micro font-medium text-surface-500">{text}</span>
    {count != null ? <CountBadge>{count}</CountBadge> : null}
  </div>
);

const SourceRows: React.FC<{ sources: LibraryRecordSource[]; t: TFunction }> = ({ sources, t }) => (
  <div className="divide-y divide-surface-100 dark:divide-surface-800/70">
    {sources.map((source, index) => {
      const data = source.sourceData;
      const isMagnet = !!source.sourceUrl?.startsWith('magnet:');
      const meta = [str(data.size), str(data.date)].filter(Boolean) as string[];
      return (
        <ResourceRow
          key={`${source.sourceUrl}-${index}`}
          badges={<Chip tone="source" size="xs">{source.sourceName}</Chip>}
          title={
            <a
              href={source.sourceUrl ?? undefined}
              target={isMagnet ? undefined : '_blank'}
              rel={isMagnet ? undefined : 'noopener noreferrer'}
              className="block truncate text-[12px] text-primary-600 hover:underline dark:text-primary-400"
            >
              {str(data.name) || str(data.title) || source.sourceUrl}
            </a>
          }
          meta={meta}
          trailing={isMagnet ? <CopyButton text={source.sourceUrl!} label={t('search:libraryDetail.copyMagnet')} /> : undefined}
        />
      );
    })}
  </div>
);

// ── 类别内容 ─────────────────────────────────────────────────────────

const JavBody: React.FC<{
  record: LibraryRecord;
  t: TFunction;
  onCodeClick?: (code: string) => void;
  onActressClick?: (name: string) => void;
  onPullExternal?: () => void;
  isPullingExternal?: boolean;
}> = ({ record, t, onCodeClick, onActressClick, onPullExternal, isPullingExternal }) => {
  const extra = record.contentData;
  const detailUrl = str(extra.detailUrl);
  const magnets = magnetSources(record);
  const actresses = strList(extra.actresses);
  // 新记录演员写在 content_data.actresses，老记录只有顶层 actors，逐级回退
  const actors = actresses.length > 0 ? actresses : record.actors;
  const publisher = str(extra.publisher) ?? record.publisher;
  const directorLinks = readEntityLinks(extra, 'directorLinks');
  const makerLinks = readEntityLinks(extra, 'makerLinks');
  const publisherLinks = readEntityLinks(extra, 'publisherLinks');
  const seriesLinks = readEntityLinks(extra, 'seriesLinks');
  const tagLinks = readEntityLinks(extra, 'tagLinks');
  const [entityTarget, setEntityTarget] = useState<JavEntityTarget | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {record.cover ? (
          <ProxyImage
            src={normalizeImageUrl(resolveUrl(record.cover, detailUrl))}
            alt={record.code || record.title}
            className={DETAIL_COVER_CLASS}
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {record.code ? <Chip tone="accent">{record.code}</Chip> : null}
              {record.rating ? <Chip tone="warning" size="xs">{record.rating}</Chip> : null}
            </div>
            {onPullExternal ? (
              <button
                type="button"
                onClick={onPullExternal}
                disabled={isPullingExternal}
                title={t('jav:detail.pullExternal')}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-surface-200 bg-white px-2 text-[10px] font-medium text-surface-600 transition-colors hover:border-primary-300 hover:text-primary-600 disabled:opacity-60 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300 dark:hover:border-primary-700 dark:hover:text-primary-300"
              >
                {isPullingExternal ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                <span className="whitespace-nowrap">{t('jav:detail.pullExternalShort')}</span>
              </button>
            ) : null}
          </div>
          <h3 className="text-[14px] font-semibold leading-snug text-surface-900 dark:text-surface-100">{record.title}</h3>
          <InfoRow icon={Calendar} label={t('jav:detail.releaseDate')} value={record.releaseDate} />
          <InfoRow icon={Clock} label={t('jav:detail.duration')} value={record.duration} />
          <InfoRow
            icon={User}
            label={t('jav:detail.director')}
            value={str(extra.director)}
            onClick={str(extra.director) ? () => setEntityTarget({
              kind: 'director',
              name: str(extra.director)!,
              path: findEntityPath(directorLinks, str(extra.director)),
              code: record.code,
            }) : undefined}
          />
          <InfoRow
            icon={Building2}
            label={t('jav:detail.maker')}
            value={str(extra.maker)}
            onClick={str(extra.maker) ? () => setEntityTarget({
              kind: 'studio',
              name: str(extra.maker)!,
              path: findEntityPath(makerLinks, str(extra.maker)),
              code: record.code,
            }) : undefined}
          />
          <InfoRow
            icon={Building2}
            label={t('jav:detail.publisher')}
            value={publisher}
            onClick={publisher ? () => setEntityTarget({
              kind: 'label',
              name: publisher,
              path: findEntityPath(publisherLinks, publisher),
              code: record.code,
            }) : undefined}
          />
          <InfoRow
            icon={Film}
            label={t('jav:detail.series')}
            value={str(extra.series)}
            onClick={str(extra.series) ? () => setEntityTarget({
              kind: 'series',
              name: str(extra.series)!,
              path: findEntityPath(seriesLinks, str(extra.series)),
              code: record.code,
            }) : undefined}
          />
          {detailUrl ? (
            <a
              href={detailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary-500 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t('search:libraryDetail.openDetail')}
            </a>
          ) : null}
        </div>
      </div>

      {record.tags.length > 0 ? (
        <div>
          <SectionLabel icon={Tag} text={t('jav:detail.tagsLabel')} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {record.tags.map((tag) => (
              <JavTagButton
                key={tag}
                tag={tag}
                onClick={() => setEntityTarget({
                  kind: 'tag',
                  name: tag,
                  path: findEntityPath(tagLinks, tag),
                  code: record.code,
                })}
              />
            ))}
          </div>
        </div>
      ) : null}

      {actors.length > 0 ? (
        <div>
          <SectionLabel icon={Users} text={t('jav:detail.actressesLabel')} />
          <JavActressList actresses={actors} onActressClick={onActressClick} />
        </div>
      ) : null}

      <JavPlayOnlineEntry code={record.code} />

      <div>
        <SectionLabel icon={Magnet} text={t('jav:detail.magnetsHeader', { count: magnets.length })} />
        {magnets.length > 0 ? (
          <div className="max-h-64 overflow-y-auto">
            <SourceRows sources={magnets} t={t} />
          </div>
        ) : (
          <p className="type-micro text-surface-500">{t('jav:detail.noMagnets')}</p>
        )}
      </div>

      {record.code && onCodeClick ? (
        <JavRecommendationsPanel
          variant="related"
          layout="embedded"
          seed={{
            code: record.code,
            actors,
            tags: record.tags,
            publisher: publisher ?? str(extra.maker),
          }}
          excludeCodes={[record.code]}
          onCodeClick={onCodeClick}
        />
      ) : null}

      <JavEntityWorksPanel
        entity={entityTarget}
        onClose={() => setEntityTarget(null)}
        onCodeClick={onCodeClick}
      />
    </div>
  );
};

const AnimeBody: React.FC<{ record: LibraryRecord; t: TFunction }> = ({ record, t }) => {
  const extra = record.contentData;
  const magnets = magnetSources(record);
  const name = str(extra.name);
  const nameCN = str(extra.nameCN);
  const rating = num(extra.rating);
  const eps = num(extra.eps);
  const collect = (extra.collection as { collect?: number; doing?: number } | undefined) ?? {};
  const summary = str(extra.summary);
  const tags = strList(extra.tags);
  const subjectUrl = str(extra.url);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {record.cover ? (
          <ProxyImage
            src={normalizeImageUrl(record.cover)}
            alt={record.title}
            className={DETAIL_COVER_CLASS}
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="text-[14px] font-semibold leading-snug text-surface-900 dark:text-surface-100">{record.title}</h3>
          {name && nameCN && name !== nameCN ? <p className="type-micro text-surface-500">{name}</p> : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {extra.type != null ? <Chip tone="warning" size="xs">{typeLabel(t, extra.type as string | number)}</Chip> : null}
            {str(extra.status) ? <Chip tone="success" size="xs">{str(extra.status)}</Chip> : null}
            {rating ? (
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${ratingColor(rating)}`}>
                <Star className="h-3 w-3 fill-current" />{rating.toFixed(1)}
              </span>
            ) : null}
            {eps ? (
              <span className="type-micro inline-flex items-center gap-0.5 text-surface-500">
                <Tv className="h-2.5 w-2.5" />{t('search:anime.epsCount', { count: eps })}
              </span>
            ) : null}
            {str(extra.airDate) ? (
              <span className="type-micro inline-flex items-center gap-0.5 text-surface-500">
                <Calendar className="h-2.5 w-2.5" />{str(extra.airDate)!.slice(0, 7)}
              </span>
            ) : null}
            {collect.collect ? (
              <span className="type-micro inline-flex items-center gap-0.5 text-surface-500">
                <Heart className="h-2.5 w-2.5 text-error-400" />{collect.collect}
              </span>
            ) : null}
          </div>
          {record.publisher || str(extra.studio) ? (
            <InfoRow icon={Building2} label={t('search:libraryDetail.studio')} value={record.publisher || str(extra.studio)} />
          ) : null}
          {subjectUrl ? (
            <a
              href={subjectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary-500 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t('search:libraryDetail.openDetail')}
            </a>
          ) : null}
        </div>
      </div>

      {summary ? <p className="text-[12px] leading-relaxed text-surface-600 dark:text-surface-300">{summary}</p> : null}

      {tags.length > 0 ? (
        <div>
          <SectionLabel icon={Tag} text={t('jav:detail.tagsLabel')} />
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => <Chip key={tag} tone="neutral" size="xs">{tag}</Chip>)}
          </div>
        </div>
      ) : null}

      <div>
        <SectionLabel icon={Magnet} text={t('search:libraryDetail.resources')} count={magnets.length} />
        {magnets.length > 0 ? (
          <div className="max-h-64 overflow-y-auto"><SourceRows sources={magnets} t={t} /></div>
        ) : (
          <p className="type-micro text-surface-500">{t('search:libraryDetail.noResources')}</p>
        )}
      </div>
    </div>
  );
};

const MovieBody: React.FC<{ record: LibraryRecord; t: TFunction }> = ({ record, t }) => {
  const extra = record.contentData;
  const resources = record.sources.filter((s) => s.sourceUrl);
  const rating = num(extra.rating);
  const year = str(extra.year) || str(extra.releaseDate)?.slice(0, 4);
  const overview = str(extra.overview);
  const originalTitle = str(extra.originalTitle);
  const mediaType = str(extra.mediaType);
  const poster = str(extra.backdrop) || str(extra.poster) || record.cover;
  const externalId = num(extra.id);
  const externalUrl = externalId != null && mediaType
    ? `https://www.themoviedb.org/${mediaType}/${externalId}`
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {poster ? (
          <ProxyImage
            src={normalizeImageUrl(poster)}
            alt={record.title}
            className={DETAIL_COVER_CLASS}
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="text-[14px] font-semibold leading-snug text-surface-900 dark:text-surface-100">{record.title}</h3>
          {originalTitle && originalTitle !== record.title ? <p className="type-micro text-surface-500">{originalTitle}</p> : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {mediaType ? (
              <Chip tone={mediaType === 'movie' ? 'warning' : 'accent'} size="xs">
                {mediaType === 'movie' ? t('search:movie.type.movie') : t('search:movie.type.tv')}
              </Chip>
            ) : null}
            {year ? <Chip tone="neutral" size="xs">{year}</Chip> : null}
            {rating ? (
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${ratingColor(rating)}`}>
                <Star className="h-3 w-3 fill-current" />{rating.toFixed(1)}
              </span>
            ) : null}
          </div>
          {record.releaseDate ? (
            <InfoRow icon={Calendar} label={t('search:libraryDetail.releaseDate')} value={record.releaseDate} />
          ) : null}
          {externalUrl ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary-500 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t('search:libraryDetail.openDetail')}
            </a>
          ) : null}
        </div>
      </div>

      {overview ? <p className="text-[12px] leading-relaxed text-surface-600 dark:text-surface-300">{overview}</p> : null}

      <div>
        <SectionLabel icon={FileDown} text={t('search:libraryDetail.resources')} count={resources.length} />
        {resources.length > 0 ? (
          <div className="max-h-64 overflow-y-auto"><SourceRows sources={resources} t={t} /></div>
        ) : (
          <p className="type-micro text-surface-500">{t('search:libraryDetail.noResources')}</p>
        )}
      </div>
    </div>
  );
};

const MangaBody: React.FC<{ record: LibraryRecord; t: TFunction }> = ({ record, t }) => {
  const extra = record.contentData;
  const status = str(extra.status);
  const id = str(extra.id);
  const mangadexUrl = id ? `https://mangadex.org/title/${id}` : undefined;

  const statusText = (() => {
    if (!status) return undefined;
    const map: Record<string, string> = {
      ongoing: t('search:manga.status.ongoing'),
      completed: t('search:manga.status.completed'),
      hiatus: t('search:manga.status.hiatus'),
      cancelled: t('search:manga.status.cancelled'),
    };
    return map[status] || status;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {record.cover ? (
          <ProxyImage
            src={normalizeImageUrl(record.cover)}
            alt={record.title}
            className={DETAIL_COVER_CLASS}
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="text-[14px] font-semibold leading-snug text-surface-900 dark:text-surface-100">{record.title}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {statusText ? <Chip tone={status === 'ongoing' ? 'success' : 'neutral'} size="xs">{statusText}</Chip> : null}
          </div>
          {mangadexUrl ? (
            <a
              href={mangadexUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary-500 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t('search:libraryDetail.openDetail')}
            </a>
          ) : null}
        </div>
      </div>

      {record.tags.length > 0 ? (
        <div>
          <SectionLabel icon={Tag} text={t('jav:detail.tagsLabel')} />
          <div className="flex flex-wrap gap-1.5">
            {record.tags.map((tag) => <Chip key={tag} tone="neutral" size="xs">{tag}</Chip>)}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const NovelBody: React.FC<{ record: LibraryRecord; t: TFunction }> = ({ record, t }) => {
  const extra = record.contentData;
  const author = str(extra.author);
  const description = str(extra.description);
  const detailUrl = str(extra.detailUrl);
  const meta = [author, record.publisher, str(extra.category)].filter(Boolean).join(' · ');
  const chips = [str(extra.format), str(extra.size), str(extra.year), str(extra.language)].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {record.cover ? (
          <ProxyImage
            src={normalizeImageUrl(record.cover)}
            alt={record.title}
            className={DETAIL_COVER_CLASS}
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="text-[14px] font-semibold leading-snug text-surface-900 dark:text-surface-100">{record.title}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => <Chip key={chip} tone="neutral" size="xs">{chip}</Chip>)}
          </div>
          {meta ? (
            <p className="type-micro inline-flex items-center gap-1 text-surface-500">
              <User className="h-2.5 w-2.5" />{meta}
            </p>
          ) : null}
          {detailUrl ? (
            <a
              href={detailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-500 px-3 text-[11px] font-medium text-white transition-colors hover:bg-primary-600"
            >
              <FileDown className="h-3.5 w-3.5" />
              {t('search:novel.detailDownload')}
            </a>
          ) : null}
        </div>
      </div>

      {description ? (
        <div>
          <SectionLabel icon={BookOpen} text={t('search:libraryDetail.description')} />
          <p className="text-[12px] leading-relaxed text-surface-600 dark:text-surface-300">{description}</p>
        </div>
      ) : null}
    </div>
  );
};

// ── 主组件 ───────────────────────────────────────────────────────────

/** 本地库详情弹窗：按记录类别渲染详情，未命中/缺资源时提供回源与重新搜索入口 */
export const LibraryDetailModal: React.FC<LibraryDetailModalProps> = ({ target, onClose, onSearch, onActressClick }) => {
  const { t } = useTranslation(['search', 'jav']);
  const toast = useToast();
  const [status, setStatus] = useState<Status>('idle');
  const [record, setRecord] = useState<LibraryRecord | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!target) return;
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setRecord(null);
    try {
      const result = await libraryApi.getRecord({
        type: target.type,
        code: target.code,
        url: target.url,
        title: target.title,
      });
      if (requestId !== requestIdRef.current) return;
      if (result.found && result.record) {
        setRecord(result.record);
        setStatus('success');
      } else {
        setStatus('not_found');
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('[LibraryDetailModal] load failed:', err);
      setStatus('error');
    }
  }, [target]);

  // 本地库命中后手动回源 JavBus：与搜索结果详情卡一致，refresh=1 会同步写回本地库
  const pullExternal = useCallback(async () => {
    const code = record?.code;
    if (!code || isPulling) return;
    setIsPulling(true);
    try {
      const res = await apiClient.get<{ success: boolean; message?: string }>(
        `/jav/detail?code=${encodeURIComponent(code)}&refresh=1`
      );
      if (res.success) {
        toast.success(t('jav:detail.pullExternalSuccess'));
        await load();
      } else {
        toast.error(t('jav:detail.pullExternalFailed'));
      }
    } catch (err) {
      toast.error(t('jav:detail.pullExternalFailed'), err instanceof Error ? err.message : undefined);
    } finally {
      setIsPulling(false);
    }
  }, [record?.code, isPulling, load, toast, t]);

  useEffect(() => {
    if (!target) {
      requestIdRef.current += 1;
      setStatus('idle');
      setRecord(null);
      return;
    }
    void load();
  }, [target, load]);

  const recordType = record?.recordType ?? (isRecordType(target?.type) ? target!.type! : undefined);
  const title = recordType
    ? `${t(TYPE_LABEL_KEY[recordType])} · ${t('search:libraryDetail.title')}`
    : t('search:libraryDetail.title');

  const keyword = target?.code || target?.title || '';
  const handleSearch = () => {
    if (onSearch && keyword) {
      onSearch(keyword, recordType);
      onClose();
    }
  };

  const renderBody = () => {
    if (status === 'loading' || status === 'idle') {
      return (
        <div className="flex min-h-[180px] items-center justify-center">
          <Loading text={t('search:libraryDetail.loading')} />
        </div>
      );
    }

    if (status === 'not_found') {
      return (
        <EmptyBlock
          icon={<Search className="h-7 w-7" />}
          title={t('search:libraryDetail.notFoundTitle')}
          hint={t('search:libraryDetail.notFoundHint')}
          action={
            onSearch && keyword ? (
              <button
                type="button"
                onClick={handleSearch}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-500 px-3 text-[11px] font-medium text-white transition-colors hover:bg-primary-600"
              >
                <Search className="h-3.5 w-3.5" />
                {t('search:libraryDetail.searchAgain')}
              </button>
            ) : undefined
          }
          className="bg-transparent"
        />
      );
    }

    if (status === 'error' || !record) {
      return (
        <EmptyBlock
          icon={<AlertCircle className="h-7 w-7" />}
          title={t('search:libraryDetail.loadFailedTitle')}
          hint={t('search:libraryDetail.loadFailedHint')}
          action={
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-500 px-3 text-[11px] font-medium text-white transition-colors hover:bg-primary-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('jav:detail.retry')}
            </button>
          }
          className="bg-transparent"
        />
      );
    }

    // JAV 本地记录可能只有元数据、没有磁力，直接渲染详情会像空页，先给「回源 JavBus / 重新搜索」两个出口
    if (record.recordType === 'jav' && magnetSources(record).length === 0) {
      return (
        <EmptyBlock
          icon={<Search className="h-7 w-7" />}
          title={t('search:libraryDetail.noMagnetTitle')}
          hint={t('search:libraryDetail.noMagnetHint')}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void pullExternal()}
                disabled={isPulling}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 text-[11px] font-medium text-surface-600 transition-colors hover:border-primary-300 hover:text-primary-600 disabled:opacity-60 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300 dark:hover:border-primary-700 dark:hover:text-primary-300"
              >
                {isPulling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {t('jav:detail.pullExternal')}
              </button>
              {onSearch && keyword ? (
                <button
                  type="button"
                  onClick={handleSearch}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-500 px-3 text-[11px] font-medium text-white transition-colors hover:bg-primary-600"
                >
                  <Search className="h-3.5 w-3.5" />
                  {t('search:libraryDetail.searchAgain')}
                </button>
              ) : null}
            </div>
          }
          className="bg-transparent"
        />
      );
    }

    switch (record.recordType) {
      case 'jav':
        return (
          <JavBody
            record={record}
            t={t}
            onActressClick={onActressClick}
            onPullExternal={record.code ? pullExternal : undefined}
            isPullingExternal={isPulling}
            onCodeClick={onSearch
              ? (code) => {
                  onSearch(code, 'jav');
                  onClose();
                }
              : undefined}
          />
        );
      case 'anime':
        return <AnimeBody record={record} t={t} />;
      case 'movie':
        return <MovieBody record={record} t={t} />;
      case 'manga':
        return <MangaBody record={record} t={t} />;
      case 'novel':
        return <NovelBody record={record} t={t} />;
      default:
        return null;
    }
  };

  return (
    <Modal isOpen={!!target} onClose={onClose} title={title} size="full">
      {renderBody()}
    </Modal>
  );
};
