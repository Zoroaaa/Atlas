import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDir = join(__dirname, '..');
const publicDir = join(frontendDir, 'public');
const iconsDir = join(publicDir, 'icons');
const screenshotsDir = join(publicDir, 'screenshots');

const iconSizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

const shortcutIconSizes = [96];

async function generateIcons() {
  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true });
  }
  if (!existsSync(screenshotsDir)) {
    mkdirSync(screenshotsDir, { recursive: true });
  }

  const logoPath = join(publicDir, 'logo.png');
  
  console.log('开始生成PWA图标...');
  
  for (const size of iconSizes) {
    const outputPath = join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 15, g: 23, b: 42, alpha: 1 }
      })
      .png()
      .toFile(outputPath);
    console.log(`✓ 生成图标: icon-${size}x${size}.png`);
  }

  await sharp(logoPath)
    .resize(180, 180, {
      fit: 'contain',
      background: { r: 15, g: 23, b: 42, alpha: 1 }
    })
    .png()
    .toFile(join(iconsDir, 'apple-touch-icon.png'));
  console.log('✓ 生成图标: apple-touch-icon.png');

  const searchIconSvg = `
    <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <rect width="96" height="96" rx="16" fill="#3b82f6"/>
      <circle cx="40" cy="40" r="20" fill="none" stroke="white" stroke-width="4"/>
      <line x1="56" y1="56" x2="72" y2="72" stroke="white" stroke-width="4" stroke-linecap="round"/>
    </svg>
  `;
  await sharp(Buffer.from(searchIconSvg))
    .png()
    .toFile(join(iconsDir, 'shortcut-search.png'));
  console.log('✓ 生成快捷方式图标: shortcut-search.png');

  const favoritesIconSvg = `
    <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <rect width="96" height="96" rx="16" fill="#ef4444"/>
      <path d="M48 72 L24 48 C20 44 18 38 20 32 C22 26 28 22 34 22 C40 22 46 26 48 32 C50 26 56 22 62 22 C68 22 74 26 76 32 C78 38 76 44 72 48 L48 72Z" fill="white"/>
    </svg>
  `;
  await sharp(Buffer.from(favoritesIconSvg))
    .png()
    .toFile(join(iconsDir, 'shortcut-favorites.png'));
  console.log('✓ 生成快捷方式图标: shortcut-favorites.png');

  console.log('\\n开始生成截图...');

  const desktopScreenshotSvg = `
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f172a"/>
          <stop offset="100%" style="stop-color:#1e293b"/>
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#bgGrad)"/>
      
      <!-- 顶部导航栏 -->
      <rect width="1920" height="64" fill="#1e293b"/>
      <text x="80" y="42" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#3b82f6">磁力快搜</text>
      
      <!-- 搜索框 -->
      <rect x="360" y="200" width="1200" height="64" rx="32" fill="#334155"/>
      <text x="400" y="242" font-family="Arial, sans-serif" font-size="20" fill="#64748b">搜索磁力链接...</text>
      <rect x="1480" y="212" width="40" height="40" rx="20" fill="#3b82f6"/>
      
      <!-- 搜索结果卡片 -->
      <rect x="80" y="320" width="560" height="120" rx="8" fill="#1e293b"/>
      <rect x="80" y="460" width="560" height="120" rx="8" fill="#1e293b"/>
      <rect x="680" y="320" width="560" height="120" rx="8" fill="#1e293b"/>
      <rect x="680" y="460" width="560" height="120" rx="8" fill="#1e293b"/>
      <rect x="1280" y="320" width="560" height="120" rx="8" fill="#1e293b"/>
      <rect x="1280" y="460" width="560" height="120" rx="8" fill="#1e293b"/>
      
      <!-- 底部信息 -->
      <text x="960" y="1020" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#64748b">高效的磁力链接搜索引擎</text>
    </svg>
  `;
  await sharp(Buffer.from(desktopScreenshotSvg))
    .png()
    .toFile(join(screenshotsDir, 'desktop.png'));
  console.log('✓ 生成截图: desktop.png (1920x1080)');

  const mobileScreenshotSvg = `
    <svg width="390" height="844" viewBox="0 0 390 844" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradMobile" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f172a"/>
          <stop offset="100%" style="stop-color:#1e293b"/>
        </linearGradient>
      </defs>
      <rect width="390" height="844" fill="url(#bgGradMobile)"/>
      
      <!-- 状态栏 -->
      <rect width="390" height="44" fill="#0f172a"/>
      
      <!-- 顶部导航栏 -->
      <rect y="44" width="390" height="56" fill="#1e293b"/>
      <text x="20" y="80" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#3b82f6">磁力快搜</text>
      
      <!-- 搜索框 -->
      <rect x="20" y="130" width="350" height="48" rx="24" fill="#334155"/>
      <text x="40" y="162" font-family="Arial, sans-serif" font-size="16" fill="#64748b">搜索磁力链接...</text>
      
      <!-- 搜索结果卡片 -->
      <rect x="20" y="210" width="350" height="100" rx="8" fill="#1e293b"/>
      <rect x="20" y="330" width="350" height="100" rx="8" fill="#1e293b"/>
      <rect x="20" y="450" width="350" height="100" rx="8" fill="#1e293b"/>
      <rect x="20" y="570" width="350" height="100" rx="8" fill="#1e293b"/>
      
      <!-- 底部导航 -->
      <rect y="744" width="390" height="50" fill="#1e293b"/>
      <circle cx="65" cy="769" r="20" fill="#3b82f6"/>
      <circle cx="195" cy="769" r="20" fill="#334155"/>
      <circle cx="325" cy="769" r="20" fill="#334155"/>
      
      <!-- 底部指示器 -->
      <rect x="140" y="830" width="110" height="5" rx="2.5" fill="#64748b"/>
    </svg>
  `;
  await sharp(Buffer.from(mobileScreenshotSvg))
    .png()
    .toFile(join(screenshotsDir, 'mobile.png'));
  console.log('✓ 生成截图: mobile.png (390x844)');

  console.log('\\n✅ 所有图标和截图生成完成！');
}

generateIcons().catch(console.error);
