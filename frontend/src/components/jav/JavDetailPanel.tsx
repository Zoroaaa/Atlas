import React, { useState, useCallback, useEffect } from 'react';
import {
  Magnet, Film, Calendar, Clock, User, Building2,
  Tag, Star, ExternalLink, Copy, Check, Loader2,
  AlertCircle, Search, ChevronDown, ChevronUp, ChevronRight, X,
  Shield, Play, FileDown, Heart, RefreshCw, ExternalLink as ExternalLinkIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { JavDetail, JavEntityLink, JavEntityTarget, MagnetItem } from '@/types';
import {
  downloadTorrentFile,
  getWebtorUrl,
  copyToClipboard,
} from '@/utils/magnet';
import { ProxyImage, Modal } from '@/components/ui';
import { PanelSection, ResourceRow, Chip, CountBadge, EmptyBlock, LoadingBlock } from '@/components/workbench';
import { ShareToCommunityButton } from '@/components/community';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { clsx } from 'clsx';
import { JavEntityWorksPanel } from './JavEntityWorksPanel';
import { JavActressList, JavTagButton, JAV_ENTITY_LINK_CLASS } from './JavDetailShared';
import { JAV_PLAY_PLATFORMS, buildJavPlayUrl } from '@/config/javPlayPlatforms';

const resolveUrl = (relativePath: string, referenceUrl: string): string => {
  try {
    const base = new URL(referenceUrl);
    return new URL(relativePath, base).href;
  } catch {
    return relativePath;
  }
};

interface JavDetailPanelProps {
  detail: JavDetail | null;
  status: 'idle' | 'loading' | 'success' | 'error' | 'not_found';
  onClose: () => void;
  onRetry?: () => void;
  onFavorite?: (detail: JavDetail) => void;
  isFavorited?: boolean;
  isAuthenticated?: boolean;
  onLoginRequired?: () => void;
  /** 本地库命中时，手动回源 JavBus 拉取最新详情 */
  onPullExternal?: () => void | Promise<void>;
  isPullingExternal?: boolean;
  /** 实体作品列表里点击作品后触发番号搜索 */
  onCodeClick?: (code: string) => void;
  /** 点击演员：复用现有的女优搜索卡片路径 */
  onActressClick?: (name: string) => void;
}

const findEntityPath = (links: JavEntityLink[] | undefined, name?: string): string | undefined => {
  if (!links?.length) return undefined;
  if (!name) return links[0]?.path;
  const exact = links.find((link) => link.name === name);
  if (exact) return exact.path;
  // 多值字段用 " / " 拼接（如发行商 A / B），按包含关系匹配第一个
  return (links.find((link) => name.includes(link.name)) ?? links[0])?.path;
};

// ── 复制按钮（带反馈） ─────────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation(['jav']);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      onClick={copy}
      title={label ?? t('jav:detail.copyMagnetTitle')}
      className="p-1 rounded text-surface-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-emerald-500" />
        : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── 下载种子按钮（带 loading） ─────────────────────────────────────

function DownloadBtn({ magnet, name }: { magnet: string; name: string }) {
  const { t } = useTranslation(['jav']);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await downloadTorrentFile(magnet, name);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={t('jav:detail.downloadTorrentTitle')}
      className="p-1 rounded text-surface-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all disabled:opacity-60"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
        : done
        ? <Check className="w-3.5 h-3.5 text-emerald-500" />
        : <FileDown className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── InfoRow ────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value?: string;
  onClick?: () => void;
}) {
  if (!value) return null;
  const content = (
    <>
      <Icon className="w-3.5 h-3.5 text-surface-400 mt-0.5 shrink-0" />
      <span className="text-surface-500 dark:text-surface-400 shrink-0">{label}：</span>
      <span
        className={clsx(
          'break-all',
          onClick
            ? clsx(JAV_ENTITY_LINK_CLASS, 'group-hover:text-primary-500')
            : 'text-surface-800 dark:text-surface-200'
        )}
      >
        {value}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="flex items-start gap-2 text-xs sm:text-sm">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={value}
      className="group flex items-start gap-2 text-left text-xs transition-colors hover:text-primary-500 sm:text-sm"
    >
      {content}
    </button>
  );
}

// ── 磁力列表 ───────────────────────────────────────────────────────

const MagnetList: React.FC<{ magnets: MagnetItem[] }> = ({ magnets }) => {
  const { t } = useTranslation(['jav']);
  const [showAll, setShowAll] = useState(false);
  const [playModal, setPlayModal] = useState<{ magnet: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const displayed = showAll ? magnets : magnets.slice(0, 5);

  const handleCopyMagnet = useCallback(async (magnet: string) => {
    const ok = await copyToClipboard(magnet);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleOpenWebtor = useCallback((magnet: string) => {
    window.open(getWebtorUrl(magnet), '_blank', 'noopener,noreferrer');
    setPlayModal(null);
  }, []);

  if (magnets.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center text-surface-400">
        <Magnet className="w-5 h-5 opacity-40" />
        <p className="text-xs">{t('jav:detail.noMagnets')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* 表头 */}
      <div className="hidden grid-cols-[minmax(0,1fr)_120px] items-center gap-2 border-b border-surface-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-surface-400 dark:border-surface-800 sm:grid">
        <span>{t('jav:detail.magnetName')}</span>
        <span className="text-right">{t('jav:detail.actions')}</span>
      </div>

      {displayed.map((m, i) => (
        <ResourceRow
          key={`${m.magnet}-${i}`}
          badges={m.isHD ? <Chip tone="source" size="xs">HD</Chip> : undefined}
          title={
            <a href={m.magnet} className="block truncate text-[12px] text-primary-600 hover:underline dark:text-primary-400" title={m.name}>
              {m.name}
            </a>
          }
          meta={[
            m.size,
            <span key="date" className="hidden sm:inline">{m.date}</span>,
          ]}
          trailing={
            <>
              <button
                type="button"
                onClick={() => setPlayModal({ magnet: m.magnet, name: m.name })}
                title={t('jav:detail.webtorPlay')}
                aria-label={t('jav:detail.webtorPlay')}
                className="flex h-7 w-7 items-center justify-center rounded-md text-surface-400 transition-colors hover:bg-success-50 hover:text-success-600 dark:hover:bg-success-900/20"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
              <DownloadBtn magnet={m.magnet} name={m.name} />
              <CopyBtn text={m.magnet} />
            </>
          }
        />
      ))}

      {magnets.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-surface-400 hover:text-primary-500 hover:bg-surface-50 dark:hover:bg-surface-800/40 rounded-lg transition-all"
        >
          {showAll
            ? <><ChevronUp className="w-3.5 h-3.5" />{t('jav:detail.collapseMagnets', { count: magnets.length })}</>
            : <><ChevronDown className="w-3.5 h-3.5" />{t('jav:detail.expandMagnets', { count: magnets.length })}</>}
        </button>
      )}

      {/* WebTor 播放提示弹窗 */}
      <Modal
        isOpen={!!playModal}
        onClose={() => setPlayModal(null)}
        title={t('jav:detail.playModalTitle')}
        size="sm"
      >
        {playModal && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 dark:text-amber-100">
                <p className="font-medium mb-1">{t('jav:detail.webtorWarnTitle')}</p>
                <p className="text-xs text-amber-700 dark:text-amber-200">
                  {t('jav:detail.webtorWarnBody')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-900 dark:text-emerald-100">
                <p className="font-medium mb-1">{t('jav:detail.pikpakRecommendTitle')}</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-200 leading-relaxed">
                  {t('jav:detail.pikpakRecommendBody')}
                  <span className="text-emerald-600 dark:text-emerald-300">{t('jav:detail.pikpakFreeStorage')}</span>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-surface-500 dark:text-surface-400">
                {t('jav:detail.magnetLink')}
              </label>
              <div className="p-2 bg-surface-100 dark:bg-surface-900 rounded text-xs text-surface-600 dark:text-surface-300 break-all font-mono max-h-20 overflow-y-auto">
                {playModal.magnet}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleCopyMagnet(playModal.magnet)}
                className="flex-1 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    {t('jav:detail.copied')}
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    {t('jav:detail.copyMagnetLink')}
                  </>
                )}
              </button>
              <button
                onClick={() => handleOpenWebtor(playModal.magnet)}
                className="flex-1 px-4 py-2.5 bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <ExternalLinkIcon className="w-4 h-4" />
                {t('jav:detail.goToWebtor')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ── 主组件 ─────────────────────────────────────────────────────────

export const JavDetailPanel: React.FC<JavDetailPanelProps> = ({ detail, status, onClose, onRetry, onFavorite, isFavorited, isAuthenticated = true, onLoginRequired, onPullExternal, isPullingExternal = false, onCodeClick, onActressClick }) => {
  const { t } = useTranslation(['jav']);
  // 封面按真实比例自适应：横版封面独占一行完整展示，竖版封面与信息并排
  const [coverLandscape, setCoverLandscape] = useState(false);
  const [playModalOpen, setPlayModalOpen] = useState(false);
  const [entityTarget, setEntityTarget] = useState<JavEntityTarget | null>(null);
  useEffect(() => { setCoverLandscape(false); }, [detail?.cover]);
  useEffect(() => { setEntityTarget(null); }, [detail?.code]);
  // 番号为空时不展示在线播放入口，避免生成无效链接
  const playCode = detail?.code?.trim();
  if (status === 'idle') return null;

  return (
    <PanelSection>
      {/* 窄屏：标题独占一行（仅保留关闭），操作按钮另起一行；桌面恢复单行原布局 */}
      <header className="panel-header flex-wrap gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-primary-600 dark:bg-surface-800 dark:text-primary-300">
            <Magnet className="h-4 w-4 text-accent-500" />
          </span>
          <span className="type-section-title min-w-0 truncate text-surface-900 dark:text-surface-100">
            {t('jav:detail.magnetExtract')}
          </span>
          {detail ? (
            // 桌面：番号与磁力数量留在标题行；窄屏移到第二行与操作并列
            <span className="hidden items-center gap-1.5 sm:flex">
              <Chip tone="accent">{detail.code}</Chip>
              {status === 'success' ? (
                <CountBadge>{t('jav:detail.magnetsCount', { count: detail.magnets.length })}</CountBadge>
              ) : null}
            </span>
          ) : null}
        </div>

        <div className="order-3 flex w-full min-w-0 items-center gap-1.5 sm:order-none sm:w-auto">
          {/* 窄屏第二行：番号 + 磁力数量（简写）靠左，操作靠右；桌面回收进标题行 */}
          {detail ? (
            <span className="flex min-w-0 items-center gap-1 sm:hidden">
              <Chip tone="accent">{detail.code}</Chip>
              {status === 'success' ? (
                <CountBadge>{t('jav:detail.magnetsCountShort', { count: detail.magnets.length })}</CountBadge>
              ) : null}
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
            {onPullExternal && detail?.fromLibrary && status === 'success' ? (
              <button
                type="button"
                onClick={() => void onPullExternal()}
                disabled={isPullingExternal}
                aria-label={t('jav:detail.pullExternal')}
                title={t('jav:detail.pullExternal')}
                className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-surface-500 transition-colors hover:bg-primary-50 hover:text-primary-600 disabled:opacity-60 dark:text-surface-400 dark:hover:bg-primary-900/20 sm:h-8"
              >
                <RefreshCw className={clsx('h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4', isPullingExternal && 'animate-spin')} />
                <span className="whitespace-nowrap">{t('jav:detail.pullExternalShort')}</span>
              </button>
            ) : null}
            {onFavorite && detail && status === 'success' ? (
              <button
                type="button"
                onClick={() => onFavorite(detail)}
                aria-label={isFavorited ? t('jav:detail.unfavorite') : t('jav:detail.favorite')}
                className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-medium transition-colors sm:h-8 ${
                  isFavorited
                    ? 'bg-error-50 text-error-500 dark:bg-error-900/20'
                    : 'text-surface-500 hover:bg-error-50 hover:text-error-500 dark:text-surface-400 dark:hover:bg-error-900/20'
                }`}
              >
                <Heart className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${isFavorited ? 'fill-current' : ''}`} />
                <span className="whitespace-nowrap">
                  {isFavorited ? t('jav:detail.favorited') : t('jav:detail.favoriteShort')}
                </span>
              </button>
            ) : null}
            {detail && status === 'success' ? (
              <ShareToCommunityButton
                postData={{
                  postType: 'jav',
                  title: detail.title || detail.code,
                  coverImage: detail.cover ? getProxyImageUrl(resolveUrl(detail.cover, detail.detailUrl)) : '',
                  contentData: JSON.stringify({
                    code: detail.code,
                    title: detail.title,
                    cover: detail.cover,
                    releaseDate: detail.releaseDate,
                    duration: detail.duration,
                    publisher: detail.publisher,
                    director: detail.director,
                    maker: detail.maker,
                    series: detail.series,
                    tags: detail.tags,
                    actresses: detail.actresses,
                    detailUrl: detail.detailUrl,
                    magnets: detail.magnets?.map(m => ({
                      title: m.name,
                      magnet: m.magnet,
                      size: m.size,
                      date: m.date,
                    })),
                  }),
                }}
                isAuthenticated={isAuthenticated}
                onLoginRequired={onLoginRequired}
                size="small"
                compactLabel={t('community:share.compact')}
                className="h-7 shrink-0 whitespace-nowrap sm:h-auto"
              />
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t('jav:detail.actions')}
          className="order-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-800 dark:hover:text-surface-200 sm:order-none"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <Modal
        isOpen={playModalOpen && !!playCode}
        onClose={() => setPlayModalOpen(false)}
        title={t('jav:detail.playOnlineTitle')}
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-xs text-surface-500 dark:text-surface-400">
            {t('jav:detail.playOnlineHint', { code: playCode })}
          </p>
          <div className="space-y-1.5">
            {JAV_PLAY_PLATFORMS.map((platform) => {
              const url = buildJavPlayUrl(platform, playCode);
              if (!url) return null;
              return (
                <a
                  key={platform.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setPlayModalOpen(false)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-surface-200 px-3 py-2.5 text-sm text-surface-700 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-surface-700 dark:text-surface-200 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
                >
                  <span className="font-medium">{platform.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-surface-400" />
                </a>
              );
            })}
          </div>
        </div>
      </Modal>

      {status === 'loading' ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <LoadingBlock rows={4} />
          <p className="type-micro mt-1 text-center text-surface-500">{t('jav:detail.loadingHint')}</p>
        </div>
      ) : null}

      {status === 'not_found' ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyBlock
            icon={<Search className="h-7 w-7" />}
            title={t('jav:detail.notFound')}
            hint={t('jav:detail.notFoundHint')}
            className="bg-transparent"
          />
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyBlock
            icon={<AlertCircle className="h-7 w-7" />}
            title={t('jav:detail.fetchFailed')}
            action={
              onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-500 px-3 text-[11px] font-medium text-white transition-colors hover:bg-primary-600"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('jav:detail.retry')}
                </button>
              ) : undefined
            }
            className="bg-transparent"
          />
        </div>
      ) : null}

      {status === 'success' && detail ? (
        <div className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
          <div className={clsx('flex flex-col gap-4', !coverLandscape && 'sm:flex-row sm:gap-5')}>
            {detail.cover ? (
              <ProxyImage
                src={getProxyImageUrl(resolveUrl(detail.cover, detail.detailUrl))}
                alt={detail.code}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setCoverLandscape(img.naturalWidth > img.naturalHeight);
                }}
                className={clsx(
                  'h-auto shrink-0 rounded-[10px] bg-surface-100 dark:bg-surface-800',
                  coverLandscape ? 'w-full max-w-2xl' : 'w-[96px] sm:w-[136px]'
                )}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-3 text-[14px] font-semibold leading-snug text-surface-900 dark:text-surface-100">
                {detail.title}
              </h3>
              <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                <InfoRow icon={Calendar} label={t('jav:detail.releaseDate')} value={detail.releaseDate} />
                <InfoRow icon={Clock} label={t('jav:detail.duration')} value={detail.duration} />
                <InfoRow
                  icon={User}
                  label={t('jav:detail.director')}
                  value={detail.director}
                  onClick={detail.director ? () => setEntityTarget({
                    kind: 'director',
                    name: detail.director!,
                    path: findEntityPath(detail.directorLinks, detail.director),
                    code: detail.code,
                  }) : undefined}
                />
                <InfoRow
                  icon={Building2}
                  label={t('jav:detail.maker')}
                  value={detail.maker}
                  onClick={detail.maker ? () => setEntityTarget({
                    kind: 'studio',
                    name: detail.maker!,
                    path: findEntityPath(detail.makerLinks, detail.maker),
                    code: detail.code,
                  }) : undefined}
                />
                <InfoRow
                  icon={Building2}
                  label={t('jav:detail.publisher')}
                  value={detail.publisher}
                  onClick={detail.publisher ? () => setEntityTarget({
                    kind: 'label',
                    name: detail.publisher!,
                    path: findEntityPath(detail.publisherLinks, detail.publisher),
                    code: detail.code,
                  }) : undefined}
                />
                <InfoRow
                  icon={Film}
                  label={t('jav:detail.series')}
                  value={detail.series}
                  onClick={detail.series ? () => setEntityTarget({
                    kind: 'series',
                    name: detail.series!,
                    path: findEntityPath(detail.seriesLinks, detail.series),
                    code: detail.code,
                  }) : undefined}
                />
              </div>
              <a
                href={detail.detailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary-500 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t('jav:detail.viewOnJavBus')}
              </a>
            </div>
          </div>

          {detail.tags.length > 0 ? (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-surface-400" />
                <span className="type-micro font-medium text-surface-500">{t('jav:detail.tagsLabel')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {Array.from(new Set(detail.tags)).map((tag) => (
                  <JavTagButton
                    key={tag}
                    tag={tag}
                    className="sm:text-sm"
                    onClick={() => setEntityTarget({
                      kind: 'tag',
                      name: tag,
                      path: findEntityPath(detail.tagLinks, tag),
                      code: detail.code,
                    })}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {detail.actresses.length > 0 ? (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-surface-400" />
                <span className="type-micro font-medium text-surface-500">{t('jav:detail.actressesLabel')}</span>
              </div>
              <JavActressList actresses={detail.actresses} onActressClick={onActressClick} />
            </div>
          ) : null}

          {playCode ? (
            <button
              type="button"
              onClick={() => setPlayModalOpen(true)}
              className="group flex w-full items-center gap-3 rounded-xl border border-surface-200 bg-surface-50 px-3.5 py-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-surface-700 dark:bg-surface-800/60 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-500/10 text-success-600 dark:text-success-400">
                <Play className="h-4 w-4 fill-current" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-surface-900 dark:text-surface-100">
                  {t('jav:detail.playOnline')}
                </span>
                <span className="block truncate text-[11px] text-surface-500 dark:text-surface-400">
                  {t('jav:detail.playOnlineEntryHint', {
                    platforms: JAV_PLAY_PLATFORMS.map((platform) => platform.name).join(' / '),
                  })}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-surface-400 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : null}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Magnet className="h-3.5 w-3.5 text-accent-500" />
                <span className="type-micro font-medium text-surface-600 dark:text-surface-300">
                  {t('jav:detail.magnetsHeader', { count: detail.magnets.length })}
                </span>
              </div>
              {detail.magnets.length > 0 ? (
                <div className="type-micro flex items-center gap-1 text-surface-400">
                  <Shield className="h-3 w-3" />
                  {t('jav:detail.magnetFooterHint')}
                </div>
              ) : null}
            </div>
            <MagnetList magnets={detail.magnets} />
          </div>
        </div>
      ) : null}

      <JavEntityWorksPanel
        entity={entityTarget}
        onClose={() => setEntityTarget(null)}
        onCodeClick={onCodeClick}
      />
    </PanelSection>
  );
};
