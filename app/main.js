const { app, BrowserWindow, ipcMain, shell, Menu, dialog, webContents, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const { pathToFileURL, fileURLToPath } = require("url");

const IS_PACKAGED = app.isPackaged;
const PIPE_DIR = IS_PACKAGED
  ? path.join(process.resourcesPath, "pipeline")
  : path.resolve(__dirname, "..", "newspaper");
const DATA = IS_PACKAGED ? app.getPath("userData") : path.resolve(__dirname, "..");
const ROOT = DATA;
const OUTPUT = path.join(DATA, "output");
const SITES = path.join(DATA, "sites.txt");
const SETTINGS = path.join(DATA, "settings.json");
const UI_FILE = path.join(DATA, "ui.json");

let win = null;
let running = false;
let runChild = null;
let stopRequested = false;

/* --------------------------------------------------------------- paths/env */
function seedData() {
  fs.mkdirSync(DATA, { recursive: true });
  const seeds = IS_PACKAGED ? path.join(process.resourcesPath, "seeds") : null;

  if (!fs.existsSync(SITES)) {
    const from = seeds ? path.join(seeds, "sites.txt") : path.join(__dirname, "..", "sites.txt");
    if (fs.existsSync(from)) fs.copyFileSync(from, SITES);
  }
  if (!fs.existsSync(SETTINGS)) {
    const from = seeds ? path.join(seeds, "settings.json") : path.join(__dirname, "..", "settings.json");
    if (fs.existsSync(from)) fs.copyFileSync(from, SETTINGS);
  }
}

function childEnv() {
  return { ...process.env, HMERISIA_DATA: DATA };
}

function cliArgs(extra) {
  return IS_PACKAGED ? extra : ["run.py", ...extra];
}

function pythonExe() {
  if (IS_PACKAGED) return path.join(PIPE_DIR, "hmerisia.exe");
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
    return (raw.runtime && raw.runtime.python) || "python";
  } catch {
    return "python";
  }
}

/* --------------------------------------------------------------- processes */
function pythonSync(args) {
  return new Promise((resolve) => {
    const child = spawn(pythonExe(), args, {
      cwd: PIPE_DIR,
      env: childEnv(),
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString("utf8")));
    child.stderr.on("data", (d) => (err += d.toString("utf8")));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

function streamPython(args, onLine, onErr) {
  const child = spawn(pythonExe(), args, {
    cwd: PIPE_DIR,
    env: childEnv(),
    windowsHide: true,
  });
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) if (line.trim()) onLine(line);
  });
  child.stderr.on("data", (chunk) => onErr(chunk.toString("utf8")));
  return child;
}

function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve(false);
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    killer.on("close", () => resolve(true));
    killer.on("error", () => resolve(false));
  });
}

function stopScheduledTask() {
  return new Promise((resolve) => {
    const child = spawn("schtasks", ["/End", "/TN", "HmerisiaDaily"], { windowsHide: true });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function runPowerShell(args) {  return new Promise((resolve) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ...args],
      { cwd: ROOT, env: childEnv(), windowsHide: true }
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString("utf8")));
    child.stderr.on("data", (d) => (err += d.toString("utf8")));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

function queryTask() {
  const script = [
    "$t = Get-ScheduledTask -TaskName 'HmerisiaDaily' -ErrorAction SilentlyContinue;",
    "if (-not $t) { 'missing'; exit 0 }",
    "$i = Get-ScheduledTaskInfo -TaskName 'HmerisiaDaily';",
    "'{0}|{1}|{2}' -f $t.State, $i.NextRunTime, $i.LastRunTime",
  ].join(" ");
  return new Promise((resolve) => {
    const child = spawn("powershell", ["-NoProfile", "-Command", script], {
      windowsHide: true,
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString("utf8")));
    child.on("close", () => {
      const line = out.trim().split(/\r?\n/).pop() || "missing";
      if (line === "missing") return resolve({ exists: false });
      const [state, next, last] = line.split("|");
      resolve({ exists: true, state, next, last });
    });
  });
}

async function readSettingsJson() {
  const res = await pythonSync(cliArgs(["--print-settings"]));
  try {
    return JSON.parse(res.out.trim().split(/\r?\n/).pop());
  } catch {
    try {
      return JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
    } catch {
      return null;
    }
  }
}

/* -------------------------------------------------------------- filesystem */
function readSites() {
  if (!fs.existsSync(SITES)) return [];
  return fs
    .readFileSync(SITES, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function writeSites(list) {
  fs.writeFileSync(SITES, list.join("\n") + "\n", "utf8");
}

function readHealth() {
  const file = path.join(OUTPUT, "health.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function findEdition(date) {
  const dir = path.join(OUTPUT, date);
  if (!fs.existsSync(dir)) return null;
  const html = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("efimerida-") && f.endsWith(".html"))
    .sort()
    .pop();
  return html ? path.join(dir, html) : null;
}

function historyEntries() {
  if (!fs.existsSync(OUTPUT)) return [];
  const entries = [];
  for (const name of fs.readdirSync(OUTPUT)) {
    const dir = path.join(OUTPUT, name);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(name) || !fs.statSync(dir).isDirectory()) continue;
    const html = findEdition(name);
    if (!html) continue;
    let stats = null;
    const edition = path.join(dir, "data", "edition.json");
    if (fs.existsSync(edition)) {
      try {
        stats = JSON.parse(fs.readFileSync(edition, "utf8"));
      } catch {
        stats = null;
      }
    }
    entries.push({
      date: name,
      url: pathToFileURL(html).href,
      items: stats?.stats?.total_items ?? null,
      pages: stats?.total_pages ?? (stats?.pages?.length ? stats.pages.length + 3 : null),
      images: stats?.coverage?.with_image ?? null,
      coverage: stats?.coverage?.percent ?? null,
      quality: stats?.quality ?? null,
      mtime: fs.statSync(html).mtimeMs,
    });
  }
  return entries.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ------------------------------------------------------------------ window */
async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#14120f",
    title: "Η ΗΜΕΡΗΣΙΑ",
    icon: path.join(__dirname, "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  await win.loadFile(path.join(__dirname, "index.html"));
  win.on("enter-full-screen", notifyFullscreen);
  win.on("leave-full-screen", notifyFullscreen);
}

function notifyFullscreen() {
  if (win && !win.isDestroyed()) {
    win.webContents.send("window:fullscreen-changed", win.isFullScreen());
  }
}

/* ------------------------------------------------------------ UI language */
function uiText() {
  let lang = "en";
  try {
    const data = JSON.parse(fs.readFileSync(UI_FILE, "utf8"));
    if (data && data.lang === "el") lang = "el";
  } catch {}
  return lang === "el"
    ? {
        print: "Εκτύπωση",
        edition: "φύλλο",
        pdfFolderTitle: "Φάκελος αποθήκευσης PDF",
        selectFolder: "Επιλογή φακέλου",
        site: "site",
      }
    : {
        print: "Print",
        edition: "edition",
        pdfFolderTitle: "PDF output folder",
        selectFolder: "Select folder",
        site: "site",
      };
}

app.whenReady().then(() => {
  app.setAppUserModelId("gr.hmerisia.desktop");
  Menu.setApplicationMenu(null);
  seedData();
  createWindow();
});
app.on("window-all-closed", () => app.quit());

// Κλείσιμο εφαρμογής με έκδοση σε εξέλιξη → μη μένει ορφανή διεργασία.
app.on("before-quit", () => {
  if (runChild?.pid) {
    try {
      spawnSync("taskkill", ["/pid", String(runChild.pid), "/T", "/F"], { windowsHide: true });
    } catch {
      // αγνόησε
    }
  }
});

// Τα links μέσα στο webview μένουν στο ίδιο παράθυρο (in-app), όχι σε νέο.
app.on("web-contents-created", (_e, contents) => {
  if (contents.getType() !== "webview") return;
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) contents.loadURL(url);
    else if (/^(mailto|tel):/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Το focus ζει μέσα στο webview, οπότε τα πλήκτρα πιάνονται εδώ.
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = String(input.key || "").toLowerCase();
    const ctrl = input.control || input.meta;
    if (key === "f11") {
      event.preventDefault();
      if (win && !win.isDestroyed()) win.setFullScreen(!win.isFullScreen());
    } else if (key === "escape" && win && win.isFullScreen()) {
      event.preventDefault();
      win.setFullScreen(false);
    } else if (ctrl && key === "p") {
      event.preventDefault();
      win?.webContents.send("print:request");
    } else if (ctrl && input.shift && key === "c") {
      event.preventDefault();
      win?.webContents.send("copy:request");
    }
  });
});

/* --------------------------------------------------------------------- IPC */
ipcMain.handle("app:info", () => ({
  root: ROOT,
  python: pythonExe(),
  packaged: IS_PACKAGED,
  sites: readSites().length,
  history: historyEntries(),
}));

ipcMain.handle("run:start", (_e, opts = {}) => {
  if (running) return { ok: false, error: "running" };
  running = true;
  stopRequested = false;
  const args = ["--today", "--json-progress"];
  if (opts.offline) args.push("--offline");
  if (opts.pdf) args.push("--pdf");

  const child = streamPython(
    cliArgs(args),
    (line) => {
      try {
        const evt = JSON.parse(line);
        win?.webContents.send("run:event", evt);
      } catch {
        win?.webContents.send("run:log", line);
      }
    },
    (text) => win?.webContents.send("run:log", text.trimEnd())
  );
  runChild = child;

  child.on("close", (code) => {
    running = false;
    runChild = null;
    const stopped = stopRequested;
    stopRequested = false;
    win?.webContents.send("run:end", { code, stopped, history: historyEntries() });
  });

  return { ok: true };
});

ipcMain.handle("run:stop", async () => {
  let killed = false;
  if (runChild?.pid) {
    stopRequested = true;
    killed = await killTree(runChild.pid);
  }
  const scheduled = await stopScheduledTask();
  return { ok: true, killed, scheduled };
});

async function cleanupCall(extra) {
  const res = await pythonSync(cliArgs(["--cleanup", ...extra, "--json-progress"]));
  const lines = res.out.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  const last = lines.reverse().find((l) => l.includes('"cleanup"') || l.includes("cleanup_done"));
  if (!last) return { ok: false, error: (res.err || res.out).slice(-400) };
  try {
    return { ok: true, ...JSON.parse(last) };
  } catch {
    return { ok: false, error: (res.err || res.out).slice(-400) };
  }
}

ipcMain.handle("history:preview", (_e, payload = {}) => {
  const keep = Math.max(0, Number(payload.keepDays ?? 7));
  const extra = ["--keep", String(keep), "--dry-run"];
  if (payload.cache) extra.push("--cache");
  return cleanupCall(extra);
});

ipcMain.handle("history:cleanup", async (_e, payload = {}) => {
  const keep = Math.max(0, Number(payload.keepDays ?? 7));
  const extra = ["--keep", String(keep), "--yes"];
  if (payload.cache) extra.push("--cache");
  const result = await cleanupCall(extra);
  return { ...result, history: historyEntries() };
});

ipcMain.handle("edition:delete", async (_e, date) => {
  const res = await pythonSync(cliArgs(["--delete-date", String(date), "--json-progress"]));
  const line = res.out
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim().startsWith("{"));
  let parsed = {};
  try {
    parsed = line ? JSON.parse(line) : {};
  } catch {}
  return { ok: !parsed.error, ...parsed, history: historyEntries() };
});

ipcMain.handle("history:list", () => historyEntries());

ipcMain.handle("edition:url", (_e, date) => {
  const file = findEdition(date);
  return file ? pathToFileURL(file).href : null;
});

ipcMain.handle("edition:openExternal", (_e, date) => {
  const file = findEdition(date);
  if (file) shell.openExternal(pathToFileURL(file).href);
  return !!file;
});

/* --------------------------------------------------------------- pdf / print */
function readSettingsRaw() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  } catch {
    return {};
  }
}

function pdfTarget(file) {
  const name = path.basename(file).replace(/\.html?$/i, ".pdf");
  const custom = String(readSettingsRaw()?.runtime?.pdf_dir || "").trim();
  if (custom) {
    try {
      fs.mkdirSync(custom, { recursive: true });
      fs.accessSync(custom, fs.constants.W_OK);
      return path.join(custom, name);
    } catch {
      // μη εγγράψιμος φάκελος → πίσω στον φάκελο του φύλλου
    }
  }
  return file.replace(/\.html?$/i, ".pdf");
}

async function buildPdf(file) {
  const pdfPath = pdfTarget(file);
  const htmlTime = fs.statSync(file).mtimeMs;
  if (fs.existsSync(pdfPath)) {
    const existing = fs.statSync(pdfPath);
    if (existing.size > 1024 && existing.mtimeMs >= htmlTime) return pdfPath;
  }

  const hidden = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await hidden.loadFile(file);
    await new Promise((r) => setTimeout(r, 800));
    const data = await hidden.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { marginType: "none" },
      preferCSSPageSize: true,
    });
    if (!data || data.length < 1024) throw new Error("empty-pdf");
    fs.writeFileSync(pdfPath, data);
    return pdfPath;
  } finally {
    hidden.destroy();
  }
}

ipcMain.handle("edition:exportPdf", async (_e, date) => {
  const file = findEdition(date);
  if (!file) return { ok: false, error: "no-edition" };
  try {
    return { ok: true, pdf: await buildPdf(file) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

let printPreview = null;

async function openPrintPreview(pdfPath, label) {
  if (printPreview && !printPreview.isDestroyed()) printPreview.destroy();
  const strings = uiText();

  const preview = new BrowserWindow({
    width: 1000,
    height: 1080,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: "#14120f",
    title: `${strings.print} — ${label || strings.edition}`,
    icon: path.join(__dirname, "assets", "icon.png"),
    autoHideMenuBar: true,
    parent: win || undefined,
    webPreferences: {
      sandbox: true,
      plugins: true,
    },
  });
  printPreview = preview;
  preview.on("closed", () => {
    if (printPreview === preview) printPreview = null;
  });

  await preview.loadURL(pathToFileURL(pdfPath).href);
  preview.show();
  preview.focus();

  // Δεν καλούμε webContents.print() εδώ: στο Electron/Windows τυπώνει κενή
  // σελίδα όταν το περιεχόμενο είναι PDF viewer. Η εκτύπωση γίνεται από το
  // κουμπί εκτυπωτή του ίδιου του viewer (plugin path).
  return { ok: true, pdf: pdfPath };
}

ipcMain.handle("window:fullscreen", (_e, on) => {
  if (!win || win.isDestroyed()) return false;
  win.setFullScreen(!!on);
  return win.isFullScreen();
});

ipcMain.handle("print:preview", async (_e, payload = {}) => {
  if (!win || win.isDestroyed()) return { ok: false, error: "no-window" };
  const id = Number(payload.webContentsId);
  const date = payload.date ? String(payload.date) : null;
  const target = Number.isFinite(id) ? webContents.fromId(id) : null;
  if (!target || target.isDestroyed()) return { ok: false, error: "no-target" };
  if (target.hostWebContents && target.hostWebContents.id !== win.webContents.id) {
    return { ok: false, error: "no-target" };
  }

  const url = target.getURL();
  if (/^file:/i.test(url)) {
    let file = null;
    try {
      file = fileURLToPath(url);
    } catch {}
    if (!file || !fs.existsSync(file)) file = date ? findEdition(date) : null;
    if (!file) return { ok: false, error: "no-edition" };
    try {
      const pdfPath = await buildPdf(file);
      return openPrintPreview(pdfPath, date || path.basename(file, ".html"));
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  if (/^https?:/i.test(url)) {
    try {
      const data = await target.printToPDF({ printBackground: true });
      if (!data || data.length < 1024) return { ok: false, error: "empty-pdf" };
      const dir = path.join(DATA, "cache", "print");
      fs.mkdirSync(dir, { recursive: true });
      const pdfPath = path.join(dir, `site-${Date.now()}.pdf`);
      fs.writeFileSync(pdfPath, data);
      let host = "";
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {}
      return openPrintPreview(pdfPath, host || uiText().site);
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  return { ok: false, error: "no-target" };
});

/* ----------------------------------------------------------------- sources */
const KNOWN_SOURCE_NAMES = {
  "bbc.com": "BBC News",
  "bbc.co.uk": "BBC News",
  "cnn.gr": "CNN Greece",
  "cnn.com": "CNN International",
  "edition.cnn.com": "CNN International",
  "finance.yahoo.com": "Yahoo Finance",
  "gamespot.com": "GameSpot",
  "nba.com": "NBA",
  "euroleaguebasketball.net": "EuroLeague",
  "imdb.com": "IMDb",
};

// Το κλειδί βάρους ακολουθεί το domain που χρησιμοποιεί το pipeline.
const KNOWN_SOURCE_DOMAINS = {
  "bbc.com": "bbc.com",
  "bbc.co.uk": "bbc.com",
  "edition.cnn.com": "cnn.com",
  "cnn.com": "cnn.com",
  "cnn.gr": "cnn.gr",
  "finance.yahoo.com": "finance.yahoo.com",
  "gamespot.com": "gamespot.com",
  "nba.com": "nba.com",
  "euroleaguebasketball.net": "euroleaguebasketball.net",
  "imdb.com": "imdb.com",
};

ipcMain.handle("sources:list", () => {
  const settings = readSettingsRaw() || {};
  const health = readHealth();
  const healthByName = {};
  for (const [name, entry] of Object.entries(health)) {
    healthByName[name.toLowerCase()] = { name, ...entry };
  }
  const disabled = new Set(settings.sources_disabled || []);
  const weights = settings.weights || {};

  return readSites().map((url, index) => {
    let host = url;
    let handle = "";
    try {
      const parsed = new URL(url);
      host = parsed.hostname.replace(/^www\./, "");
      if (host.includes("youtube.com")) {
        handle = parsed.pathname.split("/").filter(Boolean).pop() || "";
      }
    } catch {}
    const kind = host.includes("youtube.com") ? "youtube" : "site";
    const fallbackName = kind === "youtube"
      ? (handle || host)
      : (KNOWN_SOURCE_NAMES[host] || host);

    const knownName = KNOWN_SOURCE_NAMES[host];
    let entry =
      healthByName[(handle || "").toLowerCase()] ||
      (knownName ? healthByName[knownName.toLowerCase()] : null) ||
      healthByName[host.toLowerCase()] || null;

    if (!entry) {
      entry =
        Object.entries(healthByName).find(([name]) => {
          if (handle && name.includes(handle.toLowerCase())) return true;
          const labels = host.split(".").filter((p) => p.length > 2);
          return labels.some((l) => name.includes(l) || l.includes(name));
        })?.[1] || null;
    }

    const name = entry?.name || fallbackName;
    // Σταθερό κλειδί: source_id για YouTube, domain για sites.
    const sourceId = kind === "youtube"
      ? `yt-${String(handle || "youtube").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
      : (KNOWN_SOURCE_DOMAINS[host] || host);
    const key = sourceId;
    const weight = Math.max(
      0.3,
      Math.min(2, Number(
        weights[key] ?? weights[name] ?? weights[handle] ?? weights[host] ?? 1
      ) || 1)
    );

    return {
      url,
      host,
      handle,
      kind,
      key,
      sourceId,
      name,
      order: index,
      active: !disabled.has(url),
      status: entry?.status || "unknown",
      items: entry?.items ?? null,
      method: entry?.last_method || null,
      lastOk: entry?.last_ok || null,
      weight,
      pages: Math.max(1, Math.min(4, Math.round(weight))),
    };
  });
});

ipcMain.handle("sources:toggle", async (_e, payload = {}) => {
  const url = String(payload.url || "").trim();
  if (!url) return { ok: false, error: "invalid" };
  const active = payload.active !== false;
  const settings = (await readSettingsJson()) || {};
  const disabled = new Set((settings.sources_disabled || []).filter(Boolean));
  if (active) disabled.delete(url);
  else disabled.add(url);
  settings.sources_disabled = Array.from(disabled);
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2), "utf8");
  return { ok: true, active, disabled: settings.sources_disabled };
});

ipcMain.handle("sources:add", (_e, url) => {
  const clean = String(url || "").trim();
  if (!/^https?:\/\//i.test(clean)) return { ok: false, error: "invalid" };
  const list = readSites();
  if (list.includes(clean)) return { ok: false, error: "duplicate" };
  list.push(clean);
  writeSites(list);
  return { ok: true };
});

ipcMain.handle("sources:remove", async (_e, url) => {
  writeSites(readSites().filter((u) => u !== url));
  const settings = (await readSettingsJson()) || {};
  const disabled = (settings.sources_disabled || []).filter((u) => u !== url);
  if (disabled.length !== (settings.sources_disabled || []).length) {
    settings.sources_disabled = disabled;
    fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2), "utf8");
  }
  return { ok: true };
});

ipcMain.handle("sources:weight", async (_e, payload = {}) => {
  const key = String(payload.key || payload.host || "").trim();
  const value = Math.max(0.3, Math.min(2, Number(payload.weight) || 1));
  if (!key) return { ok: false };
  const settings = (await readSettingsJson()) || {};
  settings.weights = settings.weights || {};
  if (Math.abs(value - 1) < 0.001) delete settings.weights[key];
  else settings.weights[key] = value;
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2), "utf8");
  return { ok: true, weights: settings.weights };
});

ipcMain.handle("sources:reorder", (_e, urls) => {
  const current = readSites();
  const wanted = Array.isArray(urls) ? urls.map((u) => String(u || "").trim()) : [];
  const ordered = [];
  for (const url of wanted) {
    if (current.includes(url) && !ordered.includes(url)) ordered.push(url);
  }
  // Ποτέ μη χάσεις πηγή αν το UI στείλει ελλιπή λίστα.
  for (const url of current) {
    if (!ordered.includes(url)) ordered.push(url);
  }
  if (!ordered.length) return { ok: false, error: "empty" };
  writeSites(ordered);
  return { ok: true, urls: ordered };
});

ipcMain.handle("sources:test", async (_e, url) => {
  const result = await pythonSync(cliArgs(["--check-source", url, "--json-progress"]));
  const line = result.out
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim().startsWith("{"));
  if (!line) return { ok: false, error: result.err.slice(-400) };
  try {
    return { ok: true, ...JSON.parse(line) };
  } catch {
    return { ok: false, error: result.err.slice(-400) };
  }
});

/* -------------------------------------------------------------------- ui */
function readUi() {
  try {
    const data = JSON.parse(fs.readFileSync(UI_FILE, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

ipcMain.handle("ui:get", () => readUi());

ipcMain.handle("ui:set", (_e, patch = {}) => {
  if (!patch || typeof patch !== "object") return readUi();
  const next = { ...readUi(), ...patch };
  try {
    fs.writeFileSync(UI_FILE, JSON.stringify(next, null, 2), "utf8");
  } catch {}
  return next;
});

/* ------------------------------------------------------------- clipboard */
ipcMain.handle("clipboard:write", (_e, text) => {
  const value = typeof text === "string" ? text : "";
  if (!value) return { ok: false };
  clipboard.writeText(value);
  return { ok: true, length: value.length };
});

/* -------------------------------------------------------------- settings */
ipcMain.handle("settings:get", async () => readSettingsJson());

ipcMain.handle("settings:save", async (_e, data) => {
  if (!data || typeof data !== "object") return { ok: false };
  fs.writeFileSync(SETTINGS, JSON.stringify(data, null, 2), "utf8");
  const settings = await readSettingsJson();
  return { ok: true, settings };
});

ipcMain.handle("dialog:pickFolder", async (_e, current) => {  if (!win || win.isDestroyed()) return { ok: false };
  const start = typeof current === "string" && current.trim() ? current.trim() : app.getPath("documents");
  const strings = uiText();
  const result = await dialog.showOpenDialog(win, {
    title: strings.pdfFolderTitle,
    defaultPath: start,
    properties: ["openDirectory", "createDirectory"],
    buttonLabel: strings.selectFolder,
  });
  if (result.canceled || !result.filePaths?.length) return { ok: false, canceled: true };
  return { ok: true, path: result.filePaths[0] };
});

/* ---------------------------------------------------------------- schedule */
ipcMain.handle("schedule:get", async () => {
  const settings = await readSettingsJson();
  const task = await queryTask();
  return { schedule: settings?.schedule ?? null, task };
});

ipcMain.handle("schedule:apply", async (_e, payload = {}) => {
  const at = String(payload.at || "").trim();
  const enabled = payload.enabled !== false;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) {
    return { ok: false, error: "invalid-time" };
  }

  const settings = (await readSettingsJson()) || {};
  settings.schedule = { enabled, at };
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2), "utf8");

  const script = path.join(PIPE_DIR, "schedule.ps1");
  const args = [script, "-At", at, "-SettingsPath", SETTINGS];
  if (IS_PACKAGED) {
    args.push("-Exe", pythonExe(), "-DataDir", DATA);
  }
  const result = await runPowerShell(args);
  const task = await queryTask();
  return {
    ok: result.code === 0,
    output: `${result.out}\n${result.err}`.trim().slice(-600),
    task,
  };
});

ipcMain.handle("schedule:remove", async () => {
  const script = path.join(PIPE_DIR, "schedule.ps1");
  const result = await runPowerShell([script, "-Remove"]);
  const task = await queryTask();
  return { ok: result.code === 0, output: `${result.out}\n${result.err}`.trim(), task };
});

/* ------------------------------------------------------------------- misc */
ipcMain.handle("shell:openPath", (_e, p) => {
  if (typeof p === "string" && p) shell.openPath(p);
});

ipcMain.handle("shell:openExternal", (_e, url) => {
  if (typeof url === "string" && /^(mailto|tel):/i.test(url)) shell.openExternal(url);
});

ipcMain.on("ui:log", (_e, msg) => {
  try {
    fs.appendFileSync(path.join(DATA, "ui.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
});
