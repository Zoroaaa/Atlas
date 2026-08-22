import React, { useState, useCallback } from 'react';
import {
  Magnet, Film, Calendar, Clock, User, Building2,
  Tag, Star, ExternalLink, Copy, Check, Loader2,
  AlertCircle, Search, ChevronDown, ChevronUp, X,
  Shield, Play, FileDown, Heart, ExternalLink as ExternalLinkIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { JavDetail, MagnetItem } from '@/types';
import {
  downloadTorrentFile,
  getWebtorUrl,
  copyToClipboard,
} from '@/utils/magnet';
import { ProxyImage, Modal } from '@/components/ui';
import { ShareToCommunityButton } from '@/components/community';
import { getProxyImageUrl } from '@/utils/imageProxy';

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
  onFavorite?: (detail: JavDetail) => void;
  isFavorited?: boolean;
  isAuthenticated?: boolean;
  onLoginRequired?: () => void;
}

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

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs sm:text-sm">
      <Icon className="w-3.5 h-3.5 text-surface-400 mt-0.5 shrink-0" />
      <span className="text-surface-500 dark:text-surface-400 shrink-0">{label}：</span>
      <span className="text-surface-800 dark:text-surface-200 break-all">{value}</span>
    </div>
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
    <div className="space-y-1.5">
      {/* 表头 */}
      <div className="grid grid-cols-[1fr_80px_88px_116px] gap-2 px-2 py-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wide border-b border-surface-100 dark:border-surface-800">
        <span>{t('jav:detail.magnetName')}</span>
        <span className="text-right">{t('jav:detail.size')}</span>
        <span className="text-right">{t('jav:detail.shareDate')}</span>
        <span className="text-right">{t('jav:detail.actions')}</span>
      </div>

      {displayed.map((m, i) => (
        <div key={i} className="relative">
          <div className="grid grid-cols-[1fr_80px_88px_116px] gap-2 items-center px-2 py-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-all group">
            {/* 名称（点击唤起 BT 客户端） */}
            <div className="flex items-center gap-1.5 min-w-0">
              {m.isHD && (
                <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300 rounded">HD</span>
              )}
              <a
                href={m.magnet}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate"
                title={m.name}
              >
                {m.name}
              </a>
            </div>

            <span className="text-xs text-right text-surface-600 dark:text-surface-400 tabular-nums">{m.size}</span>
            <span className="text-xs text-right text-surface-400 tabular-nums">{m.date}</span>

            {/* 操作区 */}
            <div className="flex justify-end items-center gap-0.5">
              {/* 在线播放（WebTor） */}
              <button
                onClick={() => setPlayModal({ magnet: m.magnet, name: m.name })}
                title={t('jav:detail.webtorPlay')}
                className="p-1 rounded transition-all text-surface-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              >
                <Play className="w-3.5 h-3.5" />
              </button>

              {/* 下载种子（真实 .torrent） */}
              <DownloadBtn magnet={m.magnet} name={m.name} />

              {/* 复制磁力链接 */}
              <CopyBtn text={m.magnet} />
            </div>
          </div>
        </div>
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

export const JavDetailPanel: React.FC<JavDetailPanelProps> = ({ detail, status, onClose, onFavorite, isFavorited, isAuthenticated = true, onLoginRequired }) => {
  const { t } = useTranslation(['jav']);
  if (status === 'idle') return null;

  return (
    <div className="bg-white dark:bg-surface-900/90 rounded-2xl shadow-xl shadow-surface-900/5 border border-surface-200/60 dark:border-surface-700/60 mb-4 sm:mb-6 overflow-hidden animate-fade-in">

      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-surface-100 dark:border-surface-800">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
            <Magnet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 dark:text-rose-400" />
          </div>
          <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">{t('jav:detail.magnetExtract')}</span>
          {detail && (
            <span className="px-2 py-0.5 text-xs font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full">
              {detail.code}
            </span>
          )}
          {status === 'success' && detail && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full">
              {t('jav:detail.magnetsCount', { count: detail.magnets.length })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onFavorite && detail && status === 'success' && (
            <>
              <button
                onClick={() => onFavorite(detail)}
                className={`p-1.5 rounded-lg transition-all ${isFavorited ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20' : 'text-surface-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'}`}
                title={isFavorited ? t('jav:detail.unfavorite') : t('jav:detail.favorite')}
              >
                <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
              {!isFavorited && (
                <span className="text-xs font-medium text-rose-500 dark:text-rose-400 animate-pulse">
                  {t('jav:detail.favoriteHint')}
                </span>
              )}
            </>
          )}
          {detail && status === 'success' && (
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
            />
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 加载中 */}
      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-surface-400">
          <Loader2 className="w-8 h-8 animate-spin text-rose-400" />
          <p className="text-sm">{t('jav:detail.loadingDetail')}</p>
          <p className="text-xs opacity-60">{t('jav:detail.loadingHint')}</p>
        </div>
      )}

      {/* 未找到 */}
      {status === 'not_found' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-surface-400">
          <Search className="w-8 h-8 opacity-40" />
          <p className="text-sm">{t('jav:detail.notFound')}</p>
          <p className="text-xs opacity-60">{t('jav:detail.notFoundHint')}</p>
        </div>
      )}

      {/* 出错 */}
      {status === 'error' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertCircle className="w-8 h-8 text-error-400" />
          <p className="text-sm text-surface-500">{t('jav:detail.fetchFailed')}</p>
        </div>
      )}

      {/* 成功 */}
      {status === 'success' && detail && (
        <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">

          {/* 封面 + 基本信息 */}
          <div className="flex gap-4 sm:gap-5">
            {detail.cover && (
              <ProxyImage
                src={getProxyImageUrl(resolveUrl(detail.cover, detail.detailUrl))}
                alt={detail.code}
                className="w-40 sm:w-52 rounded-lg object-cover shadow-md hover:shadow-lg transition-shadow shrink-0"
              />
            )}
            <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-surface-900 dark:text-surface-100 leading-snug line-clamp-3">
                {detail.title}
              </h3>
              <div className="space-y-1">
                <InfoRow icon={Calendar}  label={t('jav:detail.releaseDate')} value={detail.releaseDate} />
                <InfoRow icon={Clock}     label={t('jav:detail.duration')}    value={detail.duration} />
                <InfoRow icon={User}      label={t('jav:detail.director')}    value={detail.director} />
                <InfoRow icon={Building2} label={t('jav:detail.maker')}      value={detail.maker} />
                <InfoRow icon={Building2} label={t('jav:detail.publisher')}   value={detail.publisher} />
                <InfoRow icon={Film}      label={t('jav:detail.series')}     value={detail.series} />
              </div>
              <a
                href={detail.detailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary-500 hover:underline mt-1"
              >
                <ExternalLink className="w-3 h-3" />
                {t('jav:detail.viewOnJavBus')}
              </a>
            </div>
          </div>

          {/* 类别标签 */}
          {detail.tags.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Tag className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-xs font-semibold text-surface-500 dark:text-surface-400">{t('jav:detail.tagsLabel')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 text-xs bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 rounded-full border border-surface-200 dark:border-surface-700">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 演员 */}
          {detail.actresses.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Star className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-xs font-semibold text-surface-500 dark:text-surface-400">{t('jav:detail.actressesLabel')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detail.actresses.map((a, i) => (
                  <span key={i} className="px-2.5 py-1 text-xs bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 rounded-full border border-rose-200 dark:border-rose-800 font-medium">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 磁力链接 */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Magnet className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-xs font-semibold text-surface-700 dark:text-surface-300">
                  {t('jav:detail.magnetsHeader', { count: detail.magnets.length })}
                </span>
              </div>
              {detail.magnets.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-surface-400">
                  <Shield className="w-3 h-3" />
                  {t('jav:detail.magnetFooterHint')}
                </div>
              )}
            </div>
            <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
              <MagnetList magnets={detail.magnets} />
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
