/**
 * JavBus 实体作品列表（导演 / 制作商 / 发行商 / 系列）
 *
 * 详情卡片上的实体字段点击后打开：
 * - content_data 里有实体链接时直接请求 /jav/entity?path=...
 * - 老记录没有链接时先请求 /jav/entity/resolve?code=... 回源解析一次
 */
import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal, Loading } from '@/components/ui';
import { EmptyBlock } from '@/components/workbench';
import { apiClient } from '@/services/api';
import { getProxyImageUrl } from '@/utils/imageProxy';
import type { JavEntityLink, JavEntityTarget, JavEntityWorkItem } from '@/types';

interface JavEntityWorksPanelProps {
  entity: JavEntityTarget | null;
  onClose: () => void;
  /** 点击作品后走现有番号搜索 */
  onCodeClick?: (code: string) => void;
}

interface EntityWorksData {
  path: string;
  externalUrl?: string;
  items: JavEntityWorkItem[];
}

interface EntityLinksData {
  directorLinks?: JavEntityLink[];
  makerLinks?: JavEntityLink[];
  publisherLinks?: JavEntityLink[];
  seriesLinks?: JavEntityLink[];
}

const LINKS_KEY: Record<JavEntityTarget['kind'], keyof EntityLinksData> = {
  director: 'directorLinks',
  studio: 'makerLinks',
  label: 'publisherLinks',
  series: 'seriesLinks',
};

const pickPath = (data: EntityLinksData, target: JavEntityTarget): string | undefined => {
  const links = data[LINKS_KEY[target.kind]] ?? [];
  if (links.length === 0) return undefined;
  const exact = links.find((link) => link.name === target.name);
  if (exact) return exact.path;
  return (links.find((link) => target.name.includes(link.name)) ?? links[0])?.path;
};

export const JavEntityWorksPanel: React.FC<JavEntityWorksPanelProps> = ({
  entity,
  onClose,
  onCodeClick,
}) => {
  const { t } = useTranslation(['jav']);
  const [items, setItems] = useState<JavEntityWorkItem[]>([]);
  const [externalUrl, setExternalUrl] = useState<string | undefined>();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!entity) {
      setStatus('idle');
      setItems([]);
      setExternalUrl(undefined);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setStatus('loading');
      setItems([]);
      setExternalUrl(undefined);
      try {
        let path = entity.path;
        if (!path) {
          if (!entity.code) throw new Error('missing entity code');
          const resolution = await apiClient.get<{ success: boolean; data?: EntityLinksData }>(
            `/jav/entity/resolve?code=${encodeURIComponent(entity.code)}`
          );
          path = resolution.data ? pickPath(resolution.data, entity) : undefined;
          if (!path) throw new Error('entity link not found');
        }

        const response = await apiClient.get<{ success: boolean; data?: EntityWorksData }>(
          `/jav/entity?path=${encodeURIComponent(path)}`
        );
        if (cancelled) return;
        setItems(response.data?.items ?? []);
        setExternalUrl(response.data?.externalUrl);
        setStatus('success');
      } catch (err) {
        if (cancelled) return;
        console.error('[JavEntityWorksPanel] load failed:', err);
        setStatus('error');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [entity, reloadKey]);

  const title = entity ? t('jav:entity.title', { name: entity.name }) : '';

  return (
    <Modal isOpen={!!entity} onClose={onClose} title={title} size="lg">
      {status === 'loading' || status === 'idle' ? (
        <div className="flex min-h-[160px] items-center justify-center">
          <Loading text={t('jav:entity.loading')} />
        </div>
      ) : null}

      {status === 'error' ? (
        <EmptyBlock
          icon={<AlertCircle className="h-7 w-7" />}
          title={t('jav:entity.error')}
          hint={t('jav:entity.errorHint')}
          action={
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-500 px-3 text-[11px] font-medium text-white transition-colors hover:bg-primary-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('jav:detail.retry')}
            </button>
          }
          className="bg-transparent"
        />
      ) : null}

      {status === 'success' && items.length === 0 ? (
        <EmptyBlock
          icon={<AlertCircle className="h-7 w-7" />}
          title={t('jav:entity.empty')}
          hint={t('jav:entity.emptyHint')}
          className="bg-transparent"
        />
      ) : null}

      {status === 'success' && items.length > 0 ? (
        <div className="space-y-3">
          <div className="max-h-[60vh] divide-y divide-surface-100 overflow-y-auto dark:divide-surface-800/70">
            {items.map((item) => (
              <button
                key={`${item.code}-${item.date ?? ''}`}
                type="button"
                onClick={() => {
                  onCodeClick?.(item.code);
                  onClose();
                }}
                className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/50"
              >
                <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-100 dark:bg-surface-800">
                  {item.cover ? (
                    <img
                      src={getProxyImageUrl(item.cover)}
                      alt={item.code}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-surface-400">
                      {item.code.slice(0, 6)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[12px] font-medium leading-snug text-surface-800 dark:text-surface-200">
                    {item.title}
                  </p>
                  <p className="type-micro mt-0.5 flex items-center gap-2 font-semibold text-surface-500">
                    <span>{item.code}</span>
                    {item.date ? <span className="font-normal">{item.date}</span> : null}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {externalUrl ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary-500 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t('jav:entity.openOnJavBus')}
            </a>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
};
