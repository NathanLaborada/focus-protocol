const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 600,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#111318',
    webPreferences: {
      backgroundThrottling: false, // keep timers exact while minimised
      autoplayPolicy: 'no-user-gesture-required', // let alarms sound without a click first
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
