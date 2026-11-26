// The one desktop-only feature the page can ask for: the mini timer window.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', { mini: (on) => ipcRenderer.invoke('mini', Boolean(on)) });
