import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchJavbusDetailWithMagnets,
  isJavbusEmptyMagnetResponse,
  isJavbusVerificationPage,
  parseMagnets,
} from '../jav-utils';

// ─── 真实结构夹具（取自 JavBus 磁力接口 MIMK-020 的响应） ──────────────

/** 有磁力：新版页面同时提供 href 与 onclick，href 里的 & 被转义成 &amp; */
const MAGNET_ROW = `
<tr onmouseover="this.style.backgroundColor='#F4F9FD'" height="35px">
  <td width="70%" onclick="window.open('magnet:?xt=urn:btih:8F02E988&dn=MIMK-020','_self')">
    <a style="color:#333" href="magnet:?xt=urn:btih:8F02E988&amp;dn=MIMK-020"> MIMK-020-中文字幕 </a>
  </td>
  <td style="text-align:center">
    <a href="magnet:?xt=urn:btih:8F02E988&amp;dn=MIMK-020"> 2.58GB </a>
  </td>
  <td style="text-align:center">
    <a href="magnet:?xt=urn:btih:8F02E988&amp;dn=MIMK-020"> 2026-01-06 </a>
  </td>
</tr>`;

/** 源站确实没有磁力：只隐藏 loading，不含表格 */
const EMPTY_MAGNET_BODY = `
<script type="text/javascript">
$('#movie-loading').hide();
</script>`;

/** 被校验/限流时的 200 页面（非空，但不是磁力表格） */
const VERIFY_BODY = `
<html><body>
  <h1>driver-verify</h1>
  <p>请完成访问验证后继续</p>
</body></html>`;

function detailHtml(gid = 25133575420): string {
  const filler = 'x'.repeat(600);
  return `<html><head><title>MIMK-020 母姉W相姦</title></head><body>
    <span>識別碼: MIMK-020</span>
    <h3>MIMK-020 母姉W相姦</h3>
    <script>var gid = ${gid}; var uc = 0;</script>
    <div>${filler}</div>
  </body></html>`;
}

const response = (body: string, status = 200) => new Response(body, { status });

/** 按 URL 分流：详情页返回 HTML，磁力接口按顺序返回预设响应 */
function mockFetch(magnetResponses: Array<() => Response | Promise<Response>>) {
  let magnetIndex = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('uncledatoolsbyajax')) {
      const factory = magnetResponses[Math.min(magnetIndex, magnetResponses.length - 1)];
      magnetIndex += 1;
      return factory();
    }
    return response(detailHtml());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseMagnets', () => {
  it('同时兼容 href 与 onclick，并还原 &amp;', () => {
    const magnets = parseMagnets(MAGNET_ROW);
    expect(magnets).toHaveLength(1);
    expect(magnets[0].magnet).toBe('magnet:?xt=urn:btih:8F02E988&dn=MIMK-020');
    expect(magnets[0].name).toContain('MIMK-020');
    expect(magnets[0].size).toBe('2.58GB');
    expect(magnets[0].date).toBe('2026-01-06');
  });

  it('只有 onclick 没有 href 时仍能解析', () => {
    const row = `<tr><td onclick="window.open('magnet:?xt=urn:btih:ABC','_self')">
      <a>only-onclick</a></td><td><a>1GB</a></td><td><a>2026-01-01</a></td></tr>`;
    const magnets = parseMagnets(row);
    expect(magnets).toHaveLength(1);
    expect(magnets[0].magnet).toBe('magnet:?xt=urn:btih:ABC');
  });
});

describe('磁力响应的空结果与失败区分', () => {
  it('JavBus 的合法空响应被识别为「真的没有磁力」', () => {
    expect(isJavbusEmptyMagnetResponse(EMPTY_MAGNET_BODY)).toBe(true);
    expect(isJavbusEmptyMagnetResponse('')).toBe(true);
    expect(isJavbusEmptyMagnetResponse(MAGNET_ROW)).toBe(false);
    expect(isJavbusEmptyMagnetResponse(VERIFY_BODY)).toBe(false);
  });

  it('验证页重定向被识别为抓取失败', () => {
    expect(isJavbusVerificationPage('https://www.javbus.com/doc/driver-verify?referer=x')).toBe(true);
    expect(isJavbusVerificationPage('https://www.javbus.com/MIMK-020')).toBe(false);
    expect(isJavbusVerificationPage('https://www.javbus.com/MIMK-020', VERIFY_BODY)).toBe(true);
    // 带 gid 的详情页即使正文出现 verify 字样也不算验证页
    expect(isJavbusVerificationPage('https://www.javbus.com/MIMK-020', detailHtml())).toBe(false);
  });
});

describe('fetchJavbusDetailWithMagnets', () => {
  it('MIMK-020 有磁力时解析出列表，且不标记失败', async () => {
    mockFetch([() => response(MAGNET_ROW)]);
    const result = await fetchJavbusDetailWithMagnets('MIMK-020', 5000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.magnets).toHaveLength(1);
    expect(result.data.magnetFetchFailed).toBe(false);
  });

  it('源站确实没有磁力：两次合法空响应 → 空列表 + 不算失败', async () => {
    mockFetch([() => response(EMPTY_MAGNET_BODY)]);
    const result = await fetchJavbusDetailWithMagnets('MIMK-021', 5000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.magnets).toHaveLength(0);
    expect(result.data.magnetFetchFailed).toBe(false);
  });

  it('第一次空、第二次拿到磁力：仍按成功处理', async () => {
    mockFetch([() => response(EMPTY_MAGNET_BODY), () => response(MAGNET_ROW)]);
    const result = await fetchJavbusDetailWithMagnets('MIMK-022', 5000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.magnets).toHaveLength(1);
    expect(result.data.magnetFetchFailed).toBe(false);
  });

  it('磁力接口 503 → magnetFetchFailed=true，不能写成缺磁力', async () => {
    mockFetch([() => response('server error', 503)]);
    const result = await fetchJavbusDetailWithMagnets('MIMK-023', 5000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.magnets).toHaveLength(0);
    expect(result.data.magnetFetchFailed).toBe(true);
  });

  it('磁力接口返回验证页 → magnetFetchFailed=true', async () => {
    mockFetch([() => response(VERIFY_BODY)]);
    const result = await fetchJavbusDetailWithMagnets('MIMK-024', 5000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.magnets).toHaveLength(0);
    expect(result.data.magnetFetchFailed).toBe(true);
  });

  it('磁力接口网络异常 → magnetFetchFailed=true', async () => {
    mockFetch([
      () => {
        throw new Error('network down');
      },
    ]);
    const result = await fetchJavbusDetailWithMagnets('MIMK-025', 5000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.magnetFetchFailed).toBe(true);
  });

  it('详情页被重定向到验证页 → 整次抓取失败，而不是解析成缺字段', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(VERIFY_BODY))
    );
    const result = await fetchJavbusDetailWithMagnets('MIMK-026', 5000);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('HTTP_ERROR');
  });
});
