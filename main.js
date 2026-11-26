const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The one page this app ever shows. Compared without ?query/#hash (e.g. ?speed=60 when testing).
const PAGE = pathToFileURL(path.join(__dirname, 'index.html')).href;
const isAppPage = (url) => typeof url === 'string' && url.split(/[?#]/)[0] === PAGE;

app.setAppUserModelId('io.github.focusprotocol'); // Windows needs this to show notifications

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 600,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#111318',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // keep timers exact while minimised
      autoplayPolicy: 'no-user-gesture-required', // let alarms sound without a click first
    },
  });
  // Links (like the hype song) open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Never navigate the window itself anywhere else (a page from the web must not get the desktop bridge).
  win.webContents.on('will-navigate', (e, url) => { if (!isAppPage(url)) e.preventDefault(); });
  win.loadFile(path.join(__dirname, 'index.html'));

  // Update from GitHub Releases: downloads in the background, installs when the app closes.
  // Skipped for the portable .exe (nothing installed to update) and macOS (Apple only allows it for signed apps).
  if (app.isPackaged && process.platform !== 'darwin' && !process.env.PORTABLE_EXECUTABLE_DIR) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {}); // offline or no newer release: try again next launch
  }
});

// Mini timer: shrink to a small window in the top-right corner that stays above other apps.
let fullBounds;
ipcMain.handle('mini', (e, on) => {
  if (!isAppPage(e.senderFrame?.url)) return; // only the app's own page may resize the window
  const win = BrowserWindow.fromWebContents(e.sender);
  if (on) {
    fullBounds = win.getBounds();
    const area = screen.getDisplayMatching(fullBounds).workArea;
    win.setMinimumSize(220, 140);
    win.setBounds({ x: area.x + area.width - 300, y: area.y + 20, width: 280, height: 170 });
    win.setAlwaysOnTop(true, 'floating');
  } else if (fullBounds) {
    win.setAlwaysOnTop(false);
    win.setMinimumSize(600, 600);
    win.setBounds(fullBounds);
  }
});

app.on('window-all-closed', () => app.quit());
