import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useProxyStore } from '@/stores';
import { UnifiedNavBar } from '@/components/layout';
import { useFeatureFlags } from '@/contexts';
import { FeedbackButton } from '@/components/feedback';
import { HeroSection } from '@/components/home/HeroSection';
import { CapabilityGrid } from '@/components/home/CapabilityGrid';
import { FeatureShowcase } from '@/components/home/FeatureShowcase';
import { ScaleStrip } from '@/components/home/ScaleStrip';
import { TrustSection } from '@/components/home/TrustSection';
import { StartSection } from '@/components/home/StartSection';
import { SiteFooter } from '@/components/home/SiteFooter';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { initializeProxy } = useProxyStore();
  const { enableRegistration, communityEnabled } = useFeatureFlags();

  const isAdmin = isAuthenticated && user != null && (user.role === 'admin' || user.role === 'super_admin');
  const showCommunity = communityEnabled !== false;

  useEffect(() => {
    initializeProxy();
  }, [initializeProxy]);

  return (
    <div className="min-h-screen overflow-x-clip bg-stone-50 text-stone-900 dark:bg-[#0a0a0b] dark:text-stone-100">
      <UnifiedNavBar
        activeTab="jav"
        onTabChange={(tab) => navigate(`/main?tab=${tab}`)}
        isAuthenticated={isAuthenticated}
        user={user}
        isAdmin={isAdmin}
      />

      <main>
        <HeroSection enableRegistration={enableRegistration} />
        <CapabilityGrid showCommunity={showCommunity} />
        <FeatureShowcase showCommunity={showCommunity} />
        <ScaleStrip />
        <TrustSection />
        <StartSection enableRegistration={enableRegistration} />
      </main>

      <SiteFooter enableRegistration={enableRegistration} />
      <FeedbackButton />
    </div>
  );
};
