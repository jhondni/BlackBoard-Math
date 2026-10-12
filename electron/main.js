'use strict';

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');

/* ---------------------------------------------------------
   Servidor HTTP estatico interno.
   Necessario porque a aplicacao usa ES modules (`import`),
   que o Chromium bloqueia sobre o protocolo `file://`.
   Roda em 127.0.0.1 com uma porta livre para nao depender
   de internet nem de um servidor externo.
   --------------------------------------------------------- */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
};

function createStaticServer(root) {
  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    if (pathname === '/' || pathname === '') pathname = '/index.html';

    const filePath = path.normalize(path.join(root, pathname));
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
  });
}

let server = null;
let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      show: false,
      backgroundColor: '#f4f2ee',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    mainWindow.maximize();

    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('http://127.0.0.1:')) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error(`FALHA AO CARREGAR [${errorCode}] ${errorDescription} - ${validatedURL}`);
    });

    if (process.env.LOUSA_VERBOSE === '1') {
      mainWindow.webContents.on('console-message', (event) => {
        console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
      });
      mainWindow.webContents.on('did-finish-load', () => {
        console.log('APP CARREGADO');
      });
    }

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://')) shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { mainWindow = null; });

    server = createStaticServer(APP_ROOT);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('will-quit', () => {
    if (server) {
      server.close();
      server = null;
    }
  });
}