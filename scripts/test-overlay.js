const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  // Create a simple test window to verify Electron is working
  const testWindow = new BrowserWindow({
    width: 600,
    height: 400,
    x: 100,
    y: 100,
    frame: true, // With frame for easier debugging
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#2e2c29',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Create simple HTML content
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>HearthGem Test Window</title>
      <style>
        body {
          margin: 0;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-family: Arial, sans-serif;
          text-align: center;
        }
        .container {
          margin-top: 50px;
        }
        .title {
          font-size: 24px;
          margin-bottom: 20px;
        }
        .message {
          font-size: 16px;
          margin-bottom: 30px;
        }
        .button {
          background: #4CAF50;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        }
        .button:hover {
          background: #45a049;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="title">🃏 HearthGem Test Window</div>
        <div class="message">
          If you can see this window, Electron is working correctly!<br>
          This confirms the HearthGem overlay should also be functional.
        </div>
        <button class="button" onclick="window.close()">Close Test Window</button>
      </div>
    </body>
    </html>
  `;

  testWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
  
  testWindow.show();
  testWindow.focus();

  console.log('Test window created and should be visible!');
  console.log('Window position:', testWindow.getBounds());
});

app.on('window-all-closed', () => {
  app.quit();
});