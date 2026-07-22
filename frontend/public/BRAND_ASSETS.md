# Atlas 品牌素材

本目录包含 Atlas 开源聚合搜索引擎的品牌素材，符合 Obsidian Gold 主题设计语言。

## 文件清单

### Logo 和图标
- **logo.svg** - 主 Logo（矢量），用于导航栏、页脚和品牌展示
- **icons/icon.svg** - App 图标（矢量），PWA manifest 引用
- **icons/icon-{size}x{size}.png** - 各尺寸 PWA 图标（由 generate-icons.mjs 生成）
- **icons/apple-touch-icon.png** - Apple 触摸图标
- **icons/shortcut-search.png** - PWA 快捷方式：搜索
- **icons/shortcut-favorites.png** - PWA 快捷方式：收藏
- **favicon.ico** - 网站图标

### 社交分享
- **og-image.svg** - Open Graph 分享图（1200x630），用于微信/Facebook/Twitter 分享

### 宣传素材
- **hero-banner.svg** - Hero 横幅（1920x600），用于首页或营销页面

### 品牌展示
- **brand.html** - 品牌资产展示页，包含完整视觉规范

### 其他
- **screenshots/desktop.png** - 桌面端截图
- **screenshots/mobile.png** - 移动端截图
- **manifest.json** - PWA 清单
- **sw.js** - Service Worker
- **robots.txt** - 搜索引擎爬虫配置
- **sitemap.xml** - 站点地图
- **_headers** - Cloudflare Pages 响应头配置
- **_redirects** - Cloudflare Pages 路由回退配置
- **browserconfig.xml** - Microsoft Tile 配置

## 设计规范

### 颜色
- **主色**: 琥珀金 `#d4a853` → `#f59e0b`
- **强调色**: 玫瑰红 `#f43f5e` → `#e11d48`
- **背景色**: 黑曜石黑 `#0a0a0b`
- **侧边栏**: `#111113`
- **成功色**: Teal `#2dd4bf` → `#14b8a6`

### 字体
- **标题**: Sora（300/400/500/600/700/800）
- **正文**: Plus Jakarta Sans（300/400/500/600/700/800）

### 风格
- 深色奢华主题（Obsidian Gold v3）
- 琥珀金渐变 + 玫瑰红点缀
- 玻璃态效果（blur + saturate）
- 指南针符号（象征探索与搜索）

## 使用说明

1. **logo.svg** 已应用到导航栏（UnifiedNavBar + MainLayout）
2. **og-image.svg** 已在 index.html 中配置为 OG/Twitter 分享图
3. **hero-banner.svg** 可用于营销页面或首页横幅
4. **brand.html** 部署后可通过 `/brand.html` 访问完整品牌规范
5. PWA 图标由 `scripts/generate-icons.mjs` 从 logo.svg 自动生成

## SEO 配置

- robots.txt - 允许公开页面，禁止登录/管理页面
- sitemap.xml - 首页、条款、隐私政策
- Open Graph / Twitter Cards 标签已配置
- 域名：https://atlas.wort.uk
