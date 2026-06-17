import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ImagePreviewProps {
  src: string;
  alt: string;
  className?: string;
}

export const ProxyImage: React.FC<ImagePreviewProps> = ({ src, alt, className }) => {
  const [isZoomed, setIsZoomed] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className} cursor-pointer hover:opacity-90 transition-opacity`}
        onClick={() => setIsZoomed(true)}
      />
      {isZoomed && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setIsZoomed(false)}
        >
          <button
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
      )}
    </>
  );
};
