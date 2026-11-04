/*
 * Capture fresh screenshots from the desktop app for the social campaign.
 * Usage: node social/tools/capture.js
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const APP = path.join(ROOT, "app");
const ELECTRON = path.join(APP, "node_modules", "electron", "dist", "electron.exe");
const OUT = path.join(ROOT, "social", "2026-11-01", "source");
const PROFILE = path.join(ROOT, "social", ".capture-profile");
const UI_FILE = path.join(ROOT, "ui.json");
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function waitForPage(timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && /index\.html/.test(t.url));
      if (page) return page;
    } catch {}
    await sleep(500);
  }
  throw new Error("Timed out waiting for the app page");
}

async function targets() {
  try {
    return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  } catch {
    return [];
  }
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  return { ws, send, evaluate };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  const originalUi = readJson(UI_FILE);

  const child = spawn(
    ELECTRON,
    [".", `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, "--force-device-scale-factor=1"],
    { cwd: APP, windowsHide: false }
  );

  let pageClient = null;
  try {
    const page = await waitForPage();
    pageClient = await connect(page);
    const { send, evaluate } = pageClient;

    // Wait for the app shell and data.
    for (let i = 0; i < 40; i++) {
      const ready = await evaluate("document.querySelectorAll('.nav__item').length === 4 && !!window.I18N");
      if (ready) break;
      await sleep(250);
    }
    // Wait until the dynamic views (settings/sections/sources) have been rendered.
    for (let i = 0; i < 60; i++) {
      const ready = await evaluate(
        "document.querySelectorAll('#sourceList .trow').length > 1 && document.querySelectorAll('#sectionPages label').length > 0"
      );
      if (ready) break;
      await sleep(400);
    }
    await sleep(600);

    const shot = async (name) => {
      await evaluate("window.scrollTo(0,0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; true");
      await sleep(120);
      const r = await send("Page.captureScreenshot", { format: "png" });
      const file = path.join(OUT, name);
      fs.writeFileSync(file, Buffer.from(r.data, "base64"));
      console.log("saved", file);
      return file;
    };

    // Greek UI, light theme.
    let lang = await evaluate("document.documentElement.lang");
    if (lang !== "el") {
      await evaluate("document.querySelector('#langToggle').click(); true");
      await sleep(700);
    }
    // Force the dynamic panels to re-render in the selected language.
    await evaluate("(async () => { await refreshSources(); renderSectionPages(); renderHistory(); refreshSchedule(); return true; })()");
    await sleep(900);
    let theme = await evaluate("document.documentElement.dataset.theme");
    if (theme !== "light") {
      await evaluate("document.querySelector('#themeToggle').click(); true");
      await sleep(500);
    }

    // Today / newspaper.
    await evaluate("document.querySelector('[data-view=\"today\"]').click(); document.querySelector('#progress').hidden = true; true");
    await sleep(1400);
    await shot("today-light.png");

    // The webview newspaper, captured separately.
    try {
      const wsTarget = (await targets()).find((t) => t.type === "webview");
      if (wsTarget) {
        const wc = await connect(wsTarget);
        await wc.send("Page.enable");
        const metrics = await wc.send("Page.getLayoutMetrics");
        const size = metrics.cssContentSize || metrics.contentSize;
        const width = Math.max(1, Math.round(size.width));
        const height = Math.max(1, Math.min(2200, Math.round(size.height)));
        const r = await wc.send("Page.captureScreenshot", { format: "png" });
        const file = path.join(OUT, "newspaper-view.png");
        fs.writeFileSync(file, Buffer.from(r.data, "base64"));
        console.log("saved", file, `${width}x${height}`);
        wc.ws.close();
      }
    } catch (err) {
      console.log("webview capture skipped:", err.message);
    }

    // Sources.
    await evaluate("document.querySelector('[data-view=\"sources\"]').click(); document.querySelector('#view-sources .panel').scrollTop = 0; true");
    await sleep(600);
    await shot("sources-light.png");

    // Settings (top fields).
    await evaluate("document.querySelector('[data-view=\"settings\"]').click(); document.querySelector('#view-settings .panel').scrollTop = 0; true");
    await sleep(500);
    await shot("settings-light.png");

    // Settings (language section).
    await evaluate("document.querySelector('[name=\"language.translate_english\"]').scrollIntoView({ block: 'center' }); true");
    await sleep(350);
    await shot("language-light.png");

    // Simulated progress state (uses the real progress UI).
    await evaluate(`(() => {
      document.documentElement.dataset.focus = 'off';
      document.querySelector('[data-view="today"]').click();
      document.querySelector('#progress').hidden = false;
      document.querySelector('#progressFill').style.width = '64%';
      document.querySelector('#progressLabel').textContent = 'Σελιδοποίηση · 48 θέματα · 32 φωτογραφίες';
      const stop = document.querySelector('#btnStop');
      if (stop) stop.hidden = false;
      return true;
    })()`);
    await sleep(500);
    await shot("progress-light.png");
    await evaluate("document.querySelector('#progress').hidden = true; true");

    // Dark theme for the light/dark contrast.
    if (await evaluate("document.documentElement.dataset.theme") !== "dark") {
      await evaluate("document.querySelector('#themeToggle').click(); true");
      await sleep(400);
    }
    await evaluate("document.querySelector('[data-view=\"today\"]').click(); document.querySelector('#progress').hidden = true; true");
    await sleep(800);
    await shot("today-dark.png");
    await evaluate("document.querySelector('[data-view=\"settings\"]').click(); document.querySelector('#view-settings .panel').scrollTop = 0; true");
    await sleep(400);
    await shot("settings-dark.png");

    // Fullscreen UI with the persistent exit button (visual state, no native resize).
    if (await evaluate("document.documentElement.dataset.theme") !== "light") {
      await evaluate("document.querySelector('#themeToggle').click(); true");
      await sleep(350);
    }
    await evaluate(`(() => {
      document.querySelector('[data-view="today"]').click();
      document.documentElement.dataset.focus = 'on';
      const bar = document.querySelector('#focusBar');
      bar.hidden = false;
      bar.classList.remove('is-idle');
      document.querySelector('#focusExitPin').hidden = false;
      document.querySelector('#focusHint').hidden = true;
      document.querySelector('#focusDomain').textContent = '';
      return true;
    })()`);
    await sleep(900);
    await shot("fullscreen-light.png");
    await evaluate(`(() => {
      document.documentElement.dataset.focus = 'off';
      document.querySelector('#focusBar').hidden = true;
      document.querySelector('#focusExitPin').hidden = true;
      document.querySelector('#focusHint').hidden = true;
      return true;
    })()`);
    await sleep(500);

    // Restore the app language to whatever it was.
    const originalLang = originalUi && originalUi.lang === "el" ? "el" : "en";
    const currentLang = await evaluate("document.documentElement.lang");
    if (currentLang !== originalLang) {
      await evaluate("document.querySelector('#langToggle').click(); true");
      await sleep(400);
    }
  } finally {
    try {
      pageClient?.ws.close();
    } catch {}
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    } catch {}
    // Restore ui.json exactly as it was before capture.
    try {
      if (originalUi) fs.writeFileSync(UI_FILE, JSON.stringify(originalUi, null, 2), "utf8");
    } catch {}
    await sleep(500);
    fs.rmSync(PROFILE, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
