import React, { useState } from 'react';
import { Loader2, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { ShareToCommunityModal } from '@/pages/community/ShareToCommunityModal';

export interface SharePostData {
  postType: 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress';
  title: string;
  coverImage: string;
  contentData: string;
}

export interface ShareToCommunityButtonProps {
  /** 同步可得的分享内容 */
  postData?: SharePostData;
  /** 点击时才异步准备分享内容（如去本地库补磁力）；返回 null 表示放弃分享 */
  resolvePostData?: () => Promise<SharePostData | null>;
  className?: string;
  size?: 'small' | 'medium' | 'large';
  /** 窄屏下使用的短文案（如「分享」），默认与完整文案一致 */
  compactLabel?: string;
  /** button：带文字的渐变按钮（默认）；icon：只有图标的小按钮，用于竖排的操作列 */
  variant?: 'button' | 'icon';
  isAuthenticated?: boolean;
  onLoginRequired?: () => void;
}

const sizeStyles = {
  small: 'px-2 py-1 text-[10px] gap-1',
  medium: 'px-3 py-1.5 text-xs gap-1.5',
  large: 'px-4 py-2 text-sm gap-2',
};

const iconSizes = {
  small: 'w-3 h-3',
  medium: 'w-3.5 h-3.5',
  large: 'w-4 h-4',
};

export const ShareToCommunityButton: React.FC<ShareToCommunityButtonProps> = ({
  postData,
  resolvePostData,
  className = '',
  size = 'medium',
  compactLabel,
  variant = 'button',
  isAuthenticated: isAuthenticatedProp,
  onLoginRequired,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<SharePostData | null>(null);
  const { t } = useTranslation(['community']);
  // 未显式传入登录态时以全局登录态为准，避免默认放行导致未登录也能打开分享弹窗
  const storeAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthenticated = isAuthenticatedProp ?? storeAuthenticated;

  const handleClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (loading) return;
    if (!isAuthenticated) {
      onLoginRequired?.();
      return;
    }
    if (resolvePostData) {
      setLoading(true);
      try {
        const data = await resolvePostData();
        if (!data) return;
        setResolved(data);
      } finally {
        setLoading(false);
      }
    }
    setModalOpen(true);
  };

  const initialData = resolvePostData ? resolved : postData;
  const label = t('community:share.toCommunity');
  const Icon = loading ? Loader2 : Share2;

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          aria-label={label}
          title={label}
          className={`flex h-7 w-7 items-center justify-center rounded-lg text-surface-400 transition-colors
            hover:bg-amber-50 hover:text-amber-500 dark:hover:bg-amber-900/20 disabled:opacity-60 ${className}`}
        >
          <Icon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className={`inline-flex items-center rounded-lg font-medium transition-all
            bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600
            text-white shadow-sm hover:shadow-md active:scale-[0.97]
            disabled:opacity-50 disabled:cursor-not-allowed
            ${sizeStyles[size]}
            ${className}
          `}
          title={label}
        >
          <Icon className={`${iconSizes[size]} ${loading ? 'animate-spin' : ''}`} />
          <span className="sm:hidden">{compactLabel ?? label}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      )}

      {initialData ? (
        <ShareToCommunityModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initialData={initialData}
        />
      ) : null}
    </>
  );
};
