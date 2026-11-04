/**
 * JAV 番号清洗 / 识别 / 查询变体
 *
 * 前后端唯一事实来源：搜索校验、榜单导入、推荐判断都使用同一套规则。
 * 设计原则：
 *   - 识别宽：标准番号、数字日期、下划线日期、多段（FC2）、HEYZO、数字前缀等；
 *   - canonical 只做无歧义归一化，不擅自改变站点语义（如下划线不改成横杠）；
 *   - 查询变体只用于后端详情抓取，不用于 UI 展示。
 */

export type JavCodeKind =
  | 'standard'
  | 'alnum'
  | 'numeric-dash'
  | 'numeric-underscore'
  | 'multi-segment'
  | 'tokyo-hot'
  | 'unknown';

export interface JavCodeInfo {
  code: string;
  kind: JavCodeKind;
  recognized: boolean;
}

/** 清洗输入：全角转半角、统一分隔符、去空格/零宽/包裹符号、转大写 */
function cleanJavCode(raw: string): string {
  let value = (raw ?? '').normalize('NFKC').trim();
  if (!value) return '';

  // 零宽字符
  value = value.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // 各种横线/破折号 → ASCII 横杠
  value = value.replace(/[\u2010-\u2015\uFF0D]/g, '-');
  // 全角下划线 → ASCII 下划线
  value = value.replace(/\uFF3F/g, '_');
  // 去掉所有空白
  value = value.replace(/\s+/g, '');
  // 去掉首尾包裹符号
  value = value.replace(/^[\[【(（]+/, '').replace(/[\]】)）]+$/, '');

  return value.toUpperCase();
}

/** 清洗 + 归一化；不保证结果一定是番号 */
export function normalizeJavCode(raw: string): string {
  const value = cleanJavCode(raw);
  if (!value) return '';

  // FC2：FC2PPV1234567 / FC2-PPV-1234567 / FC2-1234567 → FC2-PPV-1234567
  const fc2 = value.match(/^FC2(?:-?PPV)?-?(\d{5,8})$/);
  if (fc2) return `FC2-PPV-${fc2[1]}`;

  // Tokyo Hot：TOKYO HOT N1234 / TOKYO-HOT-N1234 → TOKYO-HOT-N1234
  const tokyoHot = value.match(/^TOKYO-?HOT-?([A-Z]?\d{3,5})$/);
  if (tokyoHot) return `TOKYO-HOT-${tokyoHot[1]}`;

  // 经典紧凑写法：ABP123 → ABP-123
  const compact = value.match(/^([A-Z]{2,10})(\d{1,6})$/);
  if (compact) return `${compact[1]}-${compact[2]}`;

  return value;
}

/** 识别格式；recognized=false 时按标题/多源搜索回退 */
export function inspectJavCode(raw: string): JavCodeInfo {
  const code = normalizeJavCode(raw);
  if (!code) return { code, kind: 'unknown', recognized: false };

  if (/^FC2-PPV-\d{5,8}$/.test(code)) {
    return { code, kind: 'multi-segment', recognized: true };
  }
  if (/^TOKYO-HOT-[A-Z]?\d{3,5}$/.test(code) || /^N\d{3,5}$/.test(code)) {
    return { code, kind: 'tokyo-hot', recognized: true };
  }
  if (/^\d{4,8}_\d{1,4}$/.test(code)) {
    return { code, kind: 'numeric-underscore', recognized: true };
  }
  if (/^\d{4,8}-\d{1,4}$/.test(code)) {
    return { code, kind: 'numeric-dash', recognized: true };
  }
  if (/^[A-Z]{2,10}-\d{1,6}$/.test(code)) {
    return { code, kind: 'standard', recognized: true };
  }
  if (/^[A-Z0-9]{2,10}-[A-Z0-9]{1,8}$/.test(code)) {
    return { code, kind: 'alnum', recognized: true };
  }
  if (/^[A-Z0-9]{2,10}(-[A-Z0-9]{1,10}){2,3}$/.test(code)) {
    return { code, kind: 'multi-segment', recognized: true };
  }

  return { code, kind: 'unknown', recognized: false };
}

/** 能否按番号模式处理（不保证站点有详情） */
export function isJavCodeLike(raw: string): boolean {
  return inspectJavCode(raw).recognized;
}

/** 经典番号：字母(2-10) + 横杠 + 数字(2-6) */
export function isClassicJavCode(raw: string): boolean {
  return /^[A-Z]{2,10}-\d{2,6}$/.test(normalizeJavCode(raw));
}

/** 经典番号的输入中前缀（允许还没输数字，用于搜索建议） */
export function isClassicJavCodePrefix(raw: string): boolean {
  const value = cleanJavCode(raw);
  return /^[A-Z]{2,10}-?\d{0,6}$/.test(value);
}

/** 等价 key：经典番号去横杠；其他格式保持原样，避免日期/下划线语义被破坏 */
export function compactJavCode(raw: string): string {
  const code = normalizeJavCode(raw);
  return isClassicJavCode(code) ? code.replace(/-/g, '') : code;
}

/** 查询变体（最多 4 个）：只用于后端详情抓取 */
export function javCodeLookupVariants(raw: string): string[] {
  const info = inspectJavCode(raw);
  if (!info.recognized) return [];

  const variants: string[] = [];
  const add = (value: string) => {
    if (value && !variants.includes(value)) variants.push(value);
  };

  add(info.code);

  if (info.kind === 'standard') {
    const match = info.code.match(/^([A-Z]{2,10})-(\d{1,6})$/);
    if (match) {
      if (match[2].length < 3) add(`${match[1]}-${match[2].padStart(3, '0')}`);
      add(`${match[1]}${match[2]}`);
    }
  } else if (info.kind === 'alnum') {
    add(info.code.replace(/-/g, ''));
  } else if (info.kind === 'multi-segment') {
    const match = info.code.match(/^FC2-PPV-(\d+)$/);
    if (match) {
      add(`FC2-${match[1]}`);
      add(`FC2PPV${match[1]}`);
    }
  } else if (info.kind === 'tokyo-hot') {
    if (info.code.startsWith('TOKYO-HOT-')) {
      const suffix = info.code.slice('TOKYO-HOT-'.length);
      add(suffix);
      if (/^\d/.test(suffix)) add(`N${suffix}`);
    } else if (/^N\d+$/.test(info.code)) {
      add(`TOKYO-HOT-${info.code}`);
      add(`TOKYO-HOT-${info.code.slice(1)}`);
    }
  }

  return variants.slice(0, 4);
}
