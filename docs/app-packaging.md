# 客户端打包与签名

> 适用版本：v1.8.0+
> 覆盖 Windows（Electron）与 Android（Capacitor）两个客户端壳：版本号来源、签名配置、发版流程与已知限制。

---

## 一、两个壳的工作方式

| 平台 | 壳 | 加载内容 | 产物 |
|---|---|---|---|
| Windows | Electron | 远程 `https://atlas.wort.uk` | NSIS 安装包（约 116 MB） |
| Android | Capacitor | 远程 `https://atlas.wort.uk` | APK（约 7 MB） |

- 后端运行在 Cloudflare Workers + D1，无法装进安装包，客户端只承担壳层能力
- 站点更新后客户端无需重新发版
- 壳会在 WebView 的 UA 追加 `AtlasApp/<version>`，前端据此识别应用环境并跳过门户首页（`frontend/src/utils/appShell.ts`）
- 断网时依赖 Service Worker 缓存外壳与已加载资源；收藏、搜索历史读取本地持久缓存（`frontend/src/utils/persistentCache.ts`）

代码位置：

- Windows：`desktop/`（主进程 `desktop/electron/main.js`，含导航白名单、外链与磁力转交系统、下载保存对话框）
- Android：`mobile/`（`capacitor.config.json` 配置远程 URL 与 UA 后缀；`android/` 不入库，由模板生成）

---

## 二、版本号

单一来源是根 `package.json` 的 `version`。

| 位置 | 取值方式 |
|---|---|
| 站点 | 发版时同步根、`backend`、`frontend`、`packages/shared`、`backend/wrangler.toml` 的 `APP_VERSION` |
| Windows | `desktop/package.json` 必须与根一致；`npm run dist` 先执行 `check-version`，不一致直接失败 |
| Android | CI 读取根版本注入 `versionName`；`versionCode = 主 * 10000 + 次 * 100 + 修订` |

当前 `1.8.0` 对应 `versionCode 10800`。`versionCode` 必须单调递增，不能回退，否则无法覆盖安装。

注入逻辑在 `mobile/scripts/prepare-android.mjs`，在 `npx cap add android` 之后执行，重复运行不会重复插入签名配置。

---

## 三、Android 签名

### 1. 生成密钥（只做一次）

```powershell
powershell -ExecutionPolicy Bypass -File mobile\scripts\generate-signing-key.ps1
```

脚本要求本机有 `keytool`（JDK 17+，脚本会自动在 `C:\Program Files\Eclipse Adoptium` 下查找）。

生成到 `%USERPROFILE%\.atlas-signing\`：

- `atlas-release.p12` — 密钥库
- `atlas-release.p12.base64.txt` — 供 GitHub Secret 使用

密码在脚本中交互输入，不落盘、不进版本库。

### 2. 配置 GitHub Secrets

仓库 Settings → Secrets and variables → Actions：

| Secret | 值 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `.base64.txt` 文件内容 |
| `ANDROID_KEYSTORE_PASSWORD` | 生成时设置的密码 |
| `ANDROID_KEY_ALIAS` | `atlas` |
| `ANDROID_KEY_PASSWORD` | 与 `ANDROID_KEYSTORE_PASSWORD` 相同 |

配置后手动触发的 `Build Android APK` 会产出 `Atlas-Android-release.apk`；未配置时自动回退 debug 包（可侧载，但无法覆盖升级，也不能上架）。

### 3. 密钥丢失的后果

已安装的应用无法覆盖升级，只能卸载重装，应用内本地数据会一并丢失。密钥与密码必须离线备份，至少两份、分开存放。

---

## 四、Windows 签名

`electron-builder` 原生读取两个环境变量，不需要改代码：

```powershell
$env:CSC_LINK="C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD="证书密码"
npm run dist
```

未设置时跳过签名，安装包仍可用，但 SmartScreen 会提示「未知发布者」。

证书来源：

- 正式对外分发需要受信任的代码签名证书（OV/EV）。购买后导出 `.pfx` 即可接入
- 自签名证书只能验证签名链路，**不会**消除 SmartScreen 警告，不建议对外分发
- 也可使用 Azure Trusted Signing 等云签名服务，接入方式以服务商文档为准

---

## 五、发版流程

日常 push 不会构建安装包，只在版本更新时手动触发，避免产物堆积。

1. 提升根 `package.json` 版本，同步 `desktop/package.json`（Android 版本自动取根版本）
2. 更新 `docs/CHANGELOG.md`，推送 `main`：Workers Builds 自动部署站点
3. 创建或确认对应的 Release，标签必须是 `v<version>`
4. Actions → **Build Android APK** → Run workflow：
   - `release_tag` 填 `v<version>`（留空则只构建不上传）
   - `upload` 保持勾选，构建成功后自动上传 `Atlas-Android-<version>.apk` 并覆盖同名附件
   - 标签与根版本不一致、或本次是 debug 构建时，上传步骤会直接失败，不会污染 Release
5. 本地出 Windows 安装包：`cd desktop && npm run dist`，手动上传 `Atlas-Setup-<version>.exe`

---

## 六、已知限制

- Windows 安装包未签名时会有 SmartScreen 提示
- 安装包不会随 push 自动构建，需在 Actions 手动触发并指定 Release 标签
- 切换签名后（debug ↔ release）无法直接覆盖安装，需先卸载
- Android 端的 Service Worker 行为取决于系统 WebView 版本，离线能力需真机验证
- 客户端数据独立于浏览器，首次打开需要登录一次
- 安装包体积主要来自 Electron 运行时（约 116 MB），与站点内容无关
