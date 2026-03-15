-- ===============================================
-- 搜索源默认数据
-- 版本: 2.0
-- 说明: 包含搜索源大类、分类、搜索源等初始化数据
-- 执行顺序: 06
-- ===============================================

-- ===============================================
-- 1. 搜索源大类初始化数据
-- ===============================================

INSERT OR REPLACE INTO search_major_categories (
    id, name, description, icon, color, requires_keyword, 
    display_order, is_system, is_active, created_at, updated_at
) VALUES 
    ('search_sources', '🔍 搜索源', '支持番号搜索的网站', '🔍', '#3b82f6', 1, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('browse_sites', '🌐 浏览站点', '仅供访问，不参与搜索', '🌐', '#10b981', 0, 2, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 2. 搜索源分类初始化数据
-- ===============================================

INSERT OR REPLACE INTO search_source_categories (
    id, major_category_id, name, description, icon, color, display_order, 
    is_system, is_active, default_searchable, default_site_type, search_priority,
    created_at, updated_at
) VALUES 
    ('database', 'search_sources', '📚 番号资料站', '提供详细的番号信息、封面和演员资料', '📚', '#3b82f6', 1, 1, 1, 1, 'search', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('streaming', 'search_sources', '🎥 在线播放平台', '提供在线观看和下载服务', '🎥', '#10b981', 2, 1, 1, 1, 'search', 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('torrent', 'browse_sites', '🧲 磁力搜索', '提供磁力链接和种子文件', '🧲', '#f59e0b', 3, 1, 1, 0, 'browse', 10, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('community', 'browse_sites', '💬 社区论坛', '用户交流讨论和资源分享', '💬', '#8b5cf6', 4, 1, 1, 0, 'browse', 10, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('others', 'browse_sites', '🌟 其他资源', '其他类型的搜索资源', '🌟', '#6b7280', 99, 1, 1, 0, 'browse', 10, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 3. 搜索源初始化数据 - 番号资料站
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, requires_keyword, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES 
    ('javbus', 'database', 'JavBus', '番号+磁力一体站，信息完善', '提供详细的番号信息、封面、演员资料和磁力链接', '🎬', 'https://www.javbus.com/search/{keyword}', 'https://www.javbus.com', 'search', 1, 1, 1, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javdb', 'database', 'JavDB', '极简风格番号资料站，轻量快速', '提供简洁的番号信息和磁力链接', '📚', 'https://javdb.com/search?q={keyword}&f=all', 'https://javdb.com', 'search', 1, 1, 2, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javlibrary', 'database', 'JavLibrary', '评论活跃，女优搜索详尽', '老牌番号资料站，社区活跃', '📖', 'https://www.javlibrary.com/cn/vl_searchbyid.php?keyword={keyword}', 'https://www.javlibrary.com', 'search', 1, 1, 3, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('rjav', 'database', 'r/JAV', 'Reddit JAV社区', '专注于日本成人视频讨论的Reddit社区', '📖', 'https://reddit.com/r/jav/search?q={keyword}', 'https://reddit.com/r/jav/', 'search', 1, 1, 30, 1, 1, 24, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 4. 搜索源初始化数据 - 在线播放平台
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, requires_keyword, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES 
    ('jable', 'streaming', 'Jable', '高清在线观看，支持多种格式', '知名在线播放平台', '📺', 'https://jable.tv/videos/{keyword}/', 'https://jable.tv', 'search', 1, 1, 5, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javmost', 'streaming', 'JavMost', '免费在线观看，更新及时', '免费在线播放平台', '🎦', 'https://www5.javmost.com/search/{keyword}', 'https://javmost.com', 'search', 1, 1, 6, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javguru', 'streaming', 'JavGuru', '多线路播放，观看流畅', '多线路在线播放', '🎭', 'https://jav.guru/search/{keyword}', 'https://jav.guru', 'search', 1, 1, 7, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('av01', 'streaming', 'AV01', '快速预览站点，封面大图清晰', '封面预览和在线播放', '🎥', 'https://av01.tv/jp/search?q={keyword}', 'https://av01.tv', 'search', 1, 1, 8, 1, 1, 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('missav', 'streaming', 'MissAV', '亚洲最大JAV流媒体平台，月访问量超3亿', '提供高清无码JAV内容，拥有庞大的日本成人视频库，支持1080p流媒体播放', '🎥', 'https://missav.ws/search/{keyword}', 'https://missav.ws', 'search', 1, 1, 9, 1, 1, 27, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('supjav', 'streaming', 'SupJAV', '每日更新的高质量JAV平台', '提供数万部完整长度JAV视频，支持高清流媒体播放，更新频率高', '📺', 'https://supjav.com/search?q={keyword}', 'https://supjav.com', 'search', 1, 1, 10, 1, 1, 28, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('bestjavporn', 'streaming', 'BestJavPorn', '提供审查和无码JAV内容', '拥有大量审查和未审查JAV的综合性站点，内容分类详细', '🎦', 'https://bestjavporn.com/search?q={keyword}', 'https://bestjavporn.com', 'search', 1, 1, 11, 1, 1, 29, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javsb', 'streaming', 'JAV.sb', '专注未审查JAV内容', '拥有超过5600部未审查JAV的免费流媒体平台', '🎭', 'https://jav.sb/search/{keyword}', 'https://jav.sb', 'search', 1, 1, 12, 1, 1, 30, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javleak', 'streaming', 'JAVLeak', '流行日本成人视频平台', '提供高质量审查和未审查日本成人内容，界面友好', '🎥', 'https://javleak.com/search?q={keyword}', 'https://javleak.com', 'search', 1, 1, 13, 1, 1, 31, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javseen', 'streaming', 'JAVSeen', '超10万部完整长度电影', '提供大规模免费流媒体日本成人视频收藏，内容丰富', '🎬', 'https://javseen.tv/search/{keyword}', 'https://javseen.tv', 'search', 1, 1, 14, 1, 1, 32, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javtsunami', 'streaming', 'JAVTsunami', '热门JAV明星专题站', '收录数千部行业热门明星JAV作品，按演员分类清晰', '⚡', 'https://javtsunami.com/search/{keyword}', 'https://javtsunami.com', 'search', 1, 1, 15, 1, 1, 33, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javsubtitled', 'streaming', 'JAV Subtitled', '提供英文字幕JAV内容', '专门提供带英文字幕的JAV内容，方便非日语用户观看', '🎪', 'https://javsubtitled.com/search?q={keyword}', 'https://javsubtitled.com', 'search', 1, 1, 16, 1, 1, 34, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javout', 'streaming', 'JAVOut', '高清JAV视频源', '提供完整长度HD高清JAV视频，画质优秀', '📺', 'https://javout.co/search/{keyword}', 'https://javout.co', 'search', 1, 1, 17, 1, 1, 35, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javgg', 'streaming', 'JavGG', '免费观看平台，速度稳定', '免费在线播放', '⚡', 'https://javgg.net/search/{keyword}', 'https://javgg.net', 'search', 1, 1, 11, 1, 1, 7, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javcl', 'streaming', 'JAVCL', '完整长度AV电影专门站', '专注于来自日本的完整长度AV视频和电影', '🎭', 'https://javcl.com/search/{keyword}', 'https://javcl.com', 'search', 1, 1, 19, 1, 1, 37, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javdoe', 'streaming', 'JavDoe', 'JAV网络联盟主站', '由多个免费和付费站点组成的JAV网络联盟', '🎥', 'https://javdoe.to/search?q={keyword}', 'https://javdoe.to', 'search', 1, 1, 20, 1, 1, 38, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javdesu', 'streaming', 'JAV Desu', '未审查JAV专门站', '提供各种未审查JAV内容，更新频繁', '🎬', 'https://javdesu.tv/search/{keyword}', 'https://javdesu.tv', 'search', 1, 1, 21, 1, 1, 39, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javynow', 'streaming', 'JavyNow', '100%免费日本成人视频', '提供最佳日本成人内容的免费平台', '⚡', 'https://javynow.com/search/{keyword}', 'https://javynow.com', 'search', 1, 1, 22, 1, 1, 40, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javhdporn2', 'streaming', 'JAVHDPorn.net', '免费HD高清JAV', '提供高清JAV内容的免费流媒体平台', '🎪', 'https://javhdporn.net/search?q={keyword}', 'https://javhdporn.net', 'search', 1, 1, 23, 1, 1, 41, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javasslove', 'streaming', 'JAV Ass Lover', '日本成人特色内容', '专注于特定类型日本成人内容的站点', '📺', 'https://javass.love/search/{keyword}', 'https://javass.love', 'search', 1, 1, 24, 1, 1, 42, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javsubtitle', 'streaming', 'JAV Subtitle', '高质量英文字幕JAV', '提供专业英文字幕的高质量JAV内容', '🎦', 'https://javsubtitle.xyz/search?q={keyword}', 'https://javsubtitle.xyz', 'search', 1, 1, 25, 1, 1, 43, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 5. 搜索源初始化数据 - 磁力搜索（浏览站点）
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, requires_keyword, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES 
    ('btsow', 'torrent', 'BTSOW', '中文磁力搜索引擎，番号资源丰富', '知名磁力搜索引擎', '🧲', 'https://btsow.com', 'https://btsow.com', 'browse', 0, 0, 99, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('magnetdl', 'torrent', 'MagnetDL', '磁力链接搜索，资源覆盖全面', '磁力链接搜索引擎', '🔗', 'https://www.magnetdl.com', 'https://www.magnetdl.com', 'browse', 0, 0, 99, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('torrentkitty', 'torrent', 'TorrentKitty', '种子搜索引擎，下载资源丰富', '种子下载搜索', '🐱', 'https://www.torrentkitty.tv', 'https://www.torrentkitty.tv', 'browse', 0, 0, 99, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('sukebei', 'torrent', 'Sukebei', '成人内容种子站，资源全面', '成人内容种子搜索', '🌙', 'https://sukebei.nyaa.si', 'https://sukebei.nyaa.si', 'browse', 0, 0, 99, 1, 1, 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('onejav', 'torrent', 'OneJAV', '免费JAV种子下载站', '提供数千部完整长度JAV电影的种子下载', '🧲', 'https://onejav.com', 'https://onejav.com', 'browse', 0, 0, 99, 1, 1, 25, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('projectjav', 'torrent', 'Project Jav', '大型JAV种子库', '收录超过53000部日本成人视频种子', '🔗', 'https://projectjav.com', 'https://projectjav.com', 'browse', 0, 0, 99, 1, 1, 26, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('nextjav', 'torrent', 'NextJAV', '完整长度JAV种子', '专注于完整长度日本成人视频的种子站点', '🐱', 'https://nextjav.com', 'https://nextjav.com', 'browse', 0, 0, 99, 1, 1, 27, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javjunkies', 'torrent', 'JavJunkies', '十年档案JAV种子站', '拥有十年历史档案的大型JAV种子站点', '🌙', 'https://javjunkies.org', 'https://javjunkies.org', 'browse', 0, 0, 99, 1, 1, 28, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javbee', 'torrent', 'JAVBEE', 'JAV种子跟踪站', '每月百万访问的JAV种子跟踪站点', '🧲', 'https://javbee.org', 'https://javbee.org', 'browse', 0, 0, 99, 1, 1, 29, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('ijavtorrent', 'torrent', 'iJavTorrent', 'JAV种子下载专门站', '专注于JAV种子文件下载的站点', '🔗', 'https://ijavtorrent.com', 'https://ijavtorrent.com', 'browse', 0, 0, 99, 1, 1, 30, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('empornium', 'torrent', 'Empornium', '私人成人种子站', '综合性私人成人内容种子站点，需要邀请', '🐱', 'https://empornium.is', 'https://empornium.is', 'browse', 0, 0, 99, 1, 1, 31, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('141ppv', 'torrent', '141PPV', '未审查JAV种子', '提供高质量未审查JAV内容种子下载', '🧲', 'https://141ppv.com', 'https://141ppv.com', 'browse', 0, 0, 99, 1, 1, 32, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('lovetorrent', 'torrent', 'LoveTorrent', '综合成人种子站', '跟踪超过16万部成人电影种子的综合站点', '🔗', 'https://lovetorrent.net', 'https://lovetorrent.net', 'browse', 0, 0, 99, 1, 1, 33, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('xxxclub', 'torrent', 'XXXClub', '设计精良的种子站', '界面友好的成人内容种子站点', '🐱', 'https://xxxclub.to', 'https://xxxclub.to', 'browse', 0, 0, 99, 1, 1, 34, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('myjavbay', 'torrent', 'My JAV Bay', 'JAV种子专门站', '专注于JAV内容的种子下载站点', '🌙', 'https://myjavbay.com', 'https://myjavbay.com', 'browse', 0, 0, 99, 1, 1, 35, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 6. 搜索源初始化数据 - 社区论坛（浏览站点）
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, requires_keyword, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES 
    ('t66y', 'community', 'T66Y草榴社区', '1024老牌成人论坛', '成立于2006年的知名成人论坛社区，会员超20万，以"1024"文化著称', '🌿', 'https://t66y.com', 'https://t66y.com', 'browse', 0, 0, 99, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('sehuatang', 'community', '色花堂98堂', '综合成人论坛社区', '大型综合性成人论坛社区，资源丰富，分区详细', '🌸', 'https://sehuatang.org', 'https://sehuatang.org', 'browse', 0, 0, 99, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('5278cc', 'community', '5278.cc', '综合讨论区', '综合性大型成人讨论区，内容多元化', '📋', 'https://5278.cc', 'https://5278.cc', 'browse', 0, 0, 99, 1, 1, 23, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('sexinsex', 'community', 'SexInSex', '老牌成人社区', '历史悠久的成人论坛，资源库丰富', '💬', 'https://sexinsex.net', 'https://sexinsex.net', 'browse', 0, 0, 99, 1, 1, 24, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('sis001', 'community', 'SIS001', '综合成人论坛', '全面的成人内容论坛，版块众多', '📖', 'https://sis001.com', 'https://sis001.com', 'browse', 0, 0, 99, 1, 1, 25, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('southplus', 'community', 'South-Plus', '综合娱乐论坛', '综合性娱乐讨论论坛，内容丰富', '🌐', 'https://south-plus.net', 'https://south-plus.net', 'browse', 0, 0, 99, 1, 1, 26, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('52av', 'community', '52AV', '手机A片王', '移动端优化的成人论坛社区', '📱', 'https://52av.one', 'https://52av.one', 'browse', 0, 0, 99, 1, 1, 27, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('jkforum', 'community', 'JKForum', '捷克论坛', '成人娱乐综合论坛', '💭', 'https://jkforum.net', 'https://jkforum.net', 'browse', 0, 0, 99, 1, 1, 28, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('eyny', 'community', 'EYNY', '伊莉讨论区', '大型综合讨论区，涵盖多种主题', '🗨️', 'https://eyny.com', 'https://eyny.com', 'browse', 0, 0, 99, 1, 1, 29, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('hungya', 'community', '夯鸭论坛', '资源分享论坛', '活跃的成人资源分享社区', '🦆', 'https://hung-ya.com', 'https://hung-ya.com', 'browse', 0, 0, 99, 1, 1, 30, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('oursogo', 'community', 'OurSogo', 'Sogo论坛', '休闲娱乐综合论坛', '🎯', 'https://oursogo.com', 'https://oursogo.com', 'browse', 0, 0, 99, 1, 1, 31, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('cool18', 'community', 'Cool18', '十八禁成人站', '成人内容综合站点', '🔞', 'https://cool18.com', 'https://cool18.com', 'browse', 0, 0, 99, 1, 1, 32, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('141hongkong', 'community', '141HongKong', '香港成人论坛', '香港地区成人论坛社区', '🇭🇰', 'https://141hongkong.com', 'https://141hongkong.com', 'browse', 0, 0, 99, 1, 1, 33, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('hjd2048', 'community', 'HJD2048', '2048核基地', '成人资源分享社区', '☢️', 'https://hjd2048.com', 'https://hjd2048.com', 'browse', 0, 0, 99, 1, 1, 34, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('91forum', 'community', '91论坛', '自拍分享论坛', '国内知名自拍分享社区', '🎬', 'https://91porny.com/forum', 'https://91porny.com/forum', 'browse', 0, 0, 99, 1, 1, 35, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('sex8cc', 'community', 'Sex8.cc', '杏吧论坛', '大型成人社区论坛', '🍑', 'https://sex8.cc', 'https://sex8.cc', 'browse', 0, 0, 99, 1, 1, 36, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);
