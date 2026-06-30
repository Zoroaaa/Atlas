export const getSiteTypeBadge = (siteType?: string) => {
  const map: Record<string, string> = {
    search: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    browse: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    reference: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  };
  return map[siteType || 'search'] || map.search;
};

export const getSiteTypeLabel = (siteType?: string) => {
  const map: Record<string, string> = { search: '搜索', browse: '浏览', reference: '参考' };
  return map[siteType || 'search'] || '搜索';
};
