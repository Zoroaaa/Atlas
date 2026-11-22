// 生成 AltStore / SideStore 源文件 altstore.json，随 IPA 一起上传到 Release。
// 用户只需添加一次固定的源地址（releases/latest/download/altstore.json），
// 之后新版本发现、下载与 7 天续签都由 AltStore 处理。
// 用法：node gen-altstore-source.mjs <ipa 路径> <release 标签> <输出路径>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [ipaPath, tag, outPath] = process.argv.slice(2);
if (!ipaPath || !tag || !outPath) {
  throw new Error('用法: node gen-altstore-source.mjs <ipa> <tag> <out>');
}

const repo = process.env.GITHUB_REPOSITORY;
if (!repo) throw new Error('缺少环境变量 GITHUB_REPOSITORY（形如 owner/name）');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { version } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
if (!match) throw new Error(`无法解析版本号: ${version}`);
// 与 prepare-ios.mjs 的 CURRENT_PROJECT_VERSION 同一算法
const buildVersion = String(Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]));

const owner = repo.split('/')[0];
const releaseBase = `https://github.com/${repo}/releases`;

const source = {
  name: 'Atlas',
  identifier: 'uk.wort.atlas.source',
  // latest 指向最新 Release：每次发版都要带上本文件，否则该地址会 404
  sourceURL: `${releaseBase}/latest/download/altstore.json`,
  apps: [
    {
      name: 'Atlas',
      bundleIdentifier: 'uk.wort.atlas',
      developerName: owner,
      subtitle: '多类别媒体搜索',
      localizedDescription: 'Atlas 客户端（未签名包，由 AltStore / SideStore 使用你的 Apple ID 签名安装）。',
      iconURL: `https://raw.githubusercontent.com/${repo}/main/mobile/assets/icon-only.png`,
      tintColor: '0a0a0b',
      versions: [
        {
          version,
          buildVersion,
          date: new Date().toISOString(),
          downloadURL: `${releaseBase}/download/${tag}/${path.basename(ipaPath)}`,
          size: fs.statSync(ipaPath).size,
          minOSVersion: '15.0',
        },
      ],
    },
  ],
  news: [],
};

fs.writeFileSync(outPath, JSON.stringify(source, null, 2) + '\n');
console.log(`[altstore] ${version} (${buildVersion}) -> ${outPath}`);
