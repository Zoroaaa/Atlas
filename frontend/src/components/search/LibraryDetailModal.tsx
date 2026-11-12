import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, BookOpen, Building2, Calendar, Clock, ExternalLink,
  FileDown, Film, Heart, Magnet, RefreshCw, Search, Star, Tag, Tv,
  User, Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Modal, Loading, ProxyImage } from '@/components/ui';
import { CopyButton } from '@/components/ui/CopyButton';
import { Chip, CountBadge, EmptyBlock, ResourceRow } from '@/components/workbench';
import { libraryApi } from '@/services/api';
import type { LibraryRecord, LibraryRecordSource, LibraryRecordType } from '@/services/api/library';
import { normalizeImageUrl } from '@/utils/imageProxy';

/**
 * 搜索历史 / 收藏点击后的详情卡片。
 *
 * 数据全部来自本地库（/api/library/record），按五个搜索类别分派渲染，
 * 每类沿用该类别搜索结果现有的详情展示形态（JAV 走详情面板结构，
 * 动漫/影视/漫画/小说走各自的媒体卡 + 资源行）。
 */
export interface LibraryDetailTarget {
  /** 搜索类别提示：历史记录的 source */
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

// ─── 片段 ────────────────────────────────────────────────────────────

const InfoRow: React.FC<{ icon: React.ElementType; label: string; value?: string }> = ({ icon: Icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-surface-400" />
      <span className="shrink-0 text-surface-500">{label}：</span>
      <span className="break-all text-surface-700 dark:text-surface-300">{value}</span>
    </div>
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

// ─── 类别内容 ────────────────────────────────────────────────────────

const JavBody: React.FC<{ record: LibraryRecord; t: TFunction }> = ({ record, t }) => {
  const extra = record.contentData;
  const detailUrl = str(extra.detailUrl);
  const magnets = magnetSources(record);
  const actresses = strList(extra.actresses);
  const actors = actresses.length > 0 ? actresses : record.actors;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {record.cover ? (
          <ProxyImage
            src={normalizeImageUrl(resolveUrl(record.cover, detailUrl))}
            alt={record.code || record.title}
            className="h-auto w-[120px] shrink-0 rounded-[10px] bg-surface-100 object-cover dark:bg-surface-800"
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {record.code ? <Chip tone="accent">{record.code}</Chip> : null}
            {record.rating ? <Chip tone="warning" size="xs">{record.rating}</Chip> : null}
          </div>
          <h3 className="text-[14px] font-semibold leading-snug text-surface-900 dark:text-surface-100">{record.title}</h3>
          <InfoRow icon={Calendar} label={t('jav:detail.releaseDate')} value={record.releaseDate} />
          <InfoRow icon={Clock} label={t('jav:detail.duration')} value={record.duration} />
          <InfoRow icon={User} label={t('jav:detail.director')} value={str(extra.director)} />
          <InfoRow icon={Building2} label={t('jav:detail.maker')} value={str(extra.maker)} />
          <InfoRow icon={Building2} label={t('jav:detail.publisher')} value={record.publisher} />
          <InfoRow icon={Film} label={t('jav:detail.series')} value={str(extra.series)} />
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
          <div className="flex flex-wrap gap-1.5">
            {record.tags.map((tag) => <Chip key={tag} tone="neutral" size="xs">{tag}</Chip>)}
          </div>
        </div>
      ) : null}

      {actors.length > 0 ? (
        <div>
          <SectionLabel icon={Users} text={t('jav:detail.actressesLabel')} />
          <div className="flex flex-wrap gap-1.5">
            {Array.from(new Set(actors)).map((name) => <Chip key={name} tone="accent" size="xs">{name}</Chip>)}
          </div>
        </div>
      ) : null}

      <div>
        <SectionLabel icon={Magnet} text={t('jav:detail.magnetsHeader')} count={magnets.length} />
        {magnets.length > 0 ? (
          <div className="max-h-64 overflow-y-auto">
            <SourceRows sources={magnets} t={t} />
          </div>
        ) : (
          <p className="type-micro text-surface-500">{t('jav:detail.noMagnets')}</p>
        )}
      </div>
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
            className="h-auto w-[120px] shrink-0 rounded-[10px] bg-surface-100 object-cover dark:bg-surface-800"
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
  const source = str(extra.source);
  const poster = str(extra.backdrop) || str(extra.poster) || record.cover;
  const externalId = num(extra.id);
  const externalUrl = externalId != null && mediaType
    ? source === 'douban'
      ? `https://movie.douban.com/subject/${Math.abs(externalId)}/`
      : `https://www.themoviedb.org/${mediaType}/${externalId}`
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {poster ? (
          <img
            src={normalizeImageUrl(poster)}
            alt={record.title}
            className="h-24 w-[168px] shrink-0 rounded-[10px] bg-surface-100 object-cover dark:bg-surface-800"
            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="text-[14px] font-semibold leading-snug text-surface-900 dark:text-surface-100">{record.title}</h3>
          {originalTitle && originalTitle !== record.title ? <p className="type-micro text-surface-500">{originalTitle}</p> : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {source ? (
              <Chip tone={source === 'douban' ? 'success' : 'source'} size="xs">
                {source === 'douban' ? t('search:movie.sourceDouban') : t('search:movie.sourceTMDB')}
              </Chip>
            ) : null}
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
            className="h-auto w-[120px] shrink-0 rounded-[10px] bg-surface-100 object-cover dark:bg-surface-800"
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
            className="h-auto w-[96px] shrink-0 rounded-[10px] bg-surface-100 object-cover dark:bg-surface-800"
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

// ─── 主组件 ──────────────────────────────────────────────────────────

export const LibraryDetailModal: React.FC<LibraryDetailModalProps> = ({ target, onClose, onSearch }) => {
  const { t } = useTranslation(['search', 'jav']);
  const [status, setStatus] = useState<Status>('idle');
  const [record, setRecord] = useState<LibraryRecord | null>(null);
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

    switch (record.recordType) {
      case 'jav':
        return <JavBody record={record} t={t} />;
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
