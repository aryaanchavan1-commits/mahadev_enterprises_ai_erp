const { app, BrowserWindow, Tray, Menu, dialog, shell, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'aryaanchavan1-commits',
      repo: 'mahadev_enterprises_ai_erp',
      releaseType: 'release'
    });
  }
} catch (e) {
  // electron-updater not available - auto-update disabled
}

let mainWindow = null;
let tray = null;
let PORT = 3000;

function checkPort(port) {
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close();
      resolve(true);
    });
  });
}

function emergLog(msg) {
  try {
    const logPath = path.join(app.getPath('userData'), 'mahadev-erp.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

function getDataDir() {
  try {
    const userData = app.getPath('userData');
    const dataDir = path.join(userData, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    return dataDir;
  } catch (e) {
    emergLog('getDataDir error: ' + e.message);
    const fallback = path.join(path.dirname(process.execPath), 'data');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function getIconPath() {
  const candidates = [
    path.join(__dirname, '..', 'client', 'public', 'logo.ico'),
    path.join(__dirname, '..', 'client', 'public', 'logo.jpg'),
    path.join(__dirname, '..', 'client', 'dist', 'logo.ico'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createExpressApp() {
  const express = require('express');
  const cors = require('cors');
  const { getDb } = require('../db');

  const server = express();
  server.use(cors());
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const uploadsDir = path.join(dataDir, 'uploads');
  const barcodesDir = path.join(dataDir, 'barcodes');
  const invoicesDir = path.join(dataDir, 'invoices');
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(barcodesDir, { recursive: true });
  fs.mkdirSync(invoicesDir, { recursive: true });

  server.get('/api/health', (req, res) => {
    res.json({ status: 'ok', name: 'Mahadev Enterprises ERP', version: '1.0.0', time: new Date().toISOString() });
  });

  server.use('/data/uploads', express.static(uploadsDir));
  server.use('/data/barcodes', express.static(barcodesDir));
  server.use('/invoices', express.static(invoicesDir));
  server.use('/uploads', express.static(uploadsDir));
  server.use('/barcodes', express.static(barcodesDir));

  server.use('/api/products', require('../routes/products'));
  server.use('/api/categories', require('../routes/categories'));
  server.use('/api/sales', require('../routes/sales'));
  server.use('/api/barcode', require('../routes/barcode'));
  server.use('/api/gst', require('../routes/gst'));
  server.use('/api/ai', require('../routes/ai'));
  server.use('/api/upload', require('../routes/upload'));
  server.use('/api/settings', require('../routes/settings'));
  server.use('/api/devices', require('../routes/devices'));
  server.use('/api/reports', require('../routes/reports'));
  server.use('/api/vyapar', require('../routes/vyapar'));
  server.use('/api/parties', require('../routes/parties'));
  server.use('/api/accounting', require('../routes/accounting'));
  server.use('/api/staff', require('../routes/staff'));
  server.use('/api/plates', require('../routes/plates'));

  const clientBuild = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(clientBuild)) {
    server.use(express.static(clientBuild));
    server.get('*', (req, res) => {
      res.sendFile(path.join(clientBuild, 'index.html'));
    });
  }

  return { server, getDb };
}

async function startServer(dataDir) {
  const { server, getDb } = createExpressApp(dataDir);
  try { await getDb(); } catch (e) { emergLog('DB warning: ' + e.message); }

  return new Promise((resolve, reject) => {
    const listener = server.listen(PORT, '127.0.0.1', () => {
      emergLog('Server started on port ' + PORT);
      resolve(listener);
    });
    listener.on('error', (err) => {
      emergLog('Server error: ' + err.message);
      // Try alternate port
      if (err.code === 'EADDRINUSE') {
        emergLog('Port ' + PORT + ' in use, trying alternate...');
        reject(new Error('Port ' + PORT + ' is already in use. Close other apps and try again.'));
      } else {
        reject(err);
      }
    });
  });
}

function createWindow() {
  const iconPath = getIconPath();
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Mahadev Enterprises ERP',
    ...(icon ? { icon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    backgroundColor: '#f0f2f5',
    autoHideMenuBar: true,
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    emergLog('Page load failed: ' + code + ' ' + desc);
    // Retry loading after 2 seconds
    setTimeout(() => {
      if (mainWindow) {
        try { mainWindow.loadURL(`http://127.0.0.1:${PORT}`); } catch {}
      }
    }, 2000);
  });

  // Show window after timeout even if ready-to-show doesn't fire
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.maximize();
    }
  }, 10000);

  mainWindow.on('close', (e) => {
    if (tray && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  try {
    const iconPath = getIconPath();
    if (!iconPath) return;
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Mahadev ERP', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } else { createWindow(); } } },
      { type: 'separator' },
      { label: 'Quit', click: () => { tray = null; app.isQuitting = true; app.quit(); } },
    ]);

    tray.setToolTip('Mahadev Enterprises ERP');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => { if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); } else { createWindow(); } });
  } catch {}
}

// Single instance lock - must be before app.whenReady
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const dataDir = getDataDir();
    process.env.DATA_DIR = dataDir;
    emergLog('Data dir: ' + dataDir);

    // Find available port
    let available = await checkPort(PORT);
    let tries = 0;
    while (!available && tries < 20) {
      PORT++;
      tries++;
      available = await checkPort(PORT);
    }
    if (!available) {
      dialog.showErrorBox('Port Error', 'No available port found. Close other apps and try again.');
      app.quit();
      return;
    }
    emergLog('Using port: ' + PORT);

    try {
      await startServer(dataDir);
    } catch (err) {
      emergLog('STARTUP ERROR: ' + err.message + '\n' + (err.stack || ''));
      dialog.showErrorBox('Startup Error', `Failed to start server:\n\n${err.message}\n\nPlease close other apps and try again.`);
      app.quit();
      return;
    }

    createWindow();
    createTray();
    setTimeout(() => checkForUpdates(), 10000);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('activate', () => {
  if (mainWindow === null) { createWindow(); } else { mainWindow.show(); }
});

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-data-path', () => app.getPath('userData'));
ipcMain.handle('open-external', (event, url) => shell.openExternal(url));

// Auto-start on Windows boot
ipcMain.handle('set-auto-start', (event, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, path: app.getPath('exe') });
    return app.getLoginItemSettings().openAtLogin;
  } catch { return false; }
});
ipcMain.handle('get-auto-start', () => {
  try { return app.getLoginItemSettings().openAtLogin; } catch { return false; }
});

// Auto-update
function checkForUpdates() {
  if (!autoUpdater) return;
  try { autoUpdater.checkForUpdates().catch(() => {}); } catch {}
}

if (autoUpdater) {
  autoUpdater.on('update-available', (info) => {
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available. Download and install now?\n\nYour data will NOT be affected.`,
      buttons: ['Download & Install', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} will install on restart.\nYour data is safe.`,
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });
}
