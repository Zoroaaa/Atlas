import React, { useState, useCallback } from 'react';
import { Globe } from 'lucide-react';

interface SourceIconProps {
  icon?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showFallback?: boolean;
}

const sizeMap = {
  sm: { container: 'w-7 h-7', icon: 'w-4 h-4', text: 'text-xs', emoji: 'text-sm' },
  md: { container: 'w-10 h-10', icon: 'w-5 h-5', text: 'text-sm', emoji: 'text-base' },
  lg: { container: 'w-12 h-12', icon: 'w-6 h-6', text: 'text-base', emoji: 'text-lg' },
  xl: { container: 'w-16 h-16', icon: 'w-8 h-8', text: 'text-lg', emoji: 'text-2xl' },
};

export const SourceIcon: React.FC<SourceIconProps> = ({
  icon,
  name,
  size = 'md',
  className = '',
  showFallback = true,
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const handleImageError = useCallback(() => {
    setImageError(true);
    setImageLoading(false);
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageLoading(false);
  }, []);

  const sizeStyles = sizeMap[size];
  const baseClasses = `${sizeStyles.container} rounded-xl flex items-center justify-center shrink-0 border border-surface-200/60 dark:border-surface-600/60 overflow-hidden ${className}`;

  const isValidImageUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || 
           url.startsWith('https://') || 
           url.startsWith('/') || 
           url.startsWith('data:');
  };

  const getInitials = (nameStr: string): string => {
    return nameStr.charAt(0).toUpperCase();
  };

  const isEmoji = (str: string): boolean => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    return emojiRegex.test(str);
  };

  if (icon && isValidImageUrl(icon) && !imageError) {
    return (
      <div className={baseClasses}>
        {imageLoading && (
          <div className="absolute inset-0 bg-surface-100 dark:bg-surface-700 animate-pulse" />
        )}
        <img
          src={icon}
          alt={name}
          className={`w-full h-full object-cover ${imageLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
          onError={handleImageError}
          onLoad={handleImageLoad}
          loading="lazy"
        />
      </div>
    );
  }

  if (icon && isEmoji(icon)) {
    return (
      <div className={`${baseClasses} bg-gradient-to-br from-surface-100 to-surface-200 dark:from-surface-700 dark:to-surface-800`}>
        <span className={sizeStyles.emoji}>{icon}</span>
      </div>
    );
  }

  if (showFallback) {
    return (
      <div className={`${baseClasses} bg-gradient-to-br from-surface-100 to-surface-200 dark:from-surface-700 dark:to-surface-800`}>
        {icon ? (
          <span className={sizeStyles.emoji}>{icon}</span>
        ) : (
          <Globe className={`${sizeStyles.icon} text-surface-400 dark:text-surface-500`} />
        )}
      </div>
    );
  }

  return (
    <div className={`${baseClasses} bg-gradient-to-br from-primary-400 to-accent-500`}>
      <span className={`${sizeStyles.text} font-bold text-white`}>
        {getInitials(name)}
      </span>
    </div>
  );
};
