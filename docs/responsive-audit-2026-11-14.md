# 前端多端适配审查（2026-11-14）

> 本轮只做审查，未修改业务代码。审查环境为本地 `wrangler dev` + Vite，测试账号 `tester`（普通用户）与 `admin`（管理员），本地 D1 现有收藏 4、搜索历史 46、社区帖子 9、通知 3；JAV 实际返回 25 条，动漫实际返回 60 条。临时脚本与截图未提交。
>
> **2026-11-14 追加：P0/P1/P2 已全部修复并逐视口复测，修复方式、根因与前后对比见第 11 节。**

## 1. 断点与布局约定（先确认，再测试）

| 断点 | 宽度 | 项目中的实际含义 |
| --- | --- | --- |
| `xs` | 475 | 极小屏，少数卡片/按钮的补充调整 |
| `sm` | 640 | 大屏手机；`≤640` 有一条全局触控规则给 `button/a` 加 `min-height/min-width: 44px` |
| `md` | 768 | 平板竖屏。主搜索页在此切到“桌面 tab 行”；个人中心/社区/管理后台仍保留移动抽屉；底部 `MobileTabBar` 在 `md` 以上隐藏 |
| `lg` | 1024 | 平板横屏/小笔记本。主搜索 tab 显示文字标签；个人中心/社区/管理后台显示固定侧栏；收藏页切 3 列 |
| `xl` | 1280 | 主搜索结果页出现 340px 右栏；搜索 tab 的 `px` 变为 `px-4` |
| `2xl` | 1440 | 内容最大宽度 1440 |

关键布局文件：
- `frontend/src/index.css`：`@theme` 断点、`.safe-area-inset-*`、触控尺寸规则、横向筛选条。
- `frontend/src/components/layout/UnifiedNavBar.tsx`：主搜索页顶部导航（含 320/360 溢出源）。
- `frontend/src/components/layout/MobileTabBar.tsx`：`md:hidden` 固定底栏。
- `frontend/src/components/layout/DashboardLayout.tsx` / `CommunityPanelLayout.tsx` / `AdminPanelLayout.tsx`：`lg` 才切侧栏，`<lg` 用抽屉。
- `desktop/electron/main.js`：`minWidth: 960`、`minHeight: 640`。
- `mobile/android/.../MainActivity.java`：Capacitor `BridgeActivity`，加载远程地址 `https://atlas.wort.uk`。

## 2. 结论摘要

- **P0 × 2**：320/360 顶部导航横向溢出；管理后台系统配置页在 320/390 布局崩坏。
- **P1 × 5**：1024–1279 主搜索 tab 文案换行（1024 时按钮溢出 header）；1024 收藏页三列卡片内部溢出、操作图标被裁；后台表格在窄屏被裁且没有明显滚动提示；641–1023 平板触控目标系统性小于 44px；320 后台统计卡文案被截断成「今日…」。
- **P2 × 8**：仪表盘统计卡标签换行、社区超长英文标题无省略号、toast 覆盖吸顶导航、横向筛选条无滚动提示、16×16 复选框命中区、Android 底部弹层未处理 safe-area、768 导航形态割裂、Electron 最小宽度落入移动布局。
- **验证通过**：390/1024/1440 主流程页面无文档级横向溢出；Android 安全区（模拟 47/34）顶部/底栏偏移正确；390 弹层可滚动；1440 导航单行、结果页右栏正常；Electron 960×640 下表格不崩。
- **未测成/存疑**：真机软键盘与返回键、Android 真机 safe-area、电影/漫画真实结果页、搜索建议下拉、320/1024 弹层细节、960×600 Electron 内容区。

## 2.1 实测覆盖矩阵

`✓` 完成布局测量；`部分` 只测了部分页面/空态；`—` 未测。

| 页面组 | 320 | 360 | 390 | 768 | 1024 | 1280 | 1440 | 960 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 主搜索（idle / 源站） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 主搜索结果（JAV/动漫等） | 部分 | — | ✓ | 部分 | ✓ | 部分 | ✓ | — |
| 个人中心（概览/收藏/历史/设置/通知等） | 部分 | — | ✓ | 部分 | ✓ | 部分 | 部分 | 部分 |
| 社区（列表/详情/标签/我的） | ✓ | — | ✓ | ✓ | ✓ | ✓ | 部分 | — |
| 管理后台（全部子页） | 部分 | — | ✓ | 部分 | ✓ | 部分 | 部分 | 部分 |
| 登录/注册 | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 我的/帮助/条款 | 部分 | — | ✓ | 部分 | ✓ | 部分 | — | 部分 |

说明：320/360 的 `✓` 只代表该页面组中代表性页面（主搜索、社区、帖详情、登录、后台 users/config）已测；五类结果中电影/漫画只测空态，小说只测 390，动漫 1024/1280 未单独跑完。

## 3. P0：真的坏 / 不可用

### P0-1 320/360 主搜索页顶部导航横向溢出，头像被推到屏幕外

- **页面/视口**：`/main?tab=jav`（以及共用 `UnifiedNavBar` 的所有主搜索页）@ 320×720、360×800。
- **现象**：文档横向滚动。320 下 `scrollWidth=372 / clientWidth=320`，溢出 **52px**；360 下溢出 **12px**。右侧操作组 `div.flex.items-center.gap-1` 宽约 350px、右边界 366px，头像/语言入口被裁到视口外；390 下刚好不溢出。
- **证据**：`.screenshots/responsive-audit/320/main-idle.png`、`320/more-drawer.png`；采集数据见 `.screenshots/responsive-audit/metrics/focus.json`（320 `main-jav`：`overflowX=52`，offender 为 `div.flex.items-center.gap-1`，`right=366`）。
- **根因**：`<sm` 时 Logo + 通知/主题/下载/更多/语言/头像仍全部保留；仅代理按钮被隐藏。该组最小宽度约 350px，加上 Logo、间距和左右 padding 超过 320/360，容器既不换行也不收缩。
- **建议改法**：`<sm` 只保留「更多」+ 头像；把通知/主题/下载/语言收进「更多」抽屉（抽屉已在 320 验证可开、可滚、项高 44px）。改完在 320/360/390 复测 `scrollWidth === clientWidth`。这是本次唯一影响“页面可直接使用”的移动端缺陷，优先修。

### P0-2 管理后台「系统配置」在 320/390 布局崩坏、内容重叠

- **页面/视口**：`/admin-panel/config` @ 320×720、390×844。
- **现象**：
  - 标题「系统配置」被挤成竖排「系统 / 配置」；
  - 320 下「变更日志 / 导入 / 导出」操作按钮右侧被裁切；
  - 配置行内 `site_name` 的值 `Atlas` 落到类型/公开徽章下方并与之重叠；布尔项 `enable_registration` 的值与「公开」徽章、开关重叠，无法阅读。
  - 320 下容器把超宽内容裁掉，因此文档 `overflowX=0`，属于“被 `overflow:hidden` 掩盖的溢出”。
- **证据**：`.screenshots/responsive-audit/320/admin-config.png`、`390/admin-config.png`；320 采集到卡片内 `scrollWidth=304 / clientWidth=280`（被裁 24px）。
- **根因**：页头是单行 `flex`（标题 + 3 个操作按钮都不可换行）；配置行同样是单行 `flex justify-between`，左侧 key + 类型徽章 + 公开徽章不换行，右侧值/控件被压到没有空间；父容器裁切但不换行。
- **建议改法**：`<sm` 页头改纵向堆叠（标题一行、操作按钮一行，允许 wrap）；配置行在 `<md` 改为左右两段上下排列，key/徽章允许 `flex-wrap`，值/控件单独一行；去掉用裁切兜底的做法。改完在 320/360/390/768 复测。

## 4. P1：明显影响体验

### P1-1 1024–1279 主搜索 tab 文案换行；1024 时按钮高出 header

- **页面/视口**：`/main?tab=jav`（同样影响 5 个 tab）@ 1024×768、1280×800。
- **现象**：`lg` 起显示文字标签，但空间不足：
  - 1024：标签实测高 38px（两行），按钮高 56px，`JAV` 按钮高 **76px**，而 header 高 65px，按钮溢出 header 底部；
  - 1280：标签仍是两行（高 38px），按钮高 56px；
  - 1440：标签单行 18px，按钮 36px，正常。
  - 视觉上「JAV搜 / 索」「动漫搜 / 索」逐字换行，激活态橙色药丸比导航条更矮/更长，观感明显异常。
- **证据**：`.screenshots/responsive-audit/1280/nav-clip.png`（五个标签均为两行）；`.screenshots/responsive-audit/metrics/navshot.json`（1024/1280/1440 的 `labelH`、`h`、`headerH`）。
- **根因**：标签在 `lg` 就出现，但 1024–1279 的可用宽度不足；`.tab-label` 的 `white-space` 为 `normal`（无 `whitespace-nowrap`），中文可在任意字符间换行；`xl` 的 `px-4` 又进一步压缩了按钮内宽。
- **建议改法**：二选一——(a) 标签延后到 `xl` 显示，`lg–xl` 只显示图标 + tooltip；(b) 保留 `lg` 标签但加 `whitespace-nowrap`，同时把右侧次级图标收进「更多」以腾出宽度。两者都需在 1024/1280 复测按钮高度不超过 header。

### P1-2 1024 收藏页三列卡片内部溢出，右侧操作图标被裁

- **页面/视口**：`/dashboard/favorites` @ 1024×768（768 两列正常、1280 三列正常）。
- **现象**：第三列卡片右缘超出内容区，卡片右上「打开」和「删除」两个图标各被裁掉一半；文档出现 2px 横向溢出；卡片内部 `scrollWidth` 比 `clientWidth` 大 65px。
- **证据**：`.screenshots/responsive-audit/1024/dash-favorites.png`；采集数据 `.screenshots/responsive-audit/metrics/results.json`（`dash-favorites` @1024：`overflowX=2`，`textOverflow` 链中卡片内部 delta 65）。
- **根因**：`lg:grid-cols-3` 在 1024 下每列约 230px，而卡片封面 `sm:w-36`（144px）+ 状态/番号/操作按钮的最小内容宽度约 244px；内部 `flex-1 min-w-0` 只解决了外层，封面与右侧按钮组不收缩。
- **建议改法**：三列延后到 `xl`；或在 `lg` 把封面缩到 `w-28`、按钮组允许收缩，并给卡片 `overflow-hidden` 防再次外溢。验收标准：1024/1100/1280 卡片内容不超出白卡边界。

### P1-3 390/320 管理后台表格被裁且没有明显滚动提示；表头竖排

- **页面/视口**：`/admin-panel/users` @ 320/390；`/admin-panel/sessions` @ 390。
- **现象**：
  - 390 下表格只露出「用户 / 角色 / 登录次数」三列，「登录次数」被压成逐字竖排；状态、注册时间、操作列在屏幕外；
  - 320 下表格可视宽度 280px，表格实际宽 651px，隐藏 371px；
  - 768 下表格能放下（712px），但「登录次数」「状态」表头仍换行，「已激活」徽章被压成两行；
  - 横向滚动容器存在（`overflow-x:auto`），但触屏上没有滚动条/渐变/提示，用户不知道右侧还有列。
- **证据**：`.screenshots/responsive-audit/390/admin-users.png`、`320/admin-users.png`、`768/admin-users.png`；`.screenshots/responsive-audit/metrics/focus.json`（320 表格 wrapper `280/651`，6 列）。
- **根因**：后台表格没有为窄屏设计列优先级；表头未统一 `whitespace-nowrap`；滚动容器只有原生滚动条，移动端默认不可见（或仅滚动时短暂出现）。
- **建议改法**：窄屏把低优先级列折叠进「详情」或允许横向滚动但增加固定首列 + 右侧渐隐/“横向滑动查看更多”提示；表头加 `whitespace-nowrap`，状态徽章 `whitespace-nowrap`。320 下建议直接改卡片列表，而不是硬塞 6 列表格。

### P1-4 641–1023 平板触控目标系统性小于 44×44

- **页面/视口**：768×1024 主搜索/后台/社区。
- **现象**（实测）：
  - 主搜索 5 个 tab：**43×36**；
  - 后台汉堡/主题等 icon 按钮：**36×36**；主搜索 icon 按钮：40×40；
  - JAV 子模式「番号搜索/女优搜索/影片标题」：**63×28**；
  - 后台抽屉侧栏项高 40px（宽 267）。
  - 同一批按钮在 390 下因为 `≤640` 的全局规则被强制到 44×44，所以平板反而比手机更难点。
- **证据**：`.screenshots/responsive-audit/metrics/focus.json` 768 `main-jav`、`admin-users` 的 `tiny` 列表；`.screenshots/responsive-audit/metrics/overlays.json` 768 `smallItems`。
- **根因**：全局触控尺寸规则只写在 `@media (max-width: 640px)`，641–1023 的触屏平板完全不生效。
- **建议改法**：把规则改为 `@media (pointer: coarse)`，或至少扩展到 `max-width: 1023px`；重点保证顶部导航、子模式、抽屉导航项 ≥44px。

### P1-5 320 后台统计卡文案被截断成「今日…」

- **页面/视口**：`/admin-panel/users` @ 320×720。
- **现象**：两张统计卡的标题都截断成「今日...」，无法区分是「今日登录」还是「今日新增」；数值仍可读。
- **证据**：`.screenshots/responsive-audit/320/admin-users.png`。
- **根因**：统计卡在 `xs` 仍两列，标题使用单行 `truncate`，没有短文案或两行策略。
- **建议改法**：`<sm` 改单列，或标题允许两行 / 使用更短的移动端文案。

## 5. P2：打磨项

### P2-1 1024 仪表盘统计卡标签换行

- **页面/视口**：`/dashboard` @ 1024×768。
- **现象**：「我的搜索次数」变成「我的搜索次 / 数」，「本周登录」变成「本周登 / 录」，第一张卡的「↑ 100% vs 上周」折成三行。
- **证据**：`.screenshots/responsive-audit/1024/dashboard.png`。
- **根因**：`lg` 下统计卡变成 3 列，单卡约 160px，标签和百分比未做 `whitespace-nowrap` 或短文案。
- **建议**：统计卡 3 列延后到 `xl`，或标签/百分比允许更小的 `text-xs` 并禁止在词中断行。

### P2-2 社区超长英文标题被裁且没有省略号（1024）

- **页面/视口**：`/community` @ 1024×768。
- **现象**：标题「测试帖子标题包含超长英文 Supercalifragil…」作为无空格长单词时，`h3` 宽 188px、内容 228px，溢出 40px 被裁，视觉上没有省略号。
- **证据**：`.screenshots/responsive-audit/1024/community.png`；采集数据 `masked` 中该 `h3`。
- **根因**：标题使用 `line-clamp`（`-webkit-box` + `overflow:hidden`），但没有 `overflow-wrap:anywhere`/`break-words`，连续英文单词无法断行。
- **建议**：标题加 `break-words` 或 `[overflow-wrap:anywhere]`；必要时补 `title` 属性。

### P2-3 Toast 覆盖吸顶导航（≥640）

- **页面/视口**：任意桌面/平板页；实测 `/admin-panel/data-storage` @ 1024。
- **现象**：toast 容器 `fixed top-4 right-4 z-50`，与 64px 高的 sticky header 重叠 44%；错误 toast 会盖住右上角导航/操作区。移动端已改为 `bottom-4 + 4.5rem` 避让底栏，但桌面端没有避让 header。
- **证据**：`.screenshots/responsive-audit/metrics/results.json` 1024 `admin-storage` 的 `fixedOverlaps`（header z20 vs toast z50，ratio 0.44）。
- **建议**：toast 的 `top` 改为 `calc(header 高度 + safe-area)`，或统一放到底部中间。

### P2-4 横向筛选条/分类条无滚动提示

- **页面/视口**：`/community` @ 320/390；`/main` 顶部 5 tab @ 320。
- **现象**：社区标签条可滚 266px、且 `no-scrollbar` 隐藏滚动条；屏幕外还有标签，用户只能靠“最后一项被裁”猜。主搜索 320 下第 5 个 tab 也在滚动容器外。
- **证据**：`.screenshots/responsive-audit/metrics/focus.json` 320 `community`（`delta=266`，`hide=true`）；`.screenshots/responsive-audit/390/community.png`（右侧筛选被裁）。
- **建议**：加左右渐隐遮罩/小箭头，或保留部分露出 + `scroll-snap`；不要完全隐藏滚动条。

### P2-5 批量选择复选框命中区仅 16×16

- **页面/视口**：`/dashboard/history` @ 320/390；源站收录页。
- **现象**：`input[type=checkbox]` 实测 16×16，且没有 `label` 包裹；≤640 的全局 44px 规则不适用于复选框。登录页复选框有 label 祖先，命中区尚可。
- **证据**：`.screenshots/responsive-audit/metrics/focus.json` 320/390 `dash-history` 的 `tiny` 列表（`hasLabelAncestor=false`）。
- **建议**：用 `label` 包住复选框和整行左侧区域，或给复选框加透明 44px padding 的点击层。

### P2-6 Android 底部弹层未显式处理 safe-area

- **页面/视口**：本地库详情/图片预览等底部弹层 @ 390（Android WebView）。
- **现象**：390 实测弹层是 `fixed inset-0` + `items-end` 的底部面板，`max-h-[90vh]` 且内部可滚动（正常）；但面板本身未加 `padding-bottom: env(safe-area-inset-bottom)`，全面屏手势条可能压住底部按钮。顶栏和底栏的 safe-area 已正确处理（见“验证通过”）。
- **证据**：`.screenshots/responsive-audit/metrics/modal.json`（390 弹层 `fixed inset-0`，内部可滚）；`frontend/src/components/ui/Modal.tsx` 的 `items-end sm:items-center p-0 sm:p-4`。
- **建议**：底部弹层加 `pb-[env(safe-area-inset-bottom)]`；真机验证后再定优先级。

### P2-7 768 平板导航形态割裂（两不像）

- **页面/视口**：768×1024。
- **现象**：同一宽度下，主搜索页已使用桌面式 5 tab 行（`md`），而个人中心/社区/管理后台仍是移动抽屉（`lg` 才切侧栏）；同时 `MobileTabBar` 在 `md` 以上隐藏，平板既没有底栏，也没有侧栏，只剩汉堡。
- **证据**：`.screenshots/responsive-audit/768/community.png`（汉堡 + 无底栏）、`768/sources.png`（主搜索桌面式 tab 行）。
- **建议**：明确 768 的定位。要么把底栏保留到 `lg`，要么把后台/社区侧栏提前到 `md`；不要一半桌面一半移动。

### P2-8 Electron 最小宽度 960 落入移动布局

- **页面/视口**：960×640（Electron `minWidth/minHeight`）。
- **现象**：960 下管理后台没有固定侧栏，而是汉堡抽屉；主搜索 tab 只显示图标。表格能放下（904px，无横向溢出），布局不崩，但与桌面端预期不一致。960 仍在 `lg` 以下。
- **证据**：`.screenshots/responsive-audit/metrics/results.json` 960 `admin-users`（表格 904px，无溢出，无固定侧栏）；`desktop/electron/main.js` 的 `minWidth: 960`。
- **建议**：把 Electron `minWidth` 提到 1024（或 1100），或把后台/个人中心侧栏断点下调到 960。改动后重点回归后台表格与侧栏。

## 6. 已验证通过 / 不是问题

1. **390/1024/1440 主搜索、JAV 结果、社区、帖子详情、个人中心、登录注册无文档级横向溢出**（`overflowX=0`）。JAV 结果页在 390/1024/1440 均无溢出、无被裁内容。
2. **Android 安全区**：用 CDP `Emulation.setSafeAreaInsetsOverride` 模拟 top=47 / bottom=34 后，header `padding-top` 变为 47px，底栏 `padding-bottom` 变为 34px；`viewport-fit=cover` 已存在。顶栏/底栏实现正确（`.screenshots/responsive-audit/metrics/safe.json`）。
3. **弹层滚动**：390 下拉起本地库详情，`fixed inset-0` 全屏遮罩、底部面板、内容区可滚动，`max-h-[90vh]` 生效。
4. **1440 导航单行**：五个 tab 单行 36px 高；1280/1024 才出现换行，说明问题集中在 `lg–xl` 区间。
5. **Electron 960×640 表格不崩**：后台用户表 904px，容器无横向溢出。
6. **英文/繁体 390**：主搜索、社区、帖子详情、后台用户、登录页均无文档级溢出；按钮未撑破容器（部分标题被过度截断，见 P2-2）。
7. **未发现纯 hover 关键操作**：hover 相关类主要是装饰/图表 tooltip；删除、复制、打开等操作在触屏下仍可见可点。图表 tooltip 仅 hover 展示属于信息层，不是操作不可达。
8. **底栏与内容遮挡**：`AdminPanelLayout`/`DashboardLayout` 已为 `<md` 预留 `3.5rem + safe-area` 底部空间，实测 320/390 内容末行可滚出底栏上方。

## 7. 没测成 / 存疑（不要把以下当结论）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| Android 真机软键盘 | 未测 | 代码没有 `visualViewport` 处理；搜索框在顶部通常不受影响，但社区底部输入/弹层输入在 `adjustPan` 设备上是否被键盘遮挡，需要真机验证。模拟矮视口不等价。 |
| Android 返回键 | 未测 | Capacitor 默认 WebView 返回行为；URL 已保存 `tab/sub/q`，未发现布局相关处理。 |
| Android 真机 safe-area | 部分验证 | 只用 CDP 模拟了 insets，未在刘海/手势条真机上看像素。 |
| 电影/漫画真实结果页 | 未测成 | 本地源请求超时/无数据，仅验证了空态；结果卡布局与动漫共用组件，但未用真实数据验收。 |
| 搜索建议下拉 | 未测成 | 合成输入未触发出下拉（可能被 debounce/焦点逻辑拦截），本轮不对其宽度/裁切下结论。 |
| 320/1024 弹层 | 未测成 | 弹层脚本在 390 后中断；390 结论不外推到其它宽度。 |
| 960×600 Electron 内容区 | 未测 | 只测了 960×640；Electron 标题栏/边框会让实际内容高度更小，建议改完 minWidth 后用真实窗口复核。 |
| 动漫结果页 1024/1440 | 部分验证 | 1440 JAV 结果已验证；动漫在 598 宽真实结果下无溢出，宽屏未单独跑完。 |
| 后台 320 其余页面 | 未全测 | 320 覆盖了 users/config/community/post/login/dashboard；其余后台页只测了 390/1024。 |

## 8. 建议的修复批次

**批次 A：导航系统（一次改完，收益最高）**
- P0-1 320/360 顶部溢出；
- P1-1 1024–1279 tab 换行 / 1024 按钮溢出 header；
- P1-4 641–1023 触控目标 <44。
- 这三项都在 `UnifiedNavBar.tsx` + `index.css`，适合一个 PR。验收视口：320、360、390、768、1024、1280、1440；验收标准：无横向滚动、tab 单行、按钮高度 ≤ header、触控目标 ≥44。

**批次 B：后台窄屏（独立排期，回归面较大）**
- P0-2 配置页堆叠；
- P1-3 表格列优先级 / 滚动提示 / 表头不换行；
- P1-5 320 统计卡文案；
- P2-8 Electron 最小宽度（需要产品确认 960 还是 1024）。
- 涉及 `AdminPanelLayout`、`shared.tsx` 表格封装、`ConfigTab`、各 Tab 的统计卡；建议单独一轮，覆盖 320/390/768/960/1024。

**批次 C：个人中心（小改动，可一次完成）**
- P1-2 1024 收藏页三列溢出；
- P2-1 仪表盘统计卡标签换行。
- 只动收藏网格和统计卡断点，验收 768/1024/1280。

**批次 D：清理项（低风险，可合并）**
- P2-2 长英文标题断行；
- P2-3 toast 避让 header；
- P2-4 横向滚动提示；
- P2-5 复选框命中区；
- P2-6 底部弹层 safe-area。
- 可作为一个“交互打磨”PR，逐项截图复验。

**批次 E：需要设备/产品决策，单独排期**
- Android 真机软键盘、返回键、safe-area 像素级验证；
- 768 平板导航形态（P2-7）；
- 电影/漫画真实结果页验收。
- 这批不适合和代码修复混在一起，先定“768 是平板还是移动”的产品结论，再动布局。

## 9. 证据与复现

- 采集数据：`.screenshots/responsive-audit/metrics/focus.json`、`results.json`、`navshot.json`、`overlays.json`、`safe.json`、`modal.json`、`resultprobe*.json`。
- 截图目录：`.screenshots/responsive-audit/{320,360,390,768,1024,1280,1440,960}/`。
  - 导航换行视觉证据：`1280/nav-clip.png`、`1440/nav-clip.png`；
  - 配置页崩坏：`320/admin-config.png`、`390/admin-config.png`；
  - 收藏页裁切：`1024/dash-favorites.png`；
  - 后台表格：`320/admin-users.png`、`390/admin-users.png`、`768/admin-users.png`；
  - 仪表盘：`1024/dashboard.png`；
  - 社区：`390/community.png`、`768/community.png`、`1024/community.png`；
  - 安全区/弹层/短视口：`390/safe-area.png`、`390/library-modal.png`、`390/short-viewport.png`。
- 复现方法：本地启动 `backend: npx wrangler dev --port 8787 --local`、`frontend: npm run dev`；用 `tester / Test1234!` 或 `admin / Test1234!` 登录；按上表视口用 DevTools 设备模式或 Electron 窗口宽度切换。
- 说明：`.tmp/audit/*.js` 为本轮临时采集脚本，已按约定清理；采集 JSON 与截图已移入 `.screenshots/responsive-audit/`，仅作为审查证据保留，未提交。

## 10. 一句话优先级

先修 **320/360 顶部导航溢出**（唯一会让移动端主页面横向滚动的 P0），再修 **后台配置页在 320/390 的重叠**；随后一次性处理 **1024 区间的导航换行 + 收藏页溢出 + 平板触控尺寸**，最后做 toast/滚动提示/复选框/弹层 safe-area 等打磨项。

## 11. 修复记录（2026-11-14，全部关闭）

### 11.1 断点方案调整（根因层，不是单页补丁）

| 调整 | 之前 | 之后 | 为什么 |
| --- | --- | --- | --- |
| 平板/移动形态边界 | 主搜索 `md` 切桌面 tab，后台/社区 `lg` 切侧栏，底栏 `md` 隐藏 | **统一为 `lg`**：`<lg` = 底部主导航 + 页头分类条 + 抽屉；`≥lg` = tab 行 + 固定侧栏 | 768 不再"一半桌面一半移动"；三套布局只有一个语义边界 |
| 触控目标 | `@media (max-width: 640px)` | `@media (max-width: 1023px), (pointer: coarse)` | 641–1023 的触屏平板此前完全不受 44px 规则约束 |
| 导航密度 | <1280 全部图标平铺 | <sm 顶栏只留「更多」+ 用户菜单；帮助/GitHub 收进「更多」到 2xl | 按空间分层收纳，而不是让容器溢出 |
| 滚动提示 | `.no-scrollbar` 隐藏滚动条 | 删除该工具类，改用 `.h-scroll`（细滚动条 + `scroll-snap-type: x proximity`） | 让"还有内容"可见，而不是掩盖 |

### 11.2 逐项修复与复测（修复前后同视口）

| 编号 | 根因 | 修复 | 复测（同一视口，前 → 后） |
| --- | --- | --- | --- |
| P0-1 | <sm 仍平铺通知/主题/下载/语言/头像，右侧组最小宽 ~350px | `UnifiedNavBar`：通知、主题、下载、语言在 `<sm` 移入「更多」抽屉；抽屉内新增 4 个 44px 条目 | 320：`overflowX` 52 → **0**，右侧组右边界 366 → **304**；360：12 → **0**；390：0 → 0 |
| P0-2 | 页头与配置行都是不可换行的单行 flex，父容器靠裁切兜底 | 页头 `<sm` 纵向堆叠、按钮组 `flex-wrap`；配置行 `<sm` 上下两段、徽章 `flex-wrap`、值行单独占满 | 320：标题 32px 单行（原竖排），操作组右边界 304 ≤ 320，配置行内部溢出 24px → **0**，key/值无相交；390/768/1024 同步正常 |
| P1-1 | `lg` 就出文字标签，1024–1279 宽度不足且标签可任意断行 | 标签延后到 `xl`，并加 `whitespace-nowrap`；1024–1279 只显示图标 + `title` | 1024：标签高 38/按钮高 76 → 图标态按钮 **36**（header 65）；1280：标签高 38 → **18**、按钮 56 → **36**；1440 保持 18/36 |
| P1-2 | `lg:grid-cols-3` 在 1024 只有 ~230px/列，小于卡片最小内容宽 | 三列延后到 `xl`（1024 用两列，1280 起三列） | 1024：3 列 → **2 列 352px**，卡片内部溢出 65 → **0**，打开/删除图标完整，文档溢出 2 → **0**；1280：3 列 315px，内部溢出 0 |
| P1-3 | 表格无列优先级、表头可换行、滚动容器无任何提示 | `TableWrapper` 统一：`th` 强制单行；内容超宽时显示右侧渐隐 +「左右滑动查看更多列」；users/sessions 在 `<sm` 隐藏低优先级列（登录次数/注册时间、IP/设备） | 320 users：可见区 280 / 表宽 651、隐藏 371、无提示 → **可见 286 / 表宽 518**、2 列折叠、提示出现、表头 44px 单行；390 同；768 表头单行不再竖排 |
| P1-4 | 44px 规则只写在 `max-width:640` | 触控规则改为 `(max-width:1023px), (pointer:coarse)` | 768 触屏：header 内 <44px 可点元素 8 个（tab 43×36、子模式 63×28、图标 36/40）→ **0**；抽屉项 44px |
| P1-5 | 统计卡 320 仍两列 + 标题单行截断 | `StatsGrid` 在 `<xs` 单列；`StatCard` 标题允许换行、不再 `truncate` | 320：标题「今日…」→ **「今日新增」「今日活跃」完整显示**（宽 55px，`clipped=false`） |
| P2-1 | 1024 仪表盘统计卡 4 列，单卡 ~160px | 4 列延后到 `xl`，涨幅行 `whitespace-nowrap` | 1024：4 列 → **2 列 348px**，统计标签无换行；1280：4 列 226px 仍单行 |
| P2-2 | `line-clamp` 但没有 `overflow-wrap`，长英文单词无法断行 | 标题加 `break-words` + `title` 属性 | 1024：该 `h3` 内容宽 228 / 容器 188（溢出 40 被裁）→ **内容宽 = 容器宽 190，溢出 0**，省略号可见 |
| P2-3 | toast 在 `≥sm` 固定 `top-4`，与 64px 吸顶 header 重叠 | 顶部位置改为 `<lg calc(8.25rem+safe-area)`、`≥lg calc(5rem+safe-area)`；底部 toast 避让底栏的断点同步到 `lg` | 1024：与 header 重叠 44% → **0**（toast top 80 / header bottom 64）；320、768 重叠均为 **0**（top 132 / header bottom 64） |
| P2-4 | 横向分类/筛选条 `no-scrollbar` 完全隐藏滚动条 | 统一 `.h-scroll`：细滚动条 + scroll-snap + 边缘吸附；主搜索分类条、社区类型条、影视筛选条同步替换 | 320 社区类型条：delta 266、滚动条隐藏 → **delta 260、scrollbar-width=thin**；390 delta 190；768 主搜索分类条同规则 |
| P2-5 | 复选框 16×16 且无 label | 用 44×44 `<label>` 包裹复选框与左侧命中区 | 320/390：命中区 **16×16 → 44×44**（`hasLabel=true`） |
| P2-6 | 底部弹层未处理手势条安全区 | Modal 面板加 `pb-[env(safe-area-inset-bottom)]`（`≥sm` 归零） | 390 + 模拟 bottom=34：面板 `padding-bottom` 0 → **34px**，面板底边 = 视口底边 |
| P2-7 | 768 主搜索已桌面式、后台仍抽屉、底栏已隐藏 | 按 11.1 统一到 `lg`；底栏显示到 `<lg`；相关页底部留白从 `md` 同步到 `lg` | 768/1023：分类条可见、桌面 tab 隐藏、**底栏可见**、主内容底部留白 **56px**；1024：分类条隐藏、tab 行可见、底栏隐藏、固定侧栏可见 |
| P2-8 | Electron `minWidth:960` + 外框尺寸，内容区 < lg | `minWidth:1024` 且 `useContentSize: true`，保证内容区不低于 lg | 代码层已改；1024 视口实测为桌面形态（侧栏 + 图标 tab，无底栏）。真实 Electron 窗口未复测，见 11.4 |

### 11.3 修复过程中发现并一并修掉的同类问题

- **管理后台概览统计卡**（`AdminPanelOverview`）：与 P2-1 同因，`lg:grid-cols-4` 在 1024 后台内容区仅 ~704px，改为 `xl:grid-cols-4`。
- **底部留白断点**：底栏保留到 `lg` 后，`MainSearchPage`/`HomePage`/`MainLayout`/三套 Panel 布局的 `md:pb-*` 会让内容被底栏压住，统一改为 `lg:pb-*`。
- **`.no-scrollbar` 全量下线**：避免后续新页面继续用隐藏滚动条掩盖横向溢出。

### 11.4 没测成 / 仍需设备验证

| 项 | 原因 | 已做到什么程度 |
| --- | --- | --- |
| Electron 真实窗口（1024 内容区） | 本机无可用桌面会话，无法启动 Electron 窗口 | 只改了窗口参数；用 1024 视口验证桌面布局。需在真实窗口复核标题栏占位后的内容宽 |
| Android 真机软键盘遮挡、返回键 | 需真机 + 输入法 | 未改动相关逻辑；弹层已补 safe-area |
| Android 真机 safe-area 像素 | 仅 CDP `Emulation.setSafeAreaInsetsOverride` 模拟（top 0/bottom 34） | 弹层 padding 实测 34px 生效 |
| 电影/漫画真实结果页、搜索建议下拉 | 与审查轮相同：无真实数据/无法触发 | 未复测，结论不外推 |
| 320/1024 其余后台子页 | 未逐页跑 | 改动集中在共享 `TableWrapper`/`StatsGrid`，已覆盖 users/sessions/config/overview 四个代表页 |

### 11.5 本轮验证口径与回归结果

- 浏览器：Chrome（`headless=new`）+ CDP，真实渲染引擎、真实后端 API、真实登录态；每项修复前后使用**同一视口、同一账号**。
- 全量回归：11 个页面 × 7 个视口（320/360/390/768/1024/1280/1440）共 **77 个组合，文档级 `overflowX` 全部为 0**。
- 工程校验：`tsc --noEmit` 通过；`eslint` 0 error（117 条既有 warning）；`vitest run` 143/143 通过；`npm run build` 成功。
- 单测同步：`UnifiedNavBar` 用例改为断言「<sm 次要入口在更多抽屉内」。

### 11.6 提交说明

- 全部修复合并为**一条提交**，未分批提交、未推送。
- 临时采集脚本、截图、Chrome 配置均在 `.tmp/` 下，已清理，未进入提交。


