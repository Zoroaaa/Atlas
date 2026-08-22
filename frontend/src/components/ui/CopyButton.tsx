import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

/**
 * 复制按钮（带视觉反馈）
 * 点击后复制文本到剪贴板，显示勾选图标 2 秒
 */
export const CopyButton: React.FC<CopyButtonProps> = ({ text, label, className = '' }) => {
  const { t } = useTranslation(['ui']);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await navigator.clipboard.writeText(text).then(() => true).catch(() => false);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={copy}
      title={label ?? t('ui:copyButton.defaultTitle')}
      className={`p-1 rounded text-stone-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all ${className}`}
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-emerald-500" />
        : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};
