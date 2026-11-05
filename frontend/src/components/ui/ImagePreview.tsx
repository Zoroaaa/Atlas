import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** 全屏放大查看图片，点击任意处关闭 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, alt, onClose }) =>
  createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
      onClick={(event) => { event.stopPropagation(); onClose(); }}
    >
      <button
        type="button"
        aria-label="close"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
      />
    </div>,
    document.body
  );

interface ImagePreviewProps {
  src: string;
  alt: string;
  className?: string;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}

export const ProxyImage: React.FC<ImagePreviewProps> = ({ src, alt, className, onLoad }) => {
  const [isZoomed, setIsZoomed] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className} cursor-zoom-in hover:opacity-90 transition-opacity`}
        onLoad={onLoad}
        onClick={(event) => { event.stopPropagation(); setIsZoomed(true); }}
      />
      {isZoomed ? <ImageLightbox src={src} alt={alt} onClose={() => setIsZoomed(false)} /> : null}
    </>
  );
};
