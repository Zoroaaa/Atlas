/**
 * JavActressResultsPanel — JAV 女优搜索结果面板
 *
 * 当 javtab 处于 actress 子模式时渲染，展示 minnano-av.com 抓取的女优资料。
 * 数据来源：后端 routes/search.ts 在 javSubMode==='actress' 时短路调用 fetchActresses。
 *
 * 图片代理：统一走后端 /api/jav/proxy-image（getProxyImageUrl），
 * 而非前缀式 convertToProxyUrl —— 后者对图片会触发浏览器的 ORB。
 */
import { useState } from 'react';
import { Heart, Users, ChevronLeft, ChevronRight, Wifi, MapPin, Calendar, Building2, Star, Link2, Ruler } from 'lucide-react';
import type { JavEnrichedData, ActressProfile } from '@/types/search';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { ShareToCommunityButton } from '@/components/community/ShareToCommunityButton';

const PAGE_SIZE = 10;

// ─── 女优卡片 ────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 shrink-0" />
      <span className="text-stone-400 dark:text-stone-500 text-xs shrink-0">{label}</span>
      <span className="text-stone-700 dark:text-stone-200 text-xs font-medium truncate">{value}</span>
    </div>
  );
}

interface ActressCardProps {
  item: ActressProfile;
  isFavorited: boolean;
  isAuthenticated: boolean;
  onToggleFavorite: (actress: ActressProfile) => void;
  onLoginRequired: () => void;
}

function ActressCard({ item, isFavorited, isAuthenticated, onToggleFavorite, onLoginRequired }: ActressCardProps) {
  // 统一走后端 /api/jav/proxy-image 避开浏览器 ORB
  const imgSrc = item.cover ? getProxyImageUrl(item.cover) : undefined;

  const metrics: string[] = [];
  if (item.height) metrics.push(`T${item.height}`);
  if (item.bust && item.cup) metrics.push(`B${item.bust}(${item.cup})`);
  if (item.waist) metrics.push(`W${item.waist}`);
  if (item.hip) metrics.push(`H${item.hip}`);

  return (
    <div className="flex items-start gap-4 px-4 py-3.5 rounded-xl border border-stone-100 dark:border-stone-800 hover:border-pink-200 dark:hover:border-pink-900/50 hover:bg-pink-50/30 dark:hover:bg-pink-900/5 transition-all">
      {/* 封面 */}
      {imgSrc && (
        <img
          src={imgSrc}
          alt={item.name}
          loading="lazy"
          className="shrink-0 w-16 h-20 rounded-lg object-cover bg-stone-100 dark:bg-stone-800 ring-1 ring-stone-200/60 dark:ring-stone-700/60"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
        />
      )}

      {/* 信息主体 */}
      <div className="min-w-0 flex-1 space-y-2">
        {/* 名字区块：名字 + 假名 + 罗马音 */}
        <div className="flex items-baseline gap-2 flex-wrap">
          {item.detailUrl ? (
            <a
              href={item.detailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-bold text-stone-900 dark:text-stone-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              {item.name}
            </a>
          ) : (
            <span className="text-base font-bold text-stone-900 dark:text-stone-100">{item.name}</span>
          )}
          {item.ruby && (
            <span className="text-sm text-stone-500 dark:text-stone-400">{item.ruby}</span>
          )}
          {item.romaji && (
            <span className="text-sm text-stone-500 dark:text-stone-400 italic">{item.romaji}</span>
          )}
        </div>

        {/* 别名：独立行，明显区分 */}
        {item.alias && (
          <div className="text-xs text-stone-500 dark:text-stone-400">
            <span className="text-stone-400 dark:text-stone-500 mr-1">别名</span>
            <span className="font-medium">{item.alias}</span>
          </div>
        )}

        {/* 三围：醒目的彩色 chip */}
        {metrics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {metrics.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 text-xs font-semibold bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 rounded-md"
              >
                {m}
              </span>
            ))}
          </div>
        )}

        {/* 基本信息分组：grid 双列布局，每项 label:value 清晰 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pt-1">
          {item.birthday && (
            <InfoRow icon={Calendar} label="生日" value={item.birthday + (item.zodiac ? ` ${item.zodiac}` : '')} />
          )}
          {item.prefecture && (
            <InfoRow icon={MapPin} label="出身" value={item.prefecture} />
          )}
          {item.activePeriod && (
            <InfoRow icon={Star} label="出道" value={item.activePeriod} />
          )}
          {item.agency && (
            <InfoRow icon={Building2} label="事务所" value={item.agency} />
          )}
          {item.debutWork && (
            <InfoRow icon={Ruler} label="出道作" value={item.debutWork} />
          )}
        </div>

        {/* 标签：独立分组 */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {item.tags.slice(0, 10).map((t, i) => (
              <span
                key={i}
                className="px-2 py-0.5 text-xs bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300 rounded-md"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* 外链 */}
        {(item.blogUrl || item.officialUrl) && (
          <div className="flex gap-3 pt-1">
            {item.blogUrl && (
              <a
                href={item.blogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <Link2 className="w-3 h-3" />博客
              </a>
            )}
            {item.officialUrl && (
              <a
                href={item.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <Link2 className="w-3 h-3" />官网
              </a>
            )}
          </div>
        )}
      </div>

      {/* 收藏 + 分享 */}
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <button
          onClick={() => onToggleFavorite(item)}
          disabled={!isAuthenticated}
          className={`p-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            isFavorited
              ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20'
              : 'text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
          }`}
          title={isFavorited ? '取消收藏' : '收藏'}
        >
          <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
        </button>
        <ShareToCommunityButton
          postData={{
            postType: 'actress',
            title: item.name,
            coverImage: item.cover ? getProxyImageUrl(item.cover) : '',
            contentData: JSON.stringify({
              id: item.id,
              name: item.name,
              ruby: item.ruby,
              romaji: item.romaji,
              alias: item.alias,
              birthday: item.birthday,
              zodiac: item.zodiac,
              height: item.height,
              bust: item.bust,
              cup: item.cup,
              waist: item.waist,
              hip: item.hip,
              prefecture: item.prefecture,
              agency: item.agency,
              activePeriod: item.activePeriod,
              debutWork: item.debutWork,
              blogUrl: item.blogUrl,
              officialUrl: item.officialUrl,
              detailUrl: item.detailUrl,
              cover: item.cover,
              tags: item.tags,
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

// ─── 主面板 ──────────────────────────────────────────────────────────────

export interface JavActressResultsPanelProps {
  data: JavEnrichedData;
  favoritedCodes: Set<string>;
  isAuthenticated: boolean;
  onToggleFavorite: (actress: ActressProfile) => void;
  onLoginRequired: () => void;
}

export function JavActressResultsPanel({ data, favoritedCodes, isAuthenticated, onToggleFavorite, onLoginRequired }: JavActressResultsPanelProps) {
  const [page, setPage] = useState(1);
  const actresses = data.actresses ?? [];
  const errorMsg = data.errors?.search;

  // 错误且无结果
  if (errorMsg && actresses.length === 0) {
    return (
      <div className="bg-white dark:bg-stone-900/90 rounded-2xl shadow-lg shadow-stone-900/5 border border-stone-200/60 dark:border-stone-700/60 p-6">
        <div className="flex items-center gap-2 text-pink-600 dark:text-pink-400">
          <Wifi className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">女优搜索失败：{errorMsg}</span>
        </div>
      </div>
    );
  }

  // 空结果
  if (actresses.length === 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(actresses.length / PAGE_SIZE));
  const paged = actresses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="bg-white dark:bg-stone-900/90 rounded-2xl shadow-lg shadow-stone-900/5 border border-stone-200/60 dark:border-stone-700/60 overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-stone-100 dark:border-stone-800">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-pink-500 dark:text-pink-400" />
          </div>
          <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm sm:text-base">AV女优</span>
          <span className="px-2 py-0.5 text-xs font-bold bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-full">{actresses.length} 位</span>
        </div>
        <a
          href={`https://www.minnano-av.com/search_result.php?search_scope=actress&search_word=${encodeURIComponent(data.keyword)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-pink-500 hover:text-pink-400 transition-colors"
        >
          minnano 站内搜索 →
        </a>
      </div>

      {/* 列表 */}
      <div className="p-4 sm:p-5">
        <div className="space-y-2.5">
          {paged.map((item) => (
            <ActressCard
              key={item.id}
              item={item}
              isFavorited={favoritedCodes.has(`actress:${item.id}`)}
              isAuthenticated={isAuthenticated}
              onToggleFavorite={onToggleFavorite}
              onLoginRequired={onLoginRequired}
            />
          ))}

          {/* 分页 */}
          {actresses.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500
                           hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all
                           dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> 上一页
              </button>
              <span className="text-xs text-stone-500 px-2">
                {page} / {totalPages}
                <span className="ml-1 text-stone-400">（共 {actresses.length} 位）</span>
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500
                           hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all
                           dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
              >
                下一页 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
