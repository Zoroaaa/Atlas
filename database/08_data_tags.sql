-- ===============================================
-- 官方标签初始化数据
-- 版本: 2.0
-- 说明: 包含社区功能所需的官方标签初始化数据
-- 执行顺序: 07
-- ===============================================

INSERT OR IGNORE INTO community_source_tags (id, tag_name, tag_description, tag_color, is_official, tag_active, created_by, created_at, updated_at) VALUES
    ('tag_verified', '已验证', '经过验证的可靠搜索源', '#10b981', 1, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('tag_popular', '热门', '下载量较高的热门搜索源', '#f59e0b', 1, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('tag_new', '最新', '新近添加的搜索源', '#3b82f6', 1, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('tag_recommended', '推荐', '官方推荐的优质搜索源', '#8b5cf6', 1, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('tag_high_quality', '高质量', '质量较高的搜索源', '#ef4444', 1, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('tag_jav', 'JAV', 'JAV相关搜索源', '#f97316', 0, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('tag_movie', '电影', '电影相关搜索源', '#06b6d4', 0, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('tag_torrent', '种子', '种子下载相关', '#84cc16', 0, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('tag_magnet', '磁力', '磁力链接搜索', '#22c55e', 0, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('tag_hd', '高清', '高清资源相关', '#a855f7', 0, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);
