/**
 * JavDB 月榜 JSON → Atlas 导入 payload
 *
 * 用法：
 *   node scripts/rankings/javdb-to-atlas.mjs \
 *     --input censored.json --section censored --output censored.payload.json
 *
 * 输入结构（javdb-cli --json）：
 *   { "movies": [{ "number", "title", "origin_title", "cover_url", "thumb_url", "id", ... }] }
 * 列表顺序即名次；非标准番号由服务端过滤，这里保留原始 rank。
 */
import fs from 'node:fs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
    i++;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const input = args.input;
const section = args.section;
const output = args.output;

if (!input || !section || !output) {
  console.error('missing --input/--section/--output');
  process.exit(1);
}
if (section !== 'censored' && section !== 'uncensored') {
  console.error('invalid --section, expected censored|uncensored');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const movies = Array.isArray(raw.movies) ? raw.movies : [];

const items = movies
  .map((movie, index) => ({
    code: movie.number,
    title: movie.title || movie.origin_title || movie.number,
    cover: movie.cover_url || movie.thumb_url || undefined,
    rank: index + 1,
    url: movie.id ? `https://javdb.com/v/${movie.id}` : undefined,
  }))
  .filter((item) => Boolean(item.code));

const payload = {
  source: 'javdb',
  section,
  period: 'monthly',
  fetchedAt: Date.now(),
  items,
};

fs.writeFileSync(output, JSON.stringify(payload), 'utf8');
console.log(`${section}: ${items.length} items -> ${output}`);
