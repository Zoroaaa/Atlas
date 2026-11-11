import {
  Rocket,
  Compass,
  Search,
  LayoutGrid,
  FileText,
  Users,
  UserCheck,
  Bell,
  ShieldCheck,
  AlertTriangle,
  LifeBuoy,
  type LucideIcon,
} from 'lucide-react';

/**
 * 帮助中心的分类与章节结构。
 * 文案全部位于 i18n `help` 命名空间：
 * - help:categories.<categoryId>.title / description
 * - help:sections.<sectionId>.title / summary / features / steps / caveats
 */
export interface HelpCategoryDef {
  id: string;
  icon: LucideIcon;
  sections: string[];
}

export const HELP_CATEGORIES: HelpCategoryDef[] = [
  {
    id: 'start',
    icon: Rocket,
    sections: ['overview', 'first-steps'],
  },
  {
    id: 'discover',
    icon: Compass,
    sections: ['for-you', 'jav-rankings', 'trending-actresses'],
  },
  {
    id: 'search',
    icon: Search,
    sections: ['search-basics', 'tabs-diff', 'filters-sort', 'result-actions', 'history-favorites'],
  },
  {
    id: 'categories',
    icon: LayoutGrid,
    sections: ['jav', 'anime-movie', 'manga-novel', 'sources'],
  },
  {
    id: 'detail',
    icon: FileText,
    sections: ['detail-page'],
  },
  {
    id: 'community',
    icon: Users,
    sections: ['community-browse-post', 'community-interact', 'community-rules-report'],
  },
  {
    id: 'follow',
    icon: UserCheck,
    sections: ['follow-actress', 'follow-feed'],
  },
  {
    id: 'notifications',
    icon: Bell,
    sections: ['notification-center', 'email-verification', 'email-preferences', 'unsubscribe'],
  },
  {
    id: 'account',
    icon: ShieldCheck,
    sections: ['register-login', 'oauth', 'email-password', 'reset-password', 'delete-account'],
  },
  {
    id: 'notices',
    icon: AlertTriangle,
    sections: ['general-notices', 'usage-limits'],
  },
  {
    id: 'faq',
    icon: LifeBuoy,
    sections: ['faq-search', 'faq-access', 'faq-account'],
  },
];

/** sectionId → categoryId 的快速索引 */
export const HELP_SECTION_CATEGORY: Record<string, string> = HELP_CATEGORIES.reduce(
  (map, category) => {
    category.sections.forEach((sectionId) => {
      map[sectionId] = category.id;
    });
    return map;
  },
  {} as Record<string, string>
);

export const HELP_SECTION_IDS: string[] = HELP_CATEGORIES.flatMap((category) => category.sections);

export const DEFAULT_HELP_CATEGORY = HELP_CATEGORIES[0].id;
