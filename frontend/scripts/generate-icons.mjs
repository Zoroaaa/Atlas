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

  const logoPath = join(publicDir, 'logo.svg');
  
  console.log('开始生成PWA图标...');
  
  for (const size of iconSizes) {
    const outputPath = join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 10, g: 10, b: 11, alpha: 1 }
      })
      .png()
      .toFile(outputPath);
    console.log(`✓ 生成图标: icon-${size}x${size}.png`);
  }

  // Favicon PNG sizes for browsers and search engines
  for (const size of [16, 32]) {
    const outputPath = join(publicDir, `favicon-${size}x${size}.png`);
    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 10, g: 10, b: 11, alpha: 1 }
      })
      .png()
      .toFile(outputPath);
    console.log(`✓ 生成 favicon: favicon-${size}x${size}.png`);
  }

  await sharp(logoPath)
    .resize(180, 180, {
      fit: 'contain',
      background: { r: 10, g: 10, b: 11, alpha: 1 }
    })
    .png()
    .toFile(join(iconsDir, 'apple-touch-icon.png'));
  console.log('✓ 生成图标: apple-touch-icon.png');

  const searchIconSvg = `
    <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#d4a853"/>
          <stop offset="100%" style="stop-color:#f59e0b"/>
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="16" fill="#0a0a0b"/>
      <rect x="2" y="2" width="92" height="92" rx="14" fill="none" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.5"/>
      <circle cx="40" cy="40" r="18" fill="none" stroke="url(#goldGrad)" stroke-width="3"/>
      <line x1="54" y1="54" x2="70" y2="70" stroke="url(#goldGrad)" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `;
  await sharp(Buffer.from(searchIconSvg))
    .png()
    .toFile(join(iconsDir, 'shortcut-search.png'));
  console.log('✓ 生成快捷方式图标: shortcut-search.png');

  const favoritesIconSvg = `
    <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="roseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#f43f5e"/>
          <stop offset="100%" style="stop-color:#e11d48"/>
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="16" fill="#0a0a0b"/>
      <rect x="2" y="2" width="92" height="92" rx="14" fill="none" stroke="url(#roseGrad)" stroke-width="1.5" opacity="0.5"/>
      <path d="M48 72 L24 48 C20 44 18 38 20 32 C22 26 28 22 34 22 C40 22 46 26 48 32 C50 26 56 22 62 22 C68 22 74 26 76 32 C78 38 76 44 72 48 L48 72Z" fill="url(#roseGrad)"/>
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
          <stop offset="0%" style="stop-color:#0a0a0b"/>
          <stop offset="100%" style="stop-color:#1c1917"/>
        </linearGradient>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#d4a853"/>
          <stop offset="50%" style="stop-color:#f59e0b"/>
          <stop offset="100%" style="stop-color:#e11d48"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" style="stop-color:#d4a853;stop-opacity:0.08"/>
          <stop offset="100%" style="stop-color:#d4a853;stop-opacity:0"/>
        </radialGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#bgGrad)"/>
      <rect width="1920" height="1080" fill="url(#glow)"/>

      <!-- 顶部导航栏 -->
      <rect width="1920" height="64" fill="#111113"/>
      <rect x="0" y="63" width="1920" height="1" fill="#d4a853" opacity="0.15"/>

      <!-- Logo -->
      <circle cx="40" cy="32" r="16" fill="none" stroke="url(#goldGrad)" stroke-width="2"/>
      <polygon points="40,18 43,28 40,32 37,28" fill="#d4a853"/>
      <text x="68" y="40" font-family="Sora, sans-serif" font-size="20" font-weight="800" fill="url(#goldGrad)" letter-spacing="2">ATLAS</text>

      <!-- 导航项 -->
      <text x="200" y="40" font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="#a8a29e">JAV</text>
      <text x="260" y="40" font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="#a8a29e">动漫</text>
      <text x="320" y="40" font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="#a8a29e">影视</text>
      <text x="380" y="40" font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="#a8a29e">漫画</text>

      <!-- 搜索框 -->
      <rect x="560" y="180" width="800" height="64" rx="32" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <text x="600" y="220" font-family="Plus Jakarta Sans, sans-serif" font-size="18" fill="#78716c">搜索 JAV / 动漫 / 影视 / 漫画/小说...</text>
      <rect x="1280" y="192" width="40" height="40" rx="20" fill="url(#goldGrad)"/>
      <circle cx="1296" cy="208" r="8" fill="none" stroke="#0a0a0b" stroke-width="2"/>
      <line x1="1302" y1="214" x2="1310" y2="222" stroke="#0a0a0b" stroke-width="2" stroke-linecap="round"/>

      <!-- 分类标签 -->
      <rect x="560" y="270" width="80" height="32" rx="16" fill="none" stroke="#d4a853" stroke-width="1" opacity="0.5"/>
      <text x="600" y="291" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" fill="#d4a853">JAV</text>
      <rect x="650" y="270" width="90" height="32" rx="16" fill="none" stroke="#f59e0b" stroke-width="1" opacity="0.5"/>
      <text x="695" y="291" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" fill="#f59e0b">动漫</text>
      <rect x="750" y="270" width="80" height="32" rx="16" fill="none" stroke="#e11d48" stroke-width="1" opacity="0.5"/>
      <text x="790" y="291" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" fill="#e11d48">影视</text>
      <rect x="840" y="270" width="90" height="32" rx="16" fill="none" stroke="#d4a853" stroke-width="1" opacity="0.5"/>
      <text x="885" y="291" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" fill="#d4a853">漫画</text>

      <!-- 搜索结果卡片 -->
      <rect x="80" y="340" width="560" height="140" rx="16" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <rect x="100" y="360" width="200" height="16" rx="8" fill="#d4a853" opacity="0.6"/>
      <rect x="100" y="390" width="400" height="12" rx="6" fill="#44403c"/>
      <rect x="100" y="415" width="350" height="12" rx="6" fill="#44403c"/>
      <rect x="100" y="445" width="80" height="24" rx="12" fill="#d4a853" opacity="0.15"/>
      <text x="140" y="462" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#d4a853">JAV</text>

      <rect x="680" y="340" width="560" height="140" rx="16" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <rect x="700" y="360" width="220" height="16" rx="8" fill="#f59e0b" opacity="0.6"/>
      <rect x="700" y="390" width="380" height="12" rx="6" fill="#44403c"/>
      <rect x="700" y="415" width="320" height="12" rx="6" fill="#44403c"/>
      <rect x="700" y="445" width="80" height="24" rx="12" fill="#f59e0b" opacity="0.15"/>
      <text x="740" y="462" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#f59e0b">动漫</text>

      <rect x="1280" y="340" width="560" height="140" rx="16" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <rect x="1300" y="360" width="240" height="16" rx="8" fill="#e11d48" opacity="0.6"/>
      <rect x="1300" y="390" width="400" height="12" rx="6" fill="#44403c"/>
      <rect x="1300" y="415" width="300" height="12" rx="6" fill="#44403c"/>
      <rect x="1300" y="445" width="80" height="24" rx="12" fill="#e11d48" opacity="0.15"/>
      <text x="1340" y="462" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#e11d48">影视</text>

      <rect x="80" y="510" width="560" height="140" rx="16" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <rect x="100" y="530" width="210" height="16" rx="8" fill="#d4a853" opacity="0.6"/>
      <rect x="100" y="560" width="390" height="12" rx="6" fill="#44403c"/>
      <rect x="100" y="585" width="340" height="12" rx="6" fill="#44403c"/>
      <rect x="100" y="615" width="80" height="24" rx="12" fill="#d4a853" opacity="0.15"/>
      <text x="140" y="632" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#d4a853">漫画</text>

      <rect x="680" y="510" width="560" height="140" rx="16" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <rect x="700" y="530" width="190" height="16" rx="8" fill="#d4a853" opacity="0.6"/>
      <rect x="700" y="560" width="420" height="12" rx="6" fill="#44403c"/>
      <rect x="700" y="585" width="360" height="12" rx="6" fill="#44403c"/>
      <rect x="700" y="615" width="80" height="24" rx="12" fill="#d4a853" opacity="0.15"/>
      <text x="740" y="632" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#d4a853">JAV</text>

      <rect x="1280" y="510" width="560" height="140" rx="16" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <rect x="1300" y="530" width="230" height="16" rx="8" fill="#f59e0b" opacity="0.6"/>
      <rect x="1300" y="560" width="380" height="12" rx="6" fill="#44403c"/>
      <rect x="1300" y="585" width="310" height="12" rx="6" fill="#44403c"/>
      <rect x="1300" y="615" width="80" height="24" rx="12" fill="#f59e0b" opacity="0.15"/>
      <text x="1340" y="632" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#f59e0b">动漫</text>

      <!-- 底部信息 -->
      <line x1="0" y1="1020" x2="1920" y2="1020" stroke="#44403c" stroke-width="0.5"/>
      <text x="960" y="1055" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="#78716c">Atlas 开源聚合搜索引擎 · JAV / 动漫 / 影视 / 漫画/小说</text>
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
          <stop offset="0%" style="stop-color:#0a0a0b"/>
          <stop offset="100%" style="stop-color:#1c1917"/>
        </linearGradient>
        <linearGradient id="goldGradM" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#d4a853"/>
          <stop offset="50%" style="stop-color:#f59e0b"/>
          <stop offset="100%" style="stop-color:#e11d48"/>
        </linearGradient>
        <radialGradient id="glowM" cx="50%" cy="30%" r="50%">
          <stop offset="0%" style="stop-color:#d4a853;stop-opacity:0.06"/>
          <stop offset="100%" style="stop-color:#d4a853;stop-opacity:0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="844" fill="url(#bgGradMobile)"/>
      <rect width="390" height="844" fill="url(#glowM)"/>

      <!-- 状态栏 -->
      <rect width="390" height="44" fill="#0a0a0b"/>
      <rect x="130" y="12" width="130" height="20" rx="10" fill="#1c1917" stroke="#44403c" stroke-width="0.5"/>

      <!-- 顶部导航栏 -->
      <rect y="44" width="390" height="56" fill="#111113"/>
      <rect x="0" y="99" width="390" height="1" fill="#d4a853" opacity="0.15"/>
      <circle cx="28" cy="72" r="12" fill="none" stroke="url(#goldGradM)" stroke-width="1.5"/>
      <polygon points="28,62 30,69 28,72 26,69" fill="#d4a853"/>
      <text x="48" y="78" font-family="Sora, sans-serif" font-size="16" font-weight="800" fill="url(#goldGradM)" letter-spacing="1.5">ATLAS</text>

      <!-- 搜索框 -->
      <rect x="20" y="120" width="350" height="48" rx="24" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <text x="44" y="150" font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="#78716c">搜索 JAV / 动漫 / 影视 / 漫画/小说...</text>
      <circle cx="340" cy="144" r="14" fill="url(#goldGradM)"/>
      <circle cx="337" cy="142" r="5" fill="none" stroke="#0a0a0b" stroke-width="1.5"/>
      <line x1="341" y1="146" x2="346" y2="151" stroke="#0a0a0b" stroke-width="1.5" stroke-linecap="round"/>

      <!-- 分类标签 -->
      <rect x="20" y="185" width="60" height="28" rx="14" fill="none" stroke="#d4a853" stroke-width="1" opacity="0.5"/>
      <text x="50" y="204" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#d4a853">JAV</text>
      <rect x="88" y="185" width="65" height="28" rx="14" fill="none" stroke="#f59e0b" stroke-width="1" opacity="0.5"/>
      <text x="120" y="204" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#f59e0b">动漫</text>
      <rect x="161" y="185" width="60" height="28" rx="14" fill="none" stroke="#e11d48" stroke-width="1" opacity="0.5"/>
      <text x="191" y="204" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#e11d48">影视</text>
      <rect x="229" y="185" width="65" height="28" rx="14" fill="none" stroke="#d4a853" stroke-width="1" opacity="0.5"/>
      <text x="261" y="204" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#d4a853">漫画</text>

      <!-- 搜索结果卡片 -->
      <rect x="20" y="230" width="350" height="100" rx="14" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <rect x="36" y="248" width="160" height="12" rx="6" fill="#d4a853" opacity="0.6"/>
      <rect x="36" y="270" width="280" height="10" rx="5" fill="#44403c"/>
      <rect x="36" y="290" width="240" height="10" rx="5" fill="#44403c"/>
      <rect x="36" y="310" width="60" height="20" rx="10" fill="#d4a853" opacity="0.15"/>
      <text x="66" y="324" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" fill="#d4a853">JAV</text>

      <rect x="20" y="345" width="350" height="100" rx="14" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <rect x="36" y="363" width="180" height="12" rx="6" fill="#f59e0b" opacity="0.6"/>
      <rect x="36" y="385" width="260" height="10" rx="5" fill="#44403c"/>
      <rect x="36" y="405" width="220" height="10" rx="5" fill="#44403c"/>
      <rect x="36" y="425" width="60" height="20" rx="10" fill="#f59e0b" opacity="0.15"/>
      <text x="66" y="439" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" fill="#f59e0b">动漫</text>

      <rect x="20" y="460" width="350" height="100" rx="14" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <rect x="36" y="478" width="170" height="12" rx="6" fill="#e11d48" opacity="0.6"/>
      <rect x="36" y="500" width="290" height="10" rx="5" fill="#44403c"/>
      <rect x="36" y="520" width="230" height="10" rx="5" fill="#44403c"/>
      <rect x="36" y="540" width="60" height="20" rx="10" fill="#e11d48" opacity="0.15"/>
      <text x="66" y="554" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" fill="#e11d48">影视</text>

      <rect x="20" y="575" width="350" height="100" rx="14" fill="#1c1917" stroke="#44403c" stroke-width="1"/>
      <rect x="36" y="593" width="150" height="12" rx="6" fill="#d4a853" opacity="0.6"/>
      <rect x="36" y="615" width="270" height="10" rx="5" fill="#44403c"/>
      <rect x="36" y="635" width="210" height="10" rx="5" fill="#44403c"/>
      <rect x="36" y="655" width="60" height="20" rx="10" fill="#d4a853" opacity="0.15"/>
      <text x="66" y="669" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" fill="#d4a853">漫画</text>

      <!-- 底部导航 -->
      <rect y="744" width="390" height="50" fill="#111113"/>
      <rect x="0" y="744" width="390" height="1" fill="#44403c" opacity="0.5"/>
      <circle cx="65" cy="769" r="18" fill="url(#goldGradM)" opacity="0.2"/>
      <circle cx="65" cy="769" r="8" fill="none" stroke="#d4a853" stroke-width="1.5"/>
      <line x1="71" y1="775" x2="77" y2="781" stroke="#d4a853" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="195" cy="769" r="18" fill="transparent"/>
      <path d="M188 764 L202 764 L195 778 Z" fill="#78716c"/>
      <circle cx="325" cy="769" r="18" fill="transparent"/>
      <circle cx="325" cy="766" r="6" fill="none" stroke="#78716c" stroke-width="1.5"/>
      <line x1="325" y1="772" x2="325" y2="778" stroke="#78716c" stroke-width="1.5"/>

      <!-- 底部指示器 -->
      <rect x="140" y="820" width="110" height="5" rx="2.5" fill="#44403c"/>
    </svg>
  `;
  await sharp(Buffer.from(mobileScreenshotSvg))
    .png()
    .toFile(join(screenshotsDir, 'mobile.png'));
  console.log('✓ 生成截图: mobile.png (390x844)');

  console.log('\\n✅ 所有图标和截图生成完成！');
}

generateIcons().catch(console.error);
