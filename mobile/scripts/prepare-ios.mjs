// 在 `npx cap sync ios` 之后运行：注入版本号、OAuth 深链与 UA 标识。
// ios/ 不入库、每次由模板生成，因此这些配置只能在这里补齐（与 prepare-android.mjs 对应）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(mobileDir, '..');
const iosApp = path.join(mobileDir, 'ios/App');

const { version } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
if (!match) throw new Error(`无法从根 package.json 解析版本号: ${version}`);
// 与 Android 的 versionCode 同一算法，便于两端对照
const build = Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);

// 1) 版本号：MARKETING_VERSION=展示版本，CURRENT_PROJECT_VERSION=构建号
const pbxPath = path.join(iosApp, 'App.xcodeproj/project.pbxproj');
let pbx = fs.readFileSync(pbxPath, 'utf8');
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
pbx = pbx.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
fs.writeFileSync(pbxPath, pbx);
console.log(`[ios] MARKETING_VERSION=${version} CURRENT_PROJECT_VERSION=${build}`);

// 2) OAuth 深链回跳：atlas://auth/callback（幂等）
const plistPath = path.join(iosApp, 'App/Info.plist');
let plist = fs.readFileSync(plistPath, 'utf8');
if (!plist.includes('<key>CFBundleURLTypes</key>')) {
  const urlTypes = `\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>uk.wort.atlas</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>atlas</string>
\t\t\t</array>
\t\t</dict>
\t</array>
`;
  const idx = plist.lastIndexOf('</dict>');
  if (idx === -1) throw new Error('Info.plist 结构异常，找不到根 </dict>');
  plist = plist.slice(0, idx) + urlTypes + plist.slice(idx);
  fs.writeFileSync(plistPath, plist);
  console.log('[ios] injected atlas://auth/callback URL scheme');
}

// 3) UA 标识：前端用 AtlasApp/<version> 识别应用壳。
// 直接改 sync 生成的副本，版本始终取自根 package.json，不会像静态配置那样过期。
const genConfigPath = path.join(iosApp, 'App/capacitor.config.json');
const genConfig = JSON.parse(fs.readFileSync(genConfigPath, 'utf8'));
genConfig.ios = { ...(genConfig.ios ?? {}), appendUserAgent: `AtlasApp/${version}` };
fs.writeFileSync(genConfigPath, JSON.stringify(genConfig, null, 2) + '\n');
console.log(`[ios] appendUserAgent=AtlasApp/${version}`);
