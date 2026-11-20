/**
 * 源健康探测的正文判定测试。
 *
 * 判定顺序是这套逻辑最容易出错的地方：结果页底部常挂验证码组件，
 * 一旦先判验证码，正常站点会被整片误报成「验证码拦截」。
 */
import { describe, it, expect } from 'vitest';
import { analyzeProbeHtml, HEALTH_PROBE_KEYWORD } from '@/services/source-health';

const probe = (html: string) => analyzeProbeHtml(html, HEALTH_PROBE_KEYWORD);

describe('analyzeProbeHtml', () => {
  it('命中探测词判为 online，即使页面同时存在验证码组件', () => {
    const html = `
      <html><body>
        <div class="g-recaptcha">captcha</div>
        <div class="item">ABP-984 松本いちか</div>
      </body></html>`;
    expect(probe(html).status).toBe('online');
  });

  it('探测词无横杠写法也算命中', () => {
    expect(probe('<div>abp984</div>').status).toBe('online');
  });

  it('命中拆开的词元时判为 online 并提示部分命中', () => {
    const result = probe('<div>ABP 系列 · 984 号作品</div>');
    expect(result.status).toBe('online');
    expect(result.note).toContain('部分命中');
  });

  it('Cloudflare 挑战页判为 challenge', () => {
    const html = '<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>';
    expect(probe(html).status).toBe('challenge');
  });

  it('中文人机验证页判为 challenge', () => {
    expect(probe('<div>请完成安全验证后继续访问</div>').status).toBe('challenge');
  });

  it('登录墙判为 login_required', () => {
    expect(probe('<div>请先登录后查看内容</div>').status).toBe('login_required');
  });

  it('明确的空结果页判为 empty_result', () => {
    expect(probe('<div>没有找到相关结果</div>').status).toBe('empty_result');
  });

  it('页面可达但既无命中也无空结果提示时判为 degraded', () => {
    expect(probe('<html><body><div id="app"></div><script src="/main.js"></script></body></html>').status)
      .toBe('degraded');
  });
});
