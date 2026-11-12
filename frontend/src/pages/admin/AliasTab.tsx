import React, { useState } from 'react';
import { CheckCircle2, Database, Languages, Sparkles } from 'lucide-react';
import { adminApi } from '@/services/api';
import type { AliasIngestResult, AliasSuggestResult } from '@/services/api/admin';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useNotification';
import { useTranslation } from 'react-i18next';

const REPORT_SOURCES = ['tmdb', 'bangumi', 'mangadex'] as const;

/**
 * 别名管理（跨语言查询词解析）
 *
 * 管理端手动灌入入口：把同一作品/人物在多语言下的写法写入 entity_aliases，
 * 搜索时由 source-language 按各源站的索引语言自动挑词。
 */
export const AliasTab: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const toast = useToast();
  const [keyword, setKeyword] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [result, setResult] = useState<AliasIngestResult | null>(null);
  const [suggestions, setSuggestions] = useState<AliasSuggestResult | null>(null);

  const trimmed = keyword.trim();

  const handleIngest = async () => {
    if (!trimmed) {
      toast.error(t('admin:aliases.needKeyword'));
      return;
    }
    setIngesting(true);
    setSuggestions(null);
    try {
      const data = await adminApi.ingestAliases(trimmed);
      setResult(data);
      const written = REPORT_SOURCES.reduce((sum, source) => sum + data.report[source], 0);
      toast.success(t('admin:aliases.statusWritten', { count: written }));
    } catch {
      toast.error(t('admin:aliases.failed'));
    } finally {
      setIngesting(false);
    }
  };

  const handleSuggest = async () => {
    if (!trimmed) {
      toast.error(t('admin:aliases.needKeyword'));
      return;
    }
    setSuggesting(true);
    try {
      const data = await adminApi.suggestAliases(trimmed, 'ja');
      setSuggestions(data);
      if (!data.enabled) toast.error(t('admin:aliases.aiOff'));
      else toast.success(t('admin:aliases.statusWritten', { count: data.written }));
    } catch {
      toast.error(t('admin:aliases.failed'));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center shrink-0">
            <Languages className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              {t('admin:aliases.title')}
            </h2>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              {t('admin:aliases.subtitle')}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-2">
              {t('admin:aliases.introTitle')}
            </h3>
            <p className="text-sm leading-6 text-surface-600 dark:text-surface-300">
              {t('admin:aliases.intro')}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-2">
              {t('admin:aliases.stepsTitle')}
            </h3>
            <ol className="space-y-2">
              {[1, 2, 3, 4].map(step => (
                <li key={step} className="flex items-start gap-2 text-sm leading-6 text-surface-600 dark:text-surface-300">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-surface-100 dark:bg-surface-900 text-surface-500 dark:text-surface-400 text-xs font-semibold flex items-center justify-center shrink-0">
                    {step}
                  </span>
                  <span>{t(`admin:aliases.step${step}`)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-surface-100 dark:border-surface-700 space-y-1">
          <p className="text-xs text-surface-500 dark:text-surface-400">
            <span className="font-medium text-surface-700 dark:text-surface-300">
              {t('admin:aliases.sourceTitle')}：
            </span>
            {t('admin:aliases.sources')}
          </p>
          <p className="text-xs text-surface-400 dark:text-surface-500">
            {t('admin:aliases.note')}
          </p>
        </div>
      </section>

      <section className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5 sm:p-6">
        <label htmlFor="alias-keyword" className="text-sm font-medium text-surface-900 dark:text-surface-100">
          {t('admin:aliases.keywordLabel')}
        </label>
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <input
            id="alias-keyword"
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') void handleIngest();
            }}
            placeholder={t('admin:aliases.placeholder')}
            className="flex-1 min-w-0 px-3.5 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => void handleIngest()}
              disabled={ingesting || suggesting}
              isLoading={ingesting}
            >
              {!ingesting && <Database className="w-4 h-4 mr-2" />}
              {ingesting ? t('admin:aliases.ingesting') : t('admin:aliases.ingest')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleSuggest()}
              disabled={ingesting || suggesting}
              isLoading={suggesting}
            >
              {!suggesting && <Sparkles className="w-4 h-4 mr-2" />}
              {suggesting ? t('admin:aliases.suggesting') : t('admin:aliases.suggest')}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-surface-400 dark:text-surface-500">
          {t('admin:aliases.quickHint')}
        </p>
      </section>

      {result && (
        <section className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              {t('admin:aliases.resultTitle')}
            </h3>
            <span className="text-xs text-surface-500 dark:text-surface-400">
              {t('admin:aliases.from')}：{t(`admin:aliases.fromMap.${result.resolved.from}`)}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {REPORT_SOURCES.map(source => (
              <div key={source} className="rounded-lg bg-surface-50 dark:bg-surface-900 p-3 text-center">
                <div className="text-xl font-bold text-surface-900 dark:text-surface-100">
                  {result.report[source]}
                </div>
                <div className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 uppercase">
                  {source}
                </div>
              </div>
            ))}
          </div>

          {result.resolved.canonicalIds.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5">
                {t('admin:aliases.canonical')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.resolved.canonicalIds.map(id => (
                  <span
                    key={id}
                    className="px-2 py-0.5 rounded-md bg-surface-100 dark:bg-surface-900 text-xs font-mono text-surface-600 dark:text-surface-300"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5">
              {t('admin:aliases.variants')}
            </p>
            {result.resolved.variants.length === 0 ? (
              <p className="text-sm text-surface-500 dark:text-surface-400">
                {t('admin:aliases.emptyVariants')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-surface-400 border-b border-surface-200 dark:border-surface-700">
                      <th className="py-1.5 pr-3 font-medium">{t('admin:aliases.lang')}</th>
                      <th className="py-1.5 pr-3 font-medium">{t('admin:aliases.variant')}</th>
                      <th className="py-1.5 pr-3 font-medium">{t('admin:aliases.source')}</th>
                      <th className="py-1.5 font-medium">{t('admin:aliases.confidence')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.resolved.variants.map((variant, index) => (
                      <tr
                        key={`${variant.lang}-${variant.text}-${index}`}
                        className="border-b border-surface-100 dark:border-surface-700 last:border-0"
                      >
                        <td className="py-1.5 pr-3">
                          <span className="px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-900 text-xs font-mono text-surface-600 dark:text-surface-300">
                            {variant.lang}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-surface-900 dark:text-surface-100">{variant.text}</td>
                        <td className="py-1.5 pr-3 text-xs text-surface-500 dark:text-surface-400">{variant.source}</td>
                        <td className="py-1.5 text-xs text-surface-500 dark:text-surface-400">
                          {variant.confidence.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {suggestions && (
        <section className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5 sm:p-6">
          <h3 className="font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-rose-500" />
            {t('admin:aliases.suggest')}
          </h3>
          {!suggestions.enabled ? (
            <p className="mt-3 text-sm text-surface-500 dark:text-surface-400">
              {t('admin:aliases.aiOff')}
            </p>
          ) : suggestions.suggestions.length === 0 ? (
            <p className="mt-3 text-sm text-surface-500 dark:text-surface-400">
              {t('admin:aliases.emptyVariants')}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {suggestions.suggestions.map(item => (
                <li
                  key={`${item.lang}-${item.text}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-50 dark:bg-surface-900 px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="text-sm text-surface-900 dark:text-surface-100 break-all">{item.text}</span>
                    <span className="ml-2 text-xs font-mono text-surface-400">{item.lang}</span>
                  </div>
                  <span
                    className={
                      item.verified
                        ? 'text-xs font-medium text-green-600 dark:text-green-400'
                        : 'text-xs font-medium text-amber-600 dark:text-amber-400'
                    }
                  >
                    {item.verified ? 'Verified' : 'Unverified'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};
