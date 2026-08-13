import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { BrowseTab } from './BrowseTab';
import { MyPostsTab } from './MyPostsTab';
import { FavoritesTab } from './FavoritesTab';
import { TagsTab } from './TagsTab';
import { ShareToCommunityModal } from './ShareToCommunityModal';
import { NotificationsTab } from './NotificationsTab';

type TabKey = 'browse' | 'my-posts' | 'favorites' | 'tags' | 'notifications';

export const CommunityManager: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const pathToTab = (pathname: string): TabKey => {
    if (pathname === '/community/my-shares') return 'my-posts';
    if (pathname === '/community/my-favorites') return 'favorites';
    if (pathname === '/community/tags') return 'tags';
    if (pathname === '/community/reports') return 'notifications';
    return 'browse';
  };

  const [activeTab, setActiveTab] = useState<TabKey>(() => pathToTab(location.pathname));

  useEffect(() => {
    setActiveTab(pathToTab(location.pathname));
  }, [location.pathname]);

  const { tags, fetchTags } = useCommunityStore();

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareInitialData, setShareInitialData] = useState<{
    postType: 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress';
    title: string;
    coverImage: string;
    contentData: any;
  } | null>(null);

  // 暴露给外部调用（搜索结果页的分享按钮）
  (globalThis as Record<string, unknown>).__openCommunityShareModal = (data: {
    postType: 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress';
    title: string;
    coverImage: string;
    contentData: any;
  }) => {
    setShareInitialData(data);
    setShareModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* 热门标签 - 仅发现页显示 */}
      {activeTab === 'browse' && tags.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Hash className="w-4 h-4 text-primary-500 shrink-0" />
          {tags
            .sort((a, b) => (b.postsCount || 0) - (a.postsCount || 0))
            .map(t => (
              <Badge
                key={t.id}
                variant="default"
                size="md"
                style={{
                  backgroundColor: t.tagColor + '15',
                  color: t.tagColor,
                  border: `1px solid ${t.tagColor}30`,
                }}
              >
                #{t.tagName.replace(/^#/, '')}
                {(t.postsCount || 0) > 0 && (
                  <span className="ml-1 opacity-60">({t.postsCount})</span>
                )}
              </Badge>
            ))}
        </div>
      )}

      <div className="min-h-[400px]">
        {activeTab === 'browse' && <BrowseTab />}
        {activeTab === 'my-posts' && <MyPostsTab />}
        {activeTab === 'favorites' && <FavoritesTab />}
        {activeTab === 'tags' && <TagsTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
      </div>

      {shareInitialData && (
        <ShareToCommunityModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          initialData={shareInitialData}
          onSuccess={(post) => {
            console.log('分享成功:', post);
            navigate('/community/my-shares', { replace: true });
          }}
        />
      )}
    </div>
  );
};
