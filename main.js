/**
 * main.js — Guest Management System v2.0
 *
 * Enhancements in this release:
 *  - Splash: animated glowing orbs, dot-grid bg, gradient progress bar,
 *    step indicator dots, shimmer on icon and progress bar
 *  - index.html: shimmer CTA button, pulse rings on metric cards,
 *    page & metric card staggered entrance animations, spring modal,
 *    animated number pop when metric changes, topbar stripe texture,
 *    lift + shadow on card hover, spring avatar scale on row hover
 *  - renderer.js: staggered row slide-in, hourly bar chart,
 *    animated metric number updates, number-pop animation
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const dbPath = path.join(__dirname, 'guests.db');
console.log("Database location:", dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database opening error:', err);
  else     console.log('Connected to SQLite database.');
});

db.run(`
  CREATE TABLE IF NOT EXISTS guests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name      TEXT,
    person_to_visit TEXT,
    purpose        TEXT,
    contact_number TEXT,
    time_in        TEXT,
    time_out       TEXT,
    status         TEXT
  )
`);

let splashWindow = null;
let mainWindow   = null;

// ── SPLASH ────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 620,
    height: 420,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  splashWindow.loadFile('splash.html');

  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });
}

// ── MAIN WINDOW ───────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    show: false,
    center: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });
}

// Splash signals it's done → open main window
ipcMain.on('splash-done', () => {
  createMainWindow();
});

app.whenReady().then(createSplash);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC HANDLERS ──────────────────────────────────────────

ipcMain.on('guest-time-in', (event, guestData) => {
  const { fullName, personToVisit, purpose, contactNumber } = guestData;
  const timeIn = new Date().toLocaleString();

  db.run(
    `INSERT INTO guests
      (full_name, person_to_visit, purpose, contact_number, time_in, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fullName, personToVisit, purpose, contactNumber, timeIn, 'Inside'],
    function (err) {
      if (err) console.error("Insert error:", err.message);
      else     console.log('Guest added successfully.');
    }
  );
});

ipcMain.handle('get-guests-inside', async () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM guests WHERE status = 'Inside' ORDER BY id DESC`,
      [],
      (err, rows) => { if (err) reject(err); else resolve(rows); }
    );
  });
});

ipcMain.on('guest-time-out', (event, guestId) => {
  const timeOut = new Date().toLocaleString();

  db.run(
    `UPDATE guests
     SET time_out = ?, status = 'Out'
     WHERE id = ? AND status = 'Inside'`,
    [timeOut, guestId],
    function (err) {
      if (err) console.error("Time out error:", err.message);
      else     console.log(`Guest timed out. Rows updated: ${this.changes}`);
    }
  );
});

ipcMain.handle('get-guest-log', async () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM guests ORDER BY id DESC LIMIT 20`,
      [],
      (err, rows) => { if (err) reject(err); else resolve(rows); }
    );
  });
});

ipcMain.handle('get-total-today', async () => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT time_in FROM guests`, [], (err, rows) => {
      if (err) reject(err);
      else {
        const today = new Date().toLocaleDateString();
        const count = rows.filter(r => r.time_in && r.time_in.startsWith(today)).length;
        resolve(count);
      }
    });
  });
});

// ── NEW: Hourly breakdown (used by the chart in renderer.js) ──
// renderer.js computes this client-side from get-guest-log data,
// so no extra IPC handler is needed. This comment is here for clarity.