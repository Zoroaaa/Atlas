// Atlas 桌面端主进程：加载线上站点，只做壳层能力，不复制网站逻辑。
// 安全基线：远程内容按不可信处理，关闭 Node 能力，只放行站内导航。

const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron');
const path = require('node:path');

const APP_URL = 'https://atlas.wort.uk';
const APP_HOST = 'atlas.wort.uk';

// 允许交给系统处理的外部协议（磁力交给 BT 客户端，mailto 交给邮件客户端）
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'magnet:', 'mailto:']);

let mainWindow = null;

function isInternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      (parsed.hostname === APP_HOST || parsed.hostname.endsWith(`.${APP_HOST}`));
  } catch {
    return false;
  }
}

function openExternal(url) {
  try {
    const { protocol } = new URL(url);
    if (!EXTERNAL_PROTOCOLS.has(protocol)) return;
    shell.openExternal(url);
  } catch {
    // 非法 URL 直接忽略
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    // 内容区至少 1024：1024 是桌面布局（固定侧栏/文字标签）的起点。
    // 若按窗口外框算，Windows 标题栏与边框会吃掉十几像素，内容区掉到 lg 以下，
    // 后台会退化成汉堡抽屉，因此显式以内容尺寸为准。
    useContentSize: true,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0a0a0b',
    title: 'Atlas',
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 站外链接与磁力链接一律交给系统，不在壳内打开新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      mainWindow.loadURL(url);
    } else {
      openExternal(url);
    }
    return { action: 'deny' };
  });

  // 站内导航放行，其余（含 magnet:）拦截后交给系统
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  // 页面崩溃或渲染进程异常时给出可见反馈，避免白屏
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: 'Atlas 已停止响应',
      message: '页面进程意外退出',
      detail: '是否重新加载应用？',
      buttons: ['重新加载', '退出'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) mainWindow.reload();
    else app.quit();
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupUserAgent() {
  // 前端据此识别"应用壳"，从而跳过仅面向浏览器的门户首页
  const suffix = `AtlasApp/${app.getVersion()}`;
  session.defaultSession.setUserAgent(`${session.defaultSession.getUserAgent()} ${suffix}`);
}

function setupDownloads() {
  // 磁力种子、小说 txt 等下载统一走系统保存对话框，避免静默落到默认目录
  session.defaultSession.on('will-download', (event, item) => {
    const options = {
      title: '保存文件',
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
      buttonLabel: '保存',
    };
    const savePath = mainWindow
      ? dialog.showSaveDialogSync(mainWindow, options)
      : dialog.showSaveDialogSync(options);

    if (!savePath) {
      item.cancel();
      return;
    }
    item.setSavePath(savePath);
  });
}

function setupPermissions() {
  // 站点只用到剪贴板写入与通知，其余权限请求一律拒绝
  const allowed = new Set(['clipboard-sanitized-write', 'notifications']);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowed.has(permission));
  });
}

function setupMenu() {
  const template = [
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载', accelerator: 'F5' },
        { role: 'forceReload', label: '强制重新加载', accelerator: 'Ctrl+Shift+R' },
        { role: 'toggleDevTools', label: '开发者工具', accelerator: 'Ctrl+Shift+I' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏', accelerator: 'F11' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    setupUserAgent();
    setupDownloads();
    setupPermissions();
    setupMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
