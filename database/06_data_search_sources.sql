-- ===============================================
-- 搜索源默认数据
-- 版本: 3.0
-- 说明: 包含搜索源大类、分类、搜索源等初始化数据
-- 更新: 2026-06-12 根据全网实测可用性重构资源源站
-- 执行顺序: 06
-- ===============================================

-- ===============================================
-- 1. 搜索源大类初始化数据
-- ===============================================

INSERT OR REPLACE INTO search_major_categories (
    id, name, description, icon, color,
    display_order, is_system, is_active, created_at, updated_at
) VALUES
    ('jav_sources', '🔍 JAV搜索', 'JAV番号、在线播放、磁力资源等', '🔍', '#3b82f6', 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('anime_sources', '🎌 动漫搜索', '动漫、番剧、漫画相关搜索源', '🎌', '#8b82f6', 2, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('movie_sources', '🎥 影视搜索', '电影、电视剧、综艺节目相关搜索源', '🎥', '#3b82f6', 3, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 2. 搜索源分类初始化数据
-- ===============================================

INSERT OR REPLACE INTO search_source_categories (
    id, major_category_id, name, description, icon, color, display_order,
    is_system, is_active, default_searchable, default_site_type, search_priority,
    created_at, updated_at
) VALUES
    ('database', 'jav_sources', '📚 番号资料站', '提供详细的番号信息、封面和演员资料', '📚', '#3b82f6', 1, 1, 1, 1, 'search', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('streaming', 'jav_sources', '🎥 在线播放平台', '提供在线观看和下载服务', '🎥', '#10b981', 2, 1, 1, 1, 'search', 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('torrent', 'jav_sources', '🧲 磁力搜索', '提供磁力链接和种子文件', '🧲', '#f59e0b', 3, 1, 1, 0, 'browse', 10, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('community', 'jav_sources', '💬 社区论坛', '用户交流讨论和资源分享', '💬', '#8b5cf6', 4, 1, 1, 0, 'browse', 10, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('others', 'jav_sources', '🌟 其他资源', '其他类型的搜索资源', '🌟', '#6b7280', 99, 1, 1, 0, 'browse', 10, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 3. 搜索源初始化数据 - 番号资料站
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES
    ('javbus', 'database', 'JavBus', '番号+磁力一体站，信息完善', '提供详细的番号信息、封面、演员资料和磁力链接', '🎬', 'https://www.javbus.com/search/{keyword}', 'https://www.javbus.com', 'search', 1, 1, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javdb', 'database', 'JavDB', '极简风格番号资料站，轻量快速', '提供简洁的番号信息和磁力链接', '📚', 'https://javdb.com/search?q={keyword}&f=all', 'https://javdb.com', 'search', 1, 2, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javlibrary', 'database', 'JavLibrary', '评论活跃，女优搜索详尽', '老牌番号资料站，社区活跃', '📖', 'https://www.javlibrary.com/cn/vl_searchbyid.php?keyword={keyword}', 'https://www.javlibrary.com', 'search', 1, 3, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('rjav', 'database', 'r/JAV', 'Reddit JAV社区', '专注于日本成人视频讨论的Reddit社区', '📖', 'https://reddit.com/r/jav/search?q={keyword}', 'https://reddit.com/r/jav/', 'search', 1, 30, 1, 1, 24, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 4. 搜索源初始化数据 - 在线播放平台
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES 
    ('jable', 'streaming', 'Jable', '高清在线观看，支持多种格式', '知名在线播放平台', '📺', 'https://jable.tv/videos/{keyword}/', 'https://jable.tv', 'search', 1, 5, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javmost', 'streaming', 'JavMost', '免费在线观看，更新及时', '免费在线播放平台', '🎦', 'https://www5.javmost.com/search/{keyword}', 'https://javmost.com', 'search', 1, 6, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javguru', 'streaming', 'JavGuru', '多线路播放，观看流畅', '多线路在线播放', '🎭', 'https://jav.guru/search/{keyword}', 'https://jav.guru', 'search', 1, 7, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('av01', 'streaming', 'AV01', '快速预览站点，封面大图清晰', '封面预览和在线播放', '🎥', 'https://av01.tv/jp/search?q={keyword}', 'https://av01.tv', 'search', 1, 8, 1, 1, 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('missav', 'streaming', 'MissAV', '亚洲最大JAV流媒体平台，月访问量超3亿', '提供高清无码JAV内容，拥有庞大的日本成人视频库，支持1080p流媒体播放', '🎥', 'https://missav.ws/search/{keyword}', 'https://missav.ws', 'search', 1, 9, 1, 1, 27, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('supjav', 'streaming', 'SupJAV', '每日更新的高质量JAV平台', '提供数万部完整长度JAV视频，支持高清流媒体播放，更新频率高', '📺', 'https://supjav.com/search?q={keyword}', 'https://supjav.com', 'search', 1, 10, 1, 1, 28, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('bestjavporn', 'streaming', 'BestJavPorn', '提供审查和无码JAV内容', '拥有大量审查和未审查JAV的综合性站点，内容分类详细', '🎦', 'https://bestjavporn.com/search?q={keyword}', 'https://bestjavporn.com', 'search', 1, 11, 1, 1, 29, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javsb', 'streaming', 'JAV.sb', '专注未审查JAV内容', '拥有超过5600部未审查JAV的免费流媒体平台', '🎭', 'https://jav.sb/search/{keyword}', 'https://jav.sb', 'search', 1, 12, 1, 1, 30, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javleak', 'streaming', 'JAVLeak', '流行日本成人视频平台', '提供高质量审查和未审查日本成人内容，界面友好', '🎥', 'https://javleak.com/search?q={keyword}', 'https://javleak.com', 'search', 1, 13, 1, 1, 31, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javseen', 'streaming', 'JAVSeen', '超10万部完整长度电影', '提供大规模免费流媒体日本成人视频收藏，内容丰富', '🎬', 'https://javseen.tv/search/{keyword}', 'https://javseen.tv', 'search', 1, 14, 1, 1, 32, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javtsunami', 'streaming', 'JAVTsunami', '热门JAV明星专题站', '收录数千部行业热门明星JAV作品，按演员分类清晰', '⚡', 'https://javtsunami.com/search/{keyword}', 'https://javtsunami.com', 'search', 1, 15, 1, 1, 33, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javsubtitled', 'streaming', 'JAV Subtitled', '提供英文字幕JAV内容', '专门提供带英文字幕的JAV内容，方便非日语用户观看', '🎪', 'https://javsubtitled.com/search?q={keyword}', 'https://javsubtitled.com', 'search', 1, 16, 1, 1, 34, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javout', 'streaming', 'JAVOut', '高清JAV视频源', '提供完整长度HD高清JAV视频，画质优秀', '📺', 'https://javout.co/search/{keyword}', 'https://javout.co', 'search', 1, 17, 1, 1, 35, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javgg', 'streaming', 'JavGG', '免费观看平台，速度稳定', '免费在线播放', '⚡', 'https://javgg.net/search/{keyword}', 'https://javgg.net', 'search', 1, 11, 1, 1, 7, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javcl', 'streaming', 'JAVCL', '完整长度AV电影专门站', '专注于来自日本的完整长度AV视频和电影', '🎭', 'https://javcl.com/search/{keyword}', 'https://javcl.com', 'search', 1, 19, 1, 1, 37, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javdoe', 'streaming', 'JavDoe', 'JAV网络联盟主站', '由多个免费和付费站点组成的JAV网络联盟', '🎥', 'https://javdoe.to/search?q={keyword}', 'https://javdoe.to', 'search', 1, 20, 1, 1, 38, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javdesu', 'streaming', 'JAV Desu', '未审查JAV专门站', '提供各种未审查JAV内容，更新频繁', '🎬', 'https://javdesu.tv/search/{keyword}', 'https://javdesu.tv', 'search', 1, 21, 1, 1, 39, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javynow', 'streaming', 'JavyNow', '100%免费日本成人视频', '提供最佳日本成人内容的免费平台', '⚡', 'https://javynow.com/search/{keyword}', 'https://javynow.com', 'search', 1, 22, 1, 1, 40, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javhdporn2', 'streaming', 'JAVHDPorn.net', '免费HD高清JAV', '提供高清JAV内容的免费流媒体平台', '🎪', 'https://javhdporn.net/search?q={keyword}', 'https://javhdporn.net', 'search', 1, 23, 1, 1, 41, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javasslove', 'streaming', 'JAV Ass Lover', '日本成人特色内容', '专注于特定类型日本成人内容的站点', '📺', 'https://javass.love/search/{keyword}', 'https://javass.love', 'search', 1, 24, 1, 1, 42, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javsubtitle', 'streaming', 'JAV Subtitle', '高质量英文字幕JAV', '提供专业英文字幕的高质量JAV内容', '🎦', 'https://javsubtitle.xyz/search?q={keyword}', 'https://javsubtitle.xyz', 'search', 1, 25, 1, 1, 43, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 5. 搜索源初始化数据 - 磁力搜索（浏览站点）
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES 
    ('btsow', 'torrent', 'BTSOW', '中文磁力搜索引擎，番号资源丰富', '知名磁力搜索引擎', '🧲', 'https://btsow.com', 'https://btsow.com', 'browse', 0, 99, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('magnetdl', 'torrent', 'MagnetDL', '磁力链接搜索，资源覆盖全面', '磁力链接搜索引擎', '🔗', 'https://www.magnetdl.com', 'https://www.magnetdl.com', 'browse', 0, 99, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('torrentkitty', 'torrent', 'TorrentKitty', '种子搜索引擎，下载资源丰富', '种子下载搜索', '🐱', 'https://www.torrentkitty.tv', 'https://www.torrentkitty.tv', 'browse', 0, 99, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('sukebei', 'torrent', 'Sukebei', '成人内容种子站，资源全面', '成人内容种子搜索', '🌙', 'https://sukebei.nyaa.si', 'https://sukebei.nyaa.si', 'browse', 0, 99, 1, 1, 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('onejav', 'torrent', 'OneJAV', '免费JAV种子下载站', '提供数千部完整长度JAV电影的种子下载', '🧲', 'https://onejav.com', 'https://onejav.com', 'browse', 0, 99, 1, 1, 25, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('projectjav', 'torrent', 'Project Jav', '大型JAV种子库', '收录超过53000部日本成人视频种子', '🔗', 'https://projectjav.com', 'https://projectjav.com', 'browse', 0, 99, 1, 1, 26, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('nextjav', 'torrent', 'NextJAV', '完整长度JAV种子', '专注于完整长度日本成人视频的种子站点', '🐱', 'https://nextjav.com', 'https://nextjav.com', 'browse', 0, 99, 1, 1, 27, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javjunkies', 'torrent', 'JavJunkies', '十年档案JAV种子站', '拥有十年历史档案的大型JAV种子站点', '🌙', 'https://javjunkies.org', 'https://javjunkies.org', 'browse', 0, 99, 1, 1, 28, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('javbee', 'torrent', 'JAVBEE', 'JAV种子跟踪站', '每月百万访问的JAV种子跟踪站点', '🧲', 'https://javbee.org', 'https://javbee.org', 'browse', 0, 99, 1, 1, 29, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('ijavtorrent', 'torrent', 'iJavTorrent', 'JAV种子下载专门站', '专注于JAV种子文件下载的站点', '🔗', 'https://ijavtorrent.com', 'https://ijavtorrent.com', 'browse', 0, 99, 1, 1, 30, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('empornium', 'torrent', 'Empornium', '私人成人种子站', '综合性私人成人内容种子站点，需要邀请', '🐱', 'https://empornium.is', 'https://empornium.is', 'browse', 0, 99, 1, 1, 31, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('141ppv', 'torrent', '141PPV', '未审查JAV种子', '提供高质量未审查JAV内容种子下载', '🧲', 'https://141ppv.com', 'https://141ppv.com', 'browse', 0, 99, 1, 1, 32, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('lovetorrent', 'torrent', 'LoveTorrent', '综合成人种子站', '跟踪超过16万部成人电影种子的综合站点', '🔗', 'https://lovetorrent.net', 'https://lovetorrent.net', 'browse', 0, 99, 1, 1, 33, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('xxxclub', 'torrent', 'XXXClub', '设计精良的种子站', '界面友好的成人内容种子站点', '🐱', 'https://xxxclub.to', 'https://xxxclub.to', 'browse', 0, 99, 1, 1, 34, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('myjavbay', 'torrent', 'My JAV Bay', 'JAV种子专门站', '专注于JAV内容的种子下载站点', '🌙', 'https://myjavbay.com', 'https://myjavbay.com', 'browse', 0, 99, 1, 1, 35, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 6. 搜索源初始化数据 - 社区论坛（浏览站点）
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES 
    ('t66y', 'community', 'T66Y草榴社区', '1024老牌成人论坛', '成立于2006年的知名成人论坛社区，会员超20万，以"1024"文化著称', '🌿', 'https://t66y.com', 'https://t66y.com', 'browse', 0, 99, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('sehuatang', 'community', '色花堂98堂', '综合成人论坛社区', '大型综合性成人论坛社区，资源丰富，分区详细', '🌸', 'https://sehuatang.org', 'https://sehuatang.org', 'browse', 0, 99, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('5278cc', 'community', '5278.cc', '综合讨论区', '综合性大型成人讨论区，内容多元化', '📋', 'https://5278.cc', 'https://5278.cc', 'browse', 0, 99, 1, 1, 23, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('sexinsex', 'community', 'SexInSex', '老牌成人社区', '历史悠久的成人论坛，资源库丰富', '💬', 'https://sexinsex.net', 'https://sexinsex.net', 'browse', 0, 99, 1, 1, 24, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('sis001', 'community', 'SIS001', '综合成人论坛', '全面的成人内容论坛，版块众多', '📖', 'https://sis001.com', 'https://sis001.com', 'browse', 0, 99, 1, 1, 25, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('southplus', 'community', 'South-Plus', '综合娱乐论坛', '综合性娱乐讨论论坛，内容丰富', '🌐', 'https://south-plus.net', 'https://south-plus.net', 'browse', 0, 99, 1, 1, 26, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('52av', 'community', '52AV', '手机A片王', '移动端优化的成人论坛社区', '📱', 'https://52av.one', 'https://52av.one', 'browse', 0, 99, 1, 1, 27, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('jkforum', 'community', 'JKForum', '捷克论坛', '成人娱乐综合论坛', '💭', 'https://jkforum.net', 'https://jkforum.net', 'browse', 0, 99, 1, 1, 28, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('eyny', 'community', 'EYNY', '伊莉讨论区', '大型综合讨论区，涵盖多种主题', '🗨️', 'https://eyny.com', 'https://eyny.com', 'browse', 0, 99, 1, 1, 29, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('hungya', 'community', '夯鸭论坛', '资源分享论坛', '活跃的成人资源分享社区', '🦆', 'https://hung-ya.com', 'https://hung-ya.com', 'browse', 0, 99, 1, 1, 30, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('oursogo', 'community', 'OurSogo', 'Sogo论坛', '休闲娱乐综合论坛', '🎯', 'https://oursogo.com', 'https://oursogo.com', 'browse', 0, 99, 1, 1, 31, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('cool18', 'community', 'Cool18', '十八禁成人站', '成人内容综合站点', '🔞', 'https://cool18.com', 'https://cool18.com', 'browse', 0, 99, 1, 1, 32, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('141hongkong', 'community', '141HongKong', '香港成人论坛', '香港地区成人论坛社区', '🇭🇰', 'https://141hongkong.com', 'https://141hongkong.com', 'browse', 0, 99, 1, 1, 33, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('hjd2048', 'community', 'HJD2048', '2048核基地', '成人资源分享社区', '☢️', 'https://hjd2048.com', 'https://hjd2048.com', 'browse', 0, 99, 1, 1, 34, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('91forum', 'community', '91论坛', '自拍分享论坛', '国内知名自拍分享社区', '🎬', 'https://91porny.com/forum', 'https://91porny.com/forum', 'browse', 0, 99, 1, 1, 35, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('sex8cc', 'community', 'Sex8.cc', '杏吧论坛', '大型成人社区论坛', '🍑', 'https://sex8.cc', 'https://sex8.cc', 'browse', 0, 99, 1, 1, 36, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 7. 动漫/影视搜索大类
-- ===============================================

INSERT OR REPLACE INTO search_major_categories (
    id, name, description, icon, color,
    display_order, is_system, is_active, created_at, updated_at
) VALUES
('anime_sources', '🎌 动漫搜索', '动漫、番剧、漫画相关搜索源', '🎌', '#8b82f6', 2, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('movie_sources', '🎥 影视搜索', '电影、电视剧、综艺节目相关搜索源', '🎥', '#3b82f6', 3, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 8. 动漫搜索分类（4个子分类）
-- ===============================================

INSERT OR REPLACE INTO search_source_categories (
    id, major_category_id, name, description, icon, color, display_order,
    is_system, is_active, default_searchable, default_site_type, search_priority,
    created_at, updated_at
) VALUES
('anime_database', 'anime_sources', '📚 番剧资料站', 'Bangumi、MAL等动漫资料站点', '📚', '#8b5cf6', 1, 1, 1, 1, 'search', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('anime_torrent', 'anime_sources', '🧲 动漫种子', 'Nyaa、Mikan等动漫磁力资源站', '🧲', '#a855f7', 2, 1, 1, 1, 'search', 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('anime_streaming', 'anime_sources', '📺 在线观看', '各种动漫在线观看平台', '📺', '#ec4899', 3, 1, 1, 1, 'search', 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('anime_manga', 'anime_sources', '📖 漫画资源', '在线漫画阅读和下载站点', '📖', '#f43f5e', 4, 1, 1, 1, 'search', 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 9. 影视搜索分类（4个子分类）
-- ===============================================

INSERT OR REPLACE INTO search_source_categories (
    id, major_category_id, name, description, icon, color, display_order,
    is_system, is_active, default_searchable, default_site_type, search_priority,
    created_at, updated_at
) VALUES
('movie_database', 'movie_sources', '📚 影视资料站', 'TMDB、豆瓣、IMDb等影视资料库', '📚', '#3b82f6', 1, 1, 1, 1, 'search', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('movie_torrent', 'movie_sources', '🧲 影视磁力', '各类电影电视剧磁力资源站', '🧲', '#2563eb', 2, 1, 1, 1, 'search', 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('movie_streaming', 'movie_sources', '📺 在线观看', '在线影视播放平台', '📺', '#0891b2', 3, 1, 1, 1, 'search', 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('movie_live', 'movie_sources', '📡 直播相关', '直播资源和 IPTV 相关站点', '📡', '#059669', 4, 1, 1, 1, 'search', 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 10. 动漫搜索源 - 番剧资料站
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES
('bangumi', 'anime_database', 'Bangumi 番组计划', '中文ACG资料数据库，评分权威', '中文最大的ACG资料分享网站，提供动画、漫画、游戏等详细信息和社区评分', '🎌', 'https://bangumi.tv/subject_search/{keyword}?cat=all', 'https://bangumi.tv', 'search', 1, 1, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('myanimelist', 'anime_database', 'MyAnimeList (MAL)', '全球最大动漫资料站，英文为主', '全球最大的动漫社交网络和数据库，拥有数百万用户和详尽的动漫信息', '🌟', 'https://myanimelist.net/anime.php?q={keyword}', 'https://myanimelist.net', 'search', 1, 2, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('anilist', 'anime_database', 'AniList', '现代UI设计，API友好', '现代化的动漫追踪平台，提供精美的界面和强大的API支持', '📋', 'https://anilist.co/search/anime?sort=SEARCH_MATCH&search={keyword}', 'https://anilist.co', 'search', 1, 3, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('douban_anime', 'anime_database', '豆瓣动漫', '中文影视动漫评分平台', '豆瓣旗下的动漫频道，提供中文用户的动漫评分和评论', '🥬', 'https://www.douban.com/search?q={keyword}&cat=1002', 'https://www.douban.com', 'search', 1, 4, 1, 1, 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('kitsu', 'anime_database', 'Kitsu', '开源动漫追踪平台', '开源的动漫和 manga 追踪平台，支持多种集成', '🦊', 'https://kitsu.io/anime?text={keyword}', 'https://kitsu.io', 'search', 1, 5, 1, 1, 5, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('livechart', 'anime_database', 'LiveChart.me', '新番播出时间表专门站', '专注于提供每季新番的播出时间表和详细信息', '📅', 'https://www.livechart.me/search?q={keyword}', 'https://www.livechart.me', 'search', 1, 6, 1, 1, 6, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('anidb', 'anime_database', 'AniDB', '老牌动漫数据库，数据详尽', '历史悠久的动漫数据库，以详尽的数据和技术信息著称', '🗄️', 'https://anidb.net/anime/?adb.search={keyword}&noalias=1&show.list=1', 'https://anidb.net', 'search', 1, 7, 1, 1, 7, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('notifyanime', 'anime_database', 'Notify.moe', '现代风格动漫追踪', '具有独特视觉设计的动漫追踪和发现平台', '🎨', 'https://notify.moe/search/{keyword}', 'https://notify.moe', 'search', 1, 8, 1, 1, 8, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 11. 动漫搜索源 - 动漫种子
-- 更新: 2026-06-12 AnimeTosho提升为主源(聚合Nyaa多站)
--       Nyaa/Mikan降为备用, ACG.RIP/TokyoToshokan标记超时
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES
('animetosho', 'anime_torrent', 'AnimeTosho', '动漫磁力聚合RSS（主源，最稳定）', '聚合 Nyaa/多站动漫资源的 RSS Feed，含完整磁力链接、大小信息，CF Workers 可直接访问，覆盖最全最稳定', '📡', 'https://feed.animetosho.org/rss2?q={keyword}&orderby=seeds', 'https://animetosho.org', 'api', 1, 1, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('nyaa_si', 'anime_torrent', 'Nyaa.si', '[⚠️ CF拦截] 最大动漫种子索引站', '全球最大的动漫种子搜索引擎，资源丰富更新及时。注意：可能被 Cloudflare 拦截，作为备用源使用', '🧲', 'https://nyaa.si/?f=0&c=0_0&q={keyword}', 'https://nyaa.si', 'search', 1, 10, 1, 1, 10, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('mikan_project', 'anime_torrent', 'Mikan Project', '[⚠️ 超时] 中文动漫种子订阅站', '优秀的中文动漫资源站，支持RSS订阅和自动下载。近期可能超时，作为备用源', '🍊', 'https://mikanani.me/Home/Search?searchstr={keyword}', 'https://mikanani.me', 'search', 1, 11, 1, 1, 11, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('animebytes', 'anime_torrent', 'AnimeBytes', '高质量私有PT站（需邀请）', '知名私有动漫PT站，资源质量极高，需要邀请注册', '🔒', 'https://animebytes.tv/torrents.php?searchstr={keyword}', 'https://animebytes.tv', 'search', 0, 50, 1, 1, 50, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('sukebei_nyaa', 'anime_torrent', 'Sukebei Nyaa', '成人向动漫种子站', 'Nyaa的成人内容镜像站，收录成人向动漫资源', '🔞', 'https://sukebei.nyaa.si/?f=0&c=0_0&q={keyword}', 'https://sukebei.nyaa.si', 'search', 1, 12, 1, 1, 12, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('shana_project', 'anime_torrent', 'Shana Project', '动漫种子跟踪聚合器', '聚合多个来源的动漫种子信息，支持自动追踪', '📡', 'https://www.shanaproject.com/?q={keyword}', 'https://www.shanaproject.com', 'search', 1, 13, 1, 1, 13, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 12. 动漫搜索源 - 在线观看
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES
('bilibili', 'anime_streaming', 'Bilibili 哔哩哔哩', '中国最大弹幕视频网站', '国内最大的二次元文化社区和视频平台，拥有大量正版动漫资源', '📺', 'https://search.bilibili.com/all?keyword={keyword}', 'https://www.bilibili.com', 'search', 1, 1, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('dilidili', 'anime_streaming', '嘀哩嘀哩 DiliDili', '动漫聚合播放平台', '动漫资源聚合站，提供多线路在线播放', '📺', 'https://www.dilidili.wang/search/{keyword}', 'https://www.dilidili.wang', 'search', 1, 2, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('crunchyroll', 'anime_streaming', 'Crunchyroll', '正版动漫流媒体平台', '全球最大的正版动漫流媒体平台，拥有海量正版番剧', '🍥', 'https://www.crunchyroll.com/search?q={keyword}', 'https://www.crunchyroll.com', 'search', 1, 3, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('funimation', 'anime_streaming', 'Funimation', '北美正版动漫平台', '北美地区知名的动漫流媒体平台，现已与Crunchyroll合并', '🎬', 'https://www.funimation.com/search/?q={keyword}', 'https://www.funimation.com', 'search', 1, 4, 1, 1, 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('hidive', 'anime_streaming', 'HIDIVE', 'Sentai旗下流媒体平台', 'Sentai Filmworks旗下的动漫流媒体服务', '📡', 'https://www.hidive.com/search?q={keyword}', 'https://www.hidive.com', 'search', 1, 5, 1, 1, 5, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('aniwatch', 'anime_streaming', 'AniWatch', '免费动漫在线观看', '免费动漫流媒体网站，界面简洁无广告', '👀', 'https://aniwatch.to/search?keyword={keyword}', 'https://aniwatch.to', 'search', 1, 6, 1, 1, 6, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('gogoanime', 'anime_streaming', 'GogoAnime', '热门免费动漫站', '知名的免费动漫在线观看网站，更新速度快', '🎌', 'https://gogoanime3.net/search.html?keyword={keyword}', 'https://gogoanime3.net', 'search', 1, 7, 1, 1, 7, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('9anime', 'anime_streaming', '9Anime', '高清动漫流媒体站', '提供高清画质的免费动漫在线观看平台', '🔢', 'https://9anime.gs/search?keyword={keyword}', 'https://9anime.gs', 'search', 1, 8, 1, 1, 8, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 13. 动漫搜索源 - 漫画资源
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES
('mangadex', 'anime_manga', 'MangaDex', '开源漫画聚合平台', '全球最大的开源漫画聚合阅读平台，支持多语言', '📖', 'https://mangadex.org/titles?q={keyword}', 'https://mangadex.org', 'search', 1, 1, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('manganelo', 'anime_manga', 'MangaNelo', '热门漫画阅读站', '知名的漫画在线阅读网站，资源丰富更新快', '📚', 'https://manganelo.com/search/story/{keyword}', 'https://manganelo.com', 'search', 1, 2, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('mangakakalot', 'anime_manga', 'MangaKakalot', '免费漫画阅读平台', '大型免费漫画阅读网站，收录大量漫画作品', '📖', 'https://mangakakalot.com/search_result/?keyw={keyword}', 'https://mangakakalot.com', 'search', 1, 3, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('bilibili_comic', 'anime_manga', '哔哩哔哩漫画', 'B站官方漫画平台', '哔哩哔哩旗下的正版漫画阅读平台', '📱', 'https://manga.bilibili.com/search-result?word={keyword}', 'https://manga.bilibili.com', 'search', 1, 4, 1, 1, 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('dmzj', 'anime_manga', '动漫之家', '老牌中文漫画站', '历史悠久的中文漫画资讯和阅读平台', '🏠', 'https://so.dmzj.com/keywords/{keyword}.html', 'https://www.dmzj.com', 'search', 1, 5, 1, 1, 5, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('manhuagui', 'anime_manga', '漫画柜', '中文漫画在线阅读', '中文漫画在线阅读网站，资源丰富分类清晰', '🗄️', 'https://www.manhuagui.com/soso.html?keyword={keyword}', 'https://www.manhuagui.com', 'search', 1, 6, 1, 1, 6, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('mangafire', 'anime_manga', 'MangaFire', '现代UI漫画阅读站', '界面现代化的漫画阅读平台，体验流畅', '🔥', 'https://mangafire.to/search?q={keyword}', 'https://mangafire.to', 'search', 1, 7, 1, 1, 7, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('mangasee', 'anime_manga', 'MangaSee', '高清漫画阅读站', '专注于提供高清画质漫画的在线阅读平台', '👁️', 'https://mangasee123.com/search/?name={keyword}', 'https://mangasee123.com', 'search', 1, 8, 1, 1, 8, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 14. 影视搜索源 - 影视资料站
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES
('tmdb', 'movie_database', 'The Movie Database (TMDB)', '开源电影数据库，API友好', '全球最流行的开源电影和电视节目数据库，被众多应用使用', '🎬', 'https://www.themoviedb.org/search?query={keyword}&language=zh-CN', 'https://www.themoviedb.org', 'search', 1, 1, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('douban_movie', 'movie_database', '豆瓣电影', '中文影视评分权威平台', '中文世界最具影响力的电影评分和评论社区', '🥬', 'https://movie.douban.com/j/subject_suggest?q={keyword}', 'https://movie.douban.com', 'search', 1, 2, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('imdb', 'movie_database', 'IMDb', '全球最大影视资料库', '亚马逊旗下的全球最权威电影数据库和评分平台', '⭐', 'https://www.imdb.com/find?s=all&q={keyword}', 'https://www.imdb.com', 'search', 1, 3, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('trakt', 'movie_database', 'Trakt', '影视追踪同步平台', '跨平台的影视观看记录追踪和同步服务', '📺', 'https://trakt.tv/search?query={keyword}', 'https://trakt.tv', 'search', 1, 4, 1, 1, 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('letterboxd', 'movie_database', 'Letterboxd', '影迷社交平台', '专注于电影的社交网络，影评和片单分享', '🎞️', 'https://letterboxd.com/search/films/{keyword}/', 'https://letterboxd.com', 'search', 1, 5, 1, 1, 5, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('rottentomatoes', 'movie_database', '烂番茄 Rotten Tomatoes', '专业影评聚合平台', '知名影评聚合网站，提供专业影评人和观众评分', '🍅', 'https://www.rottontomatoes.com/search?searchQuery={keyword}', 'https://www.rottentomatoes.com', 'search', 1, 6, 1, 1, 6, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('metacritic', 'movie_database', 'Metacritic', '综合评分平台', '专业媒体评分聚合平台，涵盖电影、游戏、音乐', '📊', 'https://www.metacritic.com/search/{keyword}/?category=13', 'https://www.metacritic.com', 'search', 1, 7, 1, 1, 7, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('themoviedb_cn', 'movie_database', 'TMDB中文论坛', 'TMDB中文社区', 'TMDB中文用户社区，提供中文元数据和讨论', '🇨🇳', 'https://www.themoviedb.org/search?query={keyword}&language=zh-CN', 'https://www.themoviedb.org', 'search', 1, 8, 1, 1, 8, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 15. 影视搜索源 - 影视磁力
-- 更新: 2026-06-12 移除失效源(YTS/1337x/RARBG/Lime/TG/BT4G)
--       新增 Torrentio(聚合多源) + TPB API(apibay.org)
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES
('torrentio', 'movie_torrent', 'Torrentio', '聚合多源磁力API（Stremio生态）', '聚合 YTS/1337x/TPB/RARBG/TorrentGalaxy 等多站资源，通过TMDB ID查询，返回infoHash+磁力链接，质量最高覆盖最全', '🌐', 'https://torrentio.strem.fun/stream/movie/{tmdb_id}.json', 'https://torrentio.strem.fun', 'api', 1, 1, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('pirate_bay_api', 'movie_torrent', 'TPB API (apibay)', '海盗湾官方JSON API，关键词搜索', 'The Pirate Bay 官方 JSON API (apibay.org)，支持关键词搜索，CF Workers 可直接访问，资源覆盖最广', '☠️', 'https://apibay.org/q.php?q={keyword}&cat=0', 'https://thepiratebay.org', 'api', 1, 2, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 16. 影视搜索源 - 在线观看
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES
('netflix_info', 'movie_streaming', 'Netflix', '全球最大流媒体平台', '全球领先的流媒体娱乐服务平台，原创内容丰富', '🎬', 'https://www.netflix.com/search?q={keyword}', 'https://www.netflix.com', 'search', 1, 1, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('youtube_movies', 'movie_streaming', 'YouTube Movies', '免费电影频道', 'YouTube上的免费和付费电影内容频道', '▶️', 'https://www.youtube.com/results?search_query={keyword}+movie', 'https://www.youtube.com', 'search', 1, 2, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('justwatch', 'movie_streaming', 'JustWatch', '流媒体聚合搜索', '聚合各大流媒体平台的内容搜索，快速找到在哪看', '🔍', 'https://www.justwatch.com/cn/search?q={keyword}', 'https://www.justwatch.com', 'search', 1, 3, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('reelgood', 'movie_streaming', 'ReelGood', '流媒体统一入口', '整合所有主流流媒体的统一搜索和观看指南', '📺', 'https://reelgood.com/search?q={keyword}', 'https://reelgood.com', 'search', 1, 4, 1, 1, 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('playpilot', 'movie_streaming', 'PlayPilot', '北欧流媒体聚合器', '覆盖200+流媒体服务的聚合搜索平台', '✈️', 'https://playpilot.com/search?q={keyword}', 'https://playpilot.com', 'search', 1, 5, 1, 1, 5, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('putlocker', 'movie_streaming', 'Putlocker', '免费影视流媒体', '知名的免费在线影视观看平台', '🎥', 'https://putlockers.name/search/{keyword}', 'https://putlockers.name', 'search', 1, 6, 1, 1, 6, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('fmovies', 'movie_streaming', 'FMovies', '免费电影电视剧站', '提供大量免费电影和电视剧在线观看', '🎬', 'https://fmovies.to/movie/search.html?keyword={keyword}', 'https://fmovies.to', 'search', 1, 7, 1, 1, 7, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('solarmovie', 'movie_streaming', 'SolarMovie', '高清影视在线观看', '高清画质的免费影视在线观看平台', '☀️', 'https://solarmovie.pe/search/{keyword}', 'https://solarmovie.pe', 'search', 1, 8, 1, 1, 8, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 17. 影视搜索源 - 直播相关/IPTV
-- ===============================================

INSERT OR REPLACE INTO search_sources (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_system, is_active,
    display_order, created_at, updated_at
) VALUES
('iptv_org', 'movie_live', 'IPTV.Org', '全球IPTV源集合', '收集整理全球可用的IPTV直播源，持续维护更新', '📡', 'https://iptv-org.github.io/', 'https://iptv-org.github.io', 'browse', 0, 99, 1, 1, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('tv_mosaic', 'movie_live', 'TV Mosaic', 'IPTV播放器聚合工具', 'IPTV播放和管理工具，支持多种EPG格式', '📺', 'https://tvmosaic.com', 'https://tvmosaic.com', 'browse', 0, 99, 1, 1, 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('plex_tv', 'movie_live', 'Plex Live TV', 'Plex DVR直播功能', 'Plex媒体服务器的Live TV & DVR功能，支持电视调谐器', '📀', 'https://www.plex.tv/tv-live-tv-dvr/', 'https://www.plex.tv', 'browse', 0, 99, 1, 1, 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('stalker', 'movie_live', 'Stalker Middleware', 'IPTV中间件解决方案', '企业级IPTV/OTT解决方案中间件', '🎯', 'https://github.com/nicholasgasior/stalker', 'https://github.com/nicholasgasior/stalker', 'browse', 0, 99, 1, 1, 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('xteve', 'movie_live', 'xTeve', 'Plex/DVR虚拟调谐器', '为Plex和Emby创建虚拟调谐器的工具，支持M3U', '🔧', 'https://github.com/xteve/xTeve', 'https://github.com/xteve/xTeve', 'browse', 0, 99, 1, 1, 5, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('iptvnator', 'movie_live', 'IPTVnator', '跨平台IPTV播放器', '基于Electron的跨平台IPTV播放器应用', '📱', 'https://github.com/4gray/iptvnator', 'https://github.com/4gray/iptvnator', 'browse', 0, 99, 1, 1, 6, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('epg_grabber', 'movie_live', 'WebGrab+Plus', 'EPG电子节目抓取工具', '从各网站抓取EPG节目单数据的工具', '📋', 'https://forum.webgrabplus.com/', 'https://forum.webgrabplus.com', 'browse', 0, 99, 1, 1, 7, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('tvguide', 'movie_live', 'OnLine TV Guide', '在线电视节目表', '提供全球各地电视台的节目时间表查询', '📅', 'https://www.onlinetvguide.com/', 'https://www.onlinetvguide.com', 'browse', 0, 99, 1, 1, 8, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);
