// ─────────────────────────────────────────────────────────────────
// magnet.ts  —  磁力链接工具集
// ─────────────────────────────────────────────────────────────────

import { apiClient } from '@/services/api/client';

export interface ParsedMagnet {
  infoHash: string;    // 40位小写hex
  name: string;
  dn: string;
  trackers: string[];
}

// ── 解析 ─────────────────────────────────────────────────────────

export function parseMagnet(magnetUri: string): ParsedMagnet | null {
  if (!magnetUri || !magnetUri.startsWith('magnet:')) return null;
  try {
    const url = new URL(magnetUri);
    const params = new URLSearchParams(url.search.slice(1));

    const xt = params.get('xt') ?? '';
    const m = xt.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    if (!m) return null;

    let infoHash = m[1];
    if (infoHash.length === 32) infoHash = base32ToHex(infoHash);

    return {
      infoHash: infoHash.toLowerCase(),
      name: params.get('dn') ?? '',
      dn: params.get('dn') ?? '',
      trackers: params.getAll('tr'),
    };
  } catch {
    return null;
  }
}

function base32ToHex(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32.toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  let hex = '';
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    hex += parseInt(bits.slice(i, i + 8), 2).toString(16).padStart(2, '0');
  }
  return hex;
}

// ── 下载种子文件 ─────────────────────────────────────────────────
// 优先走后端代理获取真实 .torrent（含 pieces，BT 客户端可正确识别）
// 后端 404 时降级为直接下载 itorrents.org（前端同源限制可能失败，仅兜底）

export async function downloadTorrentFile(
  magnetUri: string,
  filename?: string,
): Promise<void> {
  const parsed = parseMagnet(magnetUri);
  if (!parsed) return;

  const hash = parsed.infoHash.toUpperCase();
  const name = (filename || parsed.name || hash).replace(/[/\\?%*:|"<>]/g, '_');

  // 1. 优先：后端代理
  // 动态获取API地址（与 services/api/client.ts 逻辑保持一致）
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const apiBase = (hostname === 'localhost' || hostname === '127.0.0.1')
    ? '/api'
    : 'https://backend.codeseek.pp.ua/api';
  const backendUrl = `${apiBase}/jav/torrent/${hash}`;

  try {
    const token = apiClient.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const resp = await fetch(backendUrl, { credentials: 'include', headers });
    if (resp.ok) {
      const blob = await resp.blob();
      triggerDownload(blob, name + '.torrent');
      return;
    }
  } catch {
    // 后端失败，继续走 fallback
  }

  // 2. Fallback：itorrents.org 直链（跨域，部分浏览器会被 CORS 拦）
  const directUrl = `https://itorrents.org/torrent/${hash}.torrent`;
  const a = document.createElement('a');
  a.href = directUrl;
  a.download = name + '.torrent';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── 复制到剪贴板 ─────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 兜底：execCommand（已废弃但兼容旧浏览器）
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// ── 唤起本地 BT 客户端 ───────────────────────────────────────────

export function openMagnetClient(magnetUri: string): void {
  window.location.href = magnetUri;
}

// ── 在线播放外链 ─────────────────────────────────────────────────

/** webtor.io — 流媒体播放，需海外可访问 */
export function getWebtorUrl(magnetUri: string): string {
  if (!magnetUri?.startsWith('magnet:')) return '';
  return `https://webtor.io/#/show?magnet=${encodeURIComponent(magnetUri)}`;
}

/** btorrent.xyz — WebTorrent 在线播放备用 */
export function getBtorrentUrl(magnetUri: string): string {
  if (!magnetUri?.startsWith('magnet:')) return '';
  return `https://btorrent.xyz/#${encodeURIComponent(magnetUri)}`;
}

/** 磁力短哈希（用于显示，不用于下载） */
export function getMagnetShortHash(magnetUri: string): string {
  const parsed = parseMagnet(magnetUri);
  return parsed ? parsed.infoHash.substring(0, 8).toUpperCase() : 'UNKNOWN';
}
