const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 820,         // Slightly wider than canvas to account for layout margins
    height: 700,        // Tall enough for the canvas + HUD layout
    resizable: true,
    useContentSize: true, 
    autoHideMenuBar: true, // Automatically hides the file/edit navigation bar
    icon: path.join(__dirname, 'icon.ico'), // Embedded app icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load your local game
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});