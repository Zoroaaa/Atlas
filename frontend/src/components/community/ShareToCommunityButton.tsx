import React, { useState } from 'react';
import { Share2 } from 'lucide-react';
import { ShareToCommunityModal } from '@/pages/community/ShareToCommunityModal';

export interface SharePostData {
  postType: 'jav' | 'anime' | 'movie' | 'manga' | 'actress';
  title: string;
  coverImage: string;
  contentData: string;
}

export interface ShareToCommunityButtonProps {
  postData: SharePostData;
  className?: string;
  size?: 'small' | 'medium' | 'large';
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
  className = '',
  size = 'medium',
  isAuthenticated = true,
  onLoginRequired,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = () => {
    if (!isAuthenticated) {
      onLoginRequired?.();
      return;
    }
    setModalOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`inline-flex items-center rounded-lg font-medium transition-all
          bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600
          text-white shadow-sm hover:shadow-md active:scale-[0.97]
          disabled:opacity-50 disabled:cursor-not-allowed
          ${sizeStyles[size]}
          ${className}
        `}
        title="分享到社区"
      >
        <Share2 className={iconSizes[size]} />
        <span>分享到社区</span>
      </button>

      <ShareToCommunityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialData={postData}
      />
    </>
  );
};
