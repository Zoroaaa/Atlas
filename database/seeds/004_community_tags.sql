-- 社区标签默认数据（不随部署执行）
--
-- 生产环境已调整过标签内容；部署流程禁止自动执行本文件，
-- 仅在全新环境初始化时手动执行。

INSERT OR IGNORE INTO "community_tags" ("id", "tag_name", "tag_description", "tag_color", "tag_active", "created_by", "created_at", "updated_at") VALUES ('tag_verified', '已验证', '经过验证的可靠搜索源', '#10b981', 1, 'system', 1794808772000, 1794808772000);
INSERT OR IGNORE INTO "community_tags" ("id", "tag_name", "tag_description", "tag_color", "tag_active", "created_by", "created_at", "updated_at") VALUES ('tag_popular', '热门', '下载量较高的热门搜索源', '#f59e0b', 1, 'system', 1794808772000, 1794808772000);
INSERT OR IGNORE INTO "community_tags" ("id", "tag_name", "tag_description", "tag_color", "tag_active", "created_by", "created_at", "updated_at") VALUES ('tag_new', '最新', '新近添加的搜索源', '#3b82f6', 1, 'system', 1794808772000, 1794808772000);
INSERT OR IGNORE INTO "community_tags" ("id", "tag_name", "tag_description", "tag_color", "tag_active", "created_by", "created_at", "updated_at") VALUES ('tag_recommended', '推荐', '官方推荐的优质搜索源', '#8b5cf6', 1, 'system', 1794808772000, 1794808772000);
INSERT OR IGNORE INTO "community_tags" ("id", "tag_name", "tag_description", "tag_color", "tag_active", "created_by", "created_at", "updated_at") VALUES ('tag_high_quality', '高质量', '质量较高的搜索源', '#ef4444', 1, 'system', 1794808772000, 1794808772000);
INSERT OR IGNORE INTO "community_tags" ("id", "tag_name", "tag_description", "tag_color", "tag_active", "created_by", "created_at", "updated_at") VALUES ('tag_jav', 'JAV', 'JAV相关搜索源', '#f97316', 1, 'system', 1794808772000, 1794808772000);
INSERT OR IGNORE INTO "community_tags" ("id", "tag_name", "tag_description", "tag_color", "tag_active", "created_by", "created_at", "updated_at") VALUES ('tag_movie', '电影', '电影相关搜索源', '#06b6d4', 1, 'system', 1794808772000, 1794808772000);
INSERT OR IGNORE INTO "community_tags" ("id", "tag_name", "tag_description", "tag_color", "tag_active", "created_by", "created_at", "updated_at") VALUES ('tag_torrent', '种子', '种子下载相关', '#84cc16', 1, 'system', 1794808772000, 1794808772000);
INSERT OR IGNORE INTO "community_tags" ("id", "tag_name", "tag_description", "tag_color", "tag_active", "created_by", "created_at", "updated_at") VALUES ('tag_magnet', '磁力', '磁力链接搜索', '#22c55e', 1, 'system', 1794808772000, 1794808772000);
INSERT OR IGNORE INTO "community_tags" ("id", "tag_name", "tag_description", "tag_color", "tag_active", "created_by", "created_at", "updated_at") VALUES ('tag_hd', '高清', '高清资源相关', '#a855f7', 1, 'system', 1794808772000, 1794808772000);
