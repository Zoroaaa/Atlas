import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize,
  Loader2, AlertCircle, X, SkipBack, SkipForward,
  ExternalLink, Download,
} from 'lucide-react';
import { parseMagnet, getWebtorUrl } from '@/utils/magnet';

// ── WebTorrent 全局类型（1.x browser build）────────────────────────
declare global {
  interface Window {
    WebTorrent?: new () => WebTorrentClient;
  }
}

interface WebTorrentClient {
  add(
    magnetUri: string,
    opts: { announce?: string[] },
    cb: (torrent: Torrent) => void,
  ): void;
  destroy(cb?: () => void): void;
}

interface TorrentFile {
  name: string;
  length: number;
  progress: number;
  renderTo(elem: HTMLVideoElement, cb?: (err: Error | null, elem: HTMLElement) => void): void;
  appendTo?(elem: HTMLElement, cb?: (err: Error | null, elem: HTMLElement) => void): void;
}

interface Torrent {
  files: TorrentFile[];
  name: string;
  progress: number;
  done: boolean;
  downloadSpeed: number;   // 属性，不是方法
  numPeers: number;
  destroy(): void;
}

// WebTorrent 1.x browser build（2.x 不支持纯浏览器环境）
const WEBTORRENT_CDN = 'https://cdn.jsdelivr.net/npm/webtorrent@1.9.7/webtorrent.min.js';
const WEBTORRENT_CDN_FALLBACK = 'https://unpkg.com/webtorrent@1.9.7/webtorrent.min.js';

let loadPromise: Promise<void> | null = null;

function loadWebTorrent(): Promise<void> {
  if (window.WebTorrent) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    function tryLoad(src: string, fallback?: string) {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        if (window.WebTorrent) {
          resolve();
        } else if (fallback) {
          tryLoad(fallback);
        } else {
          loadPromise = null;
          reject(new Error('WebTorrent 加载失败，请检查网络'));
        }
      };
      script.onerror = () => {
        if (fallback) {
          tryLoad(fallback);
        } else {
          loadPromise = null;
          reject(new Error('网络错误，无法加载 WebTorrent'));
        }
      };
      document.head.appendChild(script);
    }
    tryLoad(WEBTORRENT_CDN, WEBTORRENT_CDN_FALLBACK);
  });

  return loadPromise;
}

function isVideoFile(name: string): boolean {
  const exts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.m2ts'];
  const lower = name.toLowerCase();
  return exts.some((e) => lower.endsWith(e));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(2) + ' GB';
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface WebTorrentPlayerProps {
  magnetUri: string;
  onClose?: () => void;
}

type PlayerStatus = 'loading_script' | 'loading' | 'ready' | 'playing' | 'paused' | 'error' | 'no_video';

const StatusCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-surface-900 rounded-xl overflow-hidden">
    <div className="flex flex-col items-center justify-center py-12 gap-3 px-4">
      {children}
    </div>
  </div>
);

export const WebTorrentPlayer: React.FC<WebTorrentPlayerProps> = ({ magnetUri, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<WebTorrentClient | null>(null);
  const torrentRef = useRef<Torrent | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<PlayerStatus>('loading_script');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [peers, setPeers] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const [videoFiles, setVideoFiles] = useState<TorrentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<TorrentFile | null>(null);
  const [showFileList, setShowFileList] = useState(false);

  const parsed = parseMagnet(magnetUri);

  const playFile = useCallback((file: TorrentFile) => {
    const video = videoRef.current;
    if (!video) return;

    setSelectedFile(file);
    setShowFileList(false);
    setStatus('ready');
    setCurrentTime(0);
    setDuration(0);

    video.pause();
    video.removeAttribute('src');
    video.load();

    if (typeof file.renderTo === 'function') {
      file.renderTo(video, (err) => {
        if (err) {
          setStatus('error');
          setError('视频渲染失败：' + err.message);
        }
      });
    } else if (typeof file.appendTo === 'function') {
      const wrapper = video.parentElement;
      if (wrapper) {
        file.appendTo(wrapper, (err) => {
          if (err) {
            setStatus('error');
            setError('视频渲染失败：' + err.message);
          }
        });
      }
    } else {
      setStatus('error');
      setError('当前 WebTorrent 版本不支持视频渲染，请使用 WebTor 备用播放');
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const cleanup = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (torrentRef.current) { try { torrentRef.current.destroy(); } catch { /* ignore cleanup errors */ } torrentRef.current = null; }
      if (clientRef.current) { try { clientRef.current.destroy(); } catch { /* ignore cleanup errors */ } clientRef.current = null; }
    };

    loadWebTorrent()
      .then(() => {
        if (!mounted || !window.WebTorrent) return;

        setStatus('loading');
        const client = new window.WebTorrent();
        clientRef.current = client;

        const trackers = (parsed?.trackers?.length ?? 0) > 0 ? parsed!.trackers : undefined;

        client.add(magnetUri, { announce: trackers }, (torrent: Torrent) => {
          if (!mounted) return;

          torrentRef.current = torrent;
          const videos = torrent.files.filter((f) => isVideoFile(f.name));
          setVideoFiles(videos);

          if (videos.length === 0) {
            setStatus('no_video');
            return;
          }

          const largest = videos.reduce((a, b) => (a.length > b.length ? a : b));
          playFile(largest);

          // downloadSpeed 是属性，直接读取
          intervalRef.current = setInterval(() => {
            if (torrentRef.current) {
              const t = torrentRef.current;
              setProgress(Math.round(t.progress * 100));
              setDownloadSpeed(t.downloadSpeed);
              setPeers(t.numPeers);
            }
          }, 1000);
        });
      })
      .catch((err: Error) => {
        if (mounted) { setStatus('error'); setError(err.message); }
      });

    return () => { mounted = false; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magnetUri]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setIsPlaying(true); setStatus('playing');
    } else {
      v.pause();
      setIsPlaying(false); setStatus('paused');
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const skip = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(duration, v.currentTime + seconds));
  }, [duration]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  }, []);

  const openWebtor = useCallback(() => {
    const url = getWebtorUrl(magnetUri);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, [magnetUri]);

  if (status === 'loading_script') {
    return (
      <StatusCard>
        <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
        <p className="text-surface-200 font-medium">正在加载播放器...</p>
        <p className="text-surface-400 text-sm">首次加载约需 1-3 秒</p>
      </StatusCard>
    );
  }

  if (status === 'loading') {
    return (
      <StatusCard>
        <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
        <p className="text-surface-200 font-medium">正在连接 P2P 网络...</p>
        <p className="text-surface-400 text-sm">首次加载可能需要 10-60 秒，取决于资源热度</p>
        <div className="flex items-center gap-4 text-xs text-surface-400">
          <span>进度: {progress}%</span>
          <span>节点: {peers}</span>
          <span>速度: {formatSize(downloadSpeed)}/s</span>
        </div>
        <button
          onClick={openWebtor}
          className="mt-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />改用 WebTor 在线播放
        </button>
      </StatusCard>
    );
  }

  if (status === 'error') {
    return (
      <StatusCard>
        <AlertCircle className="w-10 h-10 text-error-400" />
        <p className="text-surface-200 font-medium">播放失败</p>
        <p className="text-surface-400 text-sm max-w-xs text-center">{error}</p>
        <button
          onClick={openWebtor}
          className="mt-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />使用 WebTor 在线播放
        </button>
      </StatusCard>
    );
  }

  if (status === 'no_video') {
    return (
      <StatusCard>
        <AlertCircle className="w-10 h-10 text-amber-400" />
        <p className="text-surface-200 font-medium">未找到视频文件</p>
        <p className="text-surface-400 text-sm">该磁力链接可能不含视频内容</p>
        <button
          onClick={openWebtor}
          className="mt-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />使用 WebTor 查看
        </button>
      </StatusCard>
    );
  }

  return (
    <div ref={containerRef} className="bg-surface-900 rounded-xl overflow-hidden relative group">
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          className="w-full h-full"
          onTimeUpdate={() => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); }}
          onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration); }}
          onPlay={() => { setIsPlaying(true); setStatus('playing'); }}
          onPause={() => { setIsPlaying(false); setStatus('paused'); }}
          onClick={togglePlay}
        />

        {status === 'ready' && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
            onClick={togglePlay}
          >
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
              <Play className="w-8 h-8 text-white ml-1" />
            </div>
          </div>
        )}

        {onClose && (
          <div className="absolute top-3 right-3">
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-3 mb-2">
            <input
              type="range" min="0" max={duration || 100} value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1 bg-surface-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-400"
            />
            <span className="text-xs text-surface-300 tabular-nums min-w-[80px] text-right">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={togglePlay} className="p-1.5 text-white hover:text-primary-400 transition-colors">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button onClick={() => skip(-10)} className="p-1.5 text-white hover:text-primary-400 transition-colors">
                <SkipBack className="w-4 h-4" />
              </button>
              <button onClick={() => skip(10)} className="p-1.5 text-white hover:text-primary-400 transition-colors">
                <SkipForward className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={toggleMute} className="p-1.5 text-white hover:text-primary-400 transition-colors">
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-surface-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {videoFiles.length > 1 && (
                <button
                  onClick={() => setShowFileList((v) => !v)}
                  className="px-2 py-1 text-xs text-surface-300 hover:text-white transition-colors max-w-[120px] truncate"
                  title={selectedFile?.name}
                >
                  {selectedFile?.name.slice(0, 20)}…
                </button>
              )}
              <button onClick={toggleFullscreen} className="p-1.5 text-white hover:text-primary-400 transition-colors">
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 py-2 bg-surface-800 flex items-center justify-between text-xs text-surface-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Download className="w-3 h-3" />{progress}%
          </span>
          <span>节点: {peers}</span>
          <span>{formatSize(downloadSpeed)}/s</span>
        </div>
        <button
          onClick={openWebtor}
          className="text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />WebTor 备用播放
        </button>
      </div>

      {showFileList && videoFiles.length > 1 && (
        <div className="absolute bottom-12 right-3 bg-surface-800 rounded-lg shadow-xl border border-surface-700 max-h-48 overflow-y-auto z-10">
          {videoFiles.map((file, i) => (
            <button
              key={i}
              onClick={() => playFile(file)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-700 transition-colors ${
                selectedFile === file ? 'bg-primary-500/20 text-primary-400' : 'text-surface-200'
              }`}
            >
              <div className="truncate max-w-[240px]">{file.name}</div>
              <div className="text-xs text-surface-400">{formatSize(file.length)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
