const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oblivionDesktop', {
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  chooseAvatar: () => ipcRenderer.invoke('avatar:choose'),
  createNote: (note) => ipcRenderer.invoke('note:create', note),
  updateNote: (note) => ipcRenderer.invoke('note:update', note),
  getVault: () => ipcRenderer.invoke('vault:get'),
  onVaultChanged: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('A vault-change callback is required.');
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('vault:changed', listener);
    return () => ipcRenderer.removeListener('vault:changed', listener);
  }
});
