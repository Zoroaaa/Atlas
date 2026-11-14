// 打包前校验桌面端版本号与仓库根一致，避免安装包版本与站点版本漂移
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopPkgPath = path.resolve(scriptDir, '../package.json');
const rootPkgPath = path.resolve(scriptDir, '../../package.json');

const rootVersion = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8')).version;
const desktopVersion = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8')).version;

if (rootVersion !== desktopVersion) {
  console.error(`[version] 版本不一致：根 ${rootVersion} / desktop ${desktopVersion}`);
  console.error('[version] 请先同步 desktop/package.json 的 version');
  process.exit(1);
}

console.log(`[version] ${rootVersion}`);
