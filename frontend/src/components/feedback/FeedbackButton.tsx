import React, { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FeedbackModal } from './FeedbackModal';

export const FeedbackButton: React.FC = () => {
  const { t } = useTranslation(['feedback']);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t('feedback:button.title')}
        className="fixed bottom-20 md:bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-[#d4a853] to-[#f59e0b] text-white text-sm font-semibold shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-105 active:scale-95 transition-all duration-200 group"
      >
        <MessageSquarePlus className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline">{t('feedback:button.label')}</span>
      </button>

      <FeedbackModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
};
