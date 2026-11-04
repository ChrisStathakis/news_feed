const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const { t, getLang, setLang, apply: applyI18n } = window.I18N;

window.addEventListener("error", (e) => {
  const el = document.getElementById("zoomLabel");
  if (el) el.textContent = `ERR ${e.message}`;
});
window.addEventListener("unhandledrejection", (e) => {
  const el = document.getElementById("zoomLabel");
  if (el) el.textContent = `REJ ${e.reason}`;
});

const state = {
  date: null,
  editionUrl: null,
  settings: null,
  history: [],
  running: false,
  sites: null,
  sources: [],
  weights: {},
};

let lastProgress = null;
let uiReady = false;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function showView(name) {
  $$(".nav__item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${name}`));
}

$$(".nav__item").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));

/* ------------------------------------------------------------------ reader */
const reader = $("#reader");
let zoom = 1;
let zoomMode = "fit"; // "fit" | "manual"
let editionScrollRatio = 0;
let pendingScrollRatio = null;
let restoringScroll = false;
let returningUntil = 0;

function clampZoom(value) {
  const v = Number(value);
  return Number.isFinite(v) ? Math.max(0.3, Math.min(2, v)) : 1;
}

function applyZoomState(state) {
  if (!state || (state.mode !== "fit" && state.mode !== "manual")) return false;
  zoomMode = state.mode;
  if (state.mode === "manual") zoom = clampZoom(state.value);
  return true;
}

function saveZoom() {
  const state = { mode: zoomMode, value: Number(zoom.toFixed(3)) };
  try {
    localStorage.setItem("hmerisia-zoom", JSON.stringify(state));
  } catch {}
  try {
    window.api.uiSet({ zoom: state });
  } catch {}
}

function loadZoom() {
  try {
    applyZoomState(JSON.parse(localStorage.getItem("hmerisia-zoom") || "null"));
  } catch {}
  try {
    window.api.uiGet().then((ui) => {
      if (applyZoomState(ui?.zoom)) applyStoredZoom();
    }).catch(() => {});
  } catch {}
}
loadZoom();

function applyRawZoom(value, text) {
  const js = `document.documentElement.style.zoom='${Number(value).toFixed(3)}'; true;`;
  try {
    reader.setZoomFactor(1);
    reader.executeJavaScript(js).catch(() => {});
  } catch {}
  const label = document.getElementById("zoomLabel");
  if (label) label.textContent = text;
}

function zoomLabelText() {
  return `zoom ${Math.round(zoom * 100)}%${zoomMode === "fit" ? " · fit" : ""}`;
}

function applyZoom() {
  applyRawZoom(zoom, zoomLabelText());
}

function computeFitZoom() {
  const host = document.getElementById("view-today");
  const width = (reader.getBoundingClientRect().width)
    || (host && host.clientWidth)
    || (window.innerWidth - 260);
  const pageWidth = 794 + 64; // A4 (210mm ≈ 794px) + περιθώρια σελίδας
  zoom = Math.max(0.35, Math.min(1, (width - 16) / pageWidth));
  applyZoom();
}

/** Εφαρμόζει την αποθηκευμένη κατάσταση zoom (δεν αλλάζει το mode).
 *  Σε εξωτερικό site δείχνει 100% ΧΩΡΙΣ να σβήνει το zoom του φύλλου. */
function applyStoredZoom() {
  if (currentHost()) {
    applyRawZoom(1, "zoom 100%");
    return;
  }
  if (zoomMode === "fit") computeFitZoom();
  else applyZoom();
}

function scrollToRatio(ratio, delay = 150) {
  if (!(ratio > 0) || currentHost()) return;
  const js =
    "(function(){var d=document.documentElement;var max=d.scrollHeight-window.innerHeight;" +
    `window.scrollTo(0, Math.round(${ratio}*Math.max(0,max)));return true;})()`;
  setTimeout(() => {
    try {
      reader.executeJavaScript(js).catch(() => {});
    } catch {}
  }, delay);
}

function fitZoom() {
  zoomMode = "fit";
  if (currentHost()) applyRawZoom(1, "zoom 100%");
  else computeFitZoom();
  saveZoom();
  scrollToRatio(editionScrollRatio);
}

function zoomBy(delta) {
  const keep = editionScrollRatio;
  zoomMode = "manual";
  zoom = Math.max(0.3, Math.min(2, zoom + delta));
  saveZoom();
  applyZoom();
  scrollToRatio(keep);
}

function isEditionUrl() {
  try {
    const url = reader.getURL ? reader.getURL() : "";
    return /^file:/i.test(url) && /efimerida-[\d-]+\.html/i.test(url);
  } catch {
    return false;
  }
}

const SCROLL_JS =
  "(function(){var d=document.documentElement;var max=d.scrollHeight-window.innerHeight;" +
  "return max>80?window.scrollY/max:-1;})()";

async function readScrollRatio() {
  try {
    const ratio = await reader.executeJavaScript(SCROLL_JS);
    if (typeof ratio === "number" && Number.isFinite(ratio) && ratio >= 0) {
      return Math.min(1, Math.max(0, ratio));
    }
  } catch {}
  return null;
}

let navLoading = false;

async function captureScroll() {
  // Μόνο πάνω στο φύλλο, ποτέ κατά τη διάρκεια αλλαγής σελίδας:
  // αλλιώς διαβάζουμε 0 από τη νέα σελίδα και σβήνουμε τη θέση.
  if (restoringScroll || navLoading || pendingScrollRatio !== null) return;
  if (!isEditionUrl()) return;
  const ratio = await readScrollRatio();
  if (ratio === null) return;
  // Αν στο μεταξύ άλλαξε σελίδα, πέτα το δείγμα.
  if (!isEditionUrl()) return;
  editionScrollRatio = ratio;
}
setInterval(captureScroll, 700);

reader.addEventListener("did-start-loading", () => {
  navLoading = true;
  try {
    if (/^https?:/i.test(reader.getURL() || "")) {
      externalPending = true;
      updateNav();
    }
  } catch {}
});

reader.addEventListener("did-stop-loading", () => {
  navLoading = false;
});

function restoreScrollSoon() {
  if (pendingScrollRatio === null) return;
  const ratio = pendingScrollRatio;
  restoringScroll = true;
  const js =
    "(function(){var d=document.documentElement;var max=d.scrollHeight-window.innerHeight;" +
    `window.scrollTo(0, Math.round(${ratio}*Math.max(0,max)));return true;})()`;
  const attempt = () => reader.executeJavaScript(js).catch(() => {});
  setTimeout(attempt, 400);
  setTimeout(attempt, 1400);
  setTimeout(attempt, 2300);
  setTimeout(() => {
    pendingScrollRatio = null;
    restoringScroll = false;
    editionScrollRatio = ratio;
  }, 2600);
}

reader.addEventListener("did-finish-load", () => {
  applyStoredZoom();
  setTimeout(applyStoredZoom, 250);
  restoreScrollSoon();
});
window.addEventListener("resize", () => applyStoredZoom());

$("#zoomIn").addEventListener("click", () => zoomBy(0.1));
$("#zoomOut").addEventListener("click", () => zoomBy(-0.1));
$("#zoomFit").addEventListener("click", fitZoom);

/* ------------------------------------------------------ in-app navigation */
const btnBack = $("#btnBack");
const btnHome = $("#btnHome");
const navDomain = $("#navDomain");
const copyTopBtn = $("#btnCopy");
const copyFocusBtn = $("#focusCopy");
const focusBar = $("#focusBar");
const focusDomain = $("#focusDomain");
const focusExitPin = $("#focusExitPin");
const focusHint = $("#focusHint");
const btnFullscreen = $("#btnFullscreen");

let focusMode = false;
let idleTimer = null;
let focusHintTimer = null;
let externalPending = false;

function currentHost() {
  try {
    const url = reader.getURL ? reader.getURL() : "";
    if (!url || url.startsWith("file://")) return "";
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function currentArticleUrl() {
  try {
    const url = reader.getURL ? reader.getURL() : "";
    return /^https?:/i.test(url) ? url : "";
  } catch {
    return "";
  }
}

const copyTimers = new WeakMap();

async function copyCurrentUrl(btn) {
  const url = currentArticleUrl();
  if (!url) return false;
  let ok = false;
  try {
    const res = await window.api.copyText(url);
    ok = !!res?.ok;
  } catch {}
  if (!btn) return ok;
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  clearTimeout(copyTimers.get(btn));
  btn.classList.toggle("is-copied", ok);
  const short = btn.id === "focusCopy";
  btn.textContent = ok
    ? (short ? "✓" : t("copy.copied"))
    : (short ? "✗" : t("copy.failed"));
  copyTimers.set(
    btn,
    setTimeout(() => {
      btn.classList.remove("is-copied");
      btn.textContent = btn.dataset.label;
    }, 1500)
  );
  return ok;
}

/* ------------------------------------------------------------ full screen */
function scheduleFocusIdle() {
  clearTimeout(idleTimer);
  // Πάνω σε εξωτερικό site η μπάρα μένει πάντα ορατή (το «Πίσω» πρέπει να φαίνεται).
  if (!focusMode || currentHost()) return;
  idleTimer = setTimeout(() => {
    if (focusMode && !currentHost() && !focusBar.matches(":hover")) {
      focusBar.classList.add("is-idle");
    }
  }, 2600);
}

function showFocusBar() {
  if (!focusMode) return;
  clearTimeout(idleTimer);
  focusBar.classList.remove("is-idle");
  scheduleFocusIdle();
}

function showFocusHint() {
  if (!focusHint) return;
  focusHint.hidden = false;
  clearTimeout(focusHintTimer);
  focusHintTimer = setTimeout(() => {
    focusHint.hidden = true;
  }, 4200);
}

function hideFocusHint() {
  clearTimeout(focusHintTimer);
  if (focusHint) focusHint.hidden = true;
}

function syncFocusNav(host, canBack = false) {
  focusDomain.textContent = host;
  $("#focusBack").disabled = !host && !canBack;
  if (!focusMode) return;
  if (host) {
    clearTimeout(idleTimer);
    focusBar.classList.remove("is-idle");
  } else {
    scheduleFocusIdle();
  }
}

function applyFocusUi(on) {
  focusMode = !!on;
  document.documentElement.dataset.focus = focusMode ? "on" : "off";
  focusBar.hidden = !focusMode;
  if (focusExitPin) {
    focusExitPin.hidden = !focusMode;
    focusExitPin.title = t("focus.exitTitle");
  }
  if (btnFullscreen) btnFullscreen.title = t(focusMode ? "top.exitFullTitle" : "top.fullTitle");
  if (focusMode) {
    syncFocusNav(currentHost());
    showFocusBar();
    showFocusHint();
  } else {
    clearTimeout(idleTimer);
    focusBar.classList.add("is-idle");
    hideFocusHint();
  }
  setTimeout(applyStoredZoom, 260);
}

async function setFocusMode(on) {
  applyFocusUi(on);
  try {
    const actual = await window.api.setFullscreen(!!on);
    if (typeof actual === "boolean" && actual !== focusMode) applyFocusUi(actual);
  } catch {}
}

function updateFocusTexts() {
  if (btnFullscreen) btnFullscreen.title = t(focusMode ? "top.exitFullTitle" : "top.fullTitle");
  if (focusExitPin) focusExitPin.title = t("focus.exitTitle");
  if (focusMode) showFocusHint();
}

function updateNav() {
  const host = currentHost();
  if (!host && isEditionUrl()) externalPending = false;
  navDomain.textContent = host;
  // Το «Πίσω» επιστρέφει πάντα στο φύλλο· ενεργό όταν είσαι έξω από αυτό
  // ή όταν έχει ξεκινήσει πλοήγηση προς άρθρο (πριν προλάβει να φορτώσει).
  // Αν υπάρχει φύλλο, μένει πάντα πατήσιμο — ώστε να μη «χάνεται» το κλικ.
  btnBack.disabled = !host && !externalPending && !state.editionUrl;
  syncFocusNav(host, externalPending || !!state.editionUrl);
  // «Αντιγραφή URL» μόνο πάνω σε εξωτερικό άρθρο — κρύβεται μέσα στο φύλλο.
  const articleUrl = currentArticleUrl();
  for (const el of [copyTopBtn, copyFocusBtn]) {
    if (!el) continue;
    el.hidden = !articleUrl;
    el.disabled = !articleUrl;
  }
  // Οι εξωτερικές σελίδες εμφανίζονται στο 100%· το φύλλο παίρνει το δικό του zoom.
  try {
    if (host) {
      applyRawZoom(1, "zoom 100%");
    } else {
      applyStoredZoom();
    }
  } catch {}
}

["did-navigate", "did-navigate-in-page", "did-start-loading", "did-stop-loading", "dom-ready"].forEach(
  (evt) => reader.addEventListener(evt, updateNav)
);

reader.addEventListener("will-navigate", (event) => {
  const url = event.url || "";
  if (/^https?:/i.test(url)) {
    externalPending = true;
    setTimeout(updateNav, 0);
  }
  if (!/^(https?|file):/i.test(url)) {
    event.preventDefault();
    window.api.openUrlExternal(url);
  }
});

function backToEdition() {
  // Ποτέ δεν γυρίζει σε προηγούμενη εξωτερική σελίδα — πάντα στο φύλλο,
  // στην ίδια θέση ανάγνωσης που άφησες.
  if (!state.date) return;
  returningUntil = Date.now() + 4000;
  try {
    reader.stop();
  } catch {}
  openEdition(state.date, { scroll: editionScrollRatio });
}

function navigateTo(url) {
  try {
    const current = reader.getURL ? reader.getURL() : "";
    if (current && !/^about:/i.test(current)) reader.loadURL(url);
    else reader.setAttribute("src", url);
  } catch {
    try {
      reader.setAttribute("src", url);
    } catch {}
  }
}

// Αν το άρθρο προλάβει να φορτώσει πριν/κατά το «Πίσω», ξαναφόρτωσε το φύλλο.
reader.addEventListener("did-stop-loading", () => {
  if (Date.now() > returningUntil || !state.editionUrl) return;
  const url = reader.getURL ? reader.getURL() : "";
  if (url && !/^file:/i.test(url)) {
    navigateTo(state.editionUrl);
  }
});

btnBack.addEventListener("click", backToEdition);
copyTopBtn.addEventListener("click", () => copyCurrentUrl(copyTopBtn));
copyFocusBtn.addEventListener("click", () => copyCurrentUrl(copyFocusBtn));
window.api.onCopyRequest?.(() => copyCurrentUrl(currentArticleUrl() ? copyTopBtn : null));
btnHome.addEventListener("click", backToEdition);
$("#focusBack").addEventListener("click", backToEdition);
$("#focusHome").addEventListener("click", backToEdition);

btnFullscreen.addEventListener("click", () => setFocusMode(!focusMode));
$("#focusExit").addEventListener("click", () => setFocusMode(false));
focusExitPin?.addEventListener("click", () => setFocusMode(false));
$("#focusZoomIn").addEventListener("click", () => zoomBy(0.1));
$("#focusZoomOut").addEventListener("click", () => zoomBy(-0.1));
$("#focusFit").addEventListener("click", fitZoom);
$("#focusPrint").addEventListener("click", printCurrent);
$("#btnPrint").addEventListener("click", printCurrent);

focusBar.addEventListener("mouseenter", () => {
  clearTimeout(idleTimer);
  focusBar.classList.remove("is-idle");
});
focusBar.addEventListener("mouseleave", scheduleFocusIdle);
$("#focusHotzone").addEventListener("mousemove", showFocusBar);

document.addEventListener("mousemove", () => showFocusBar());

window.addEventListener("keydown", (e) => {
  if (e.key === "F11") {
    e.preventDefault();
    setFocusMode(!focusMode);
    return;
  }
  if (e.key === "Escape" && focusMode) {
    e.preventDefault();
    setFocusMode(false);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "p") {
    e.preventDefault();
    printCurrent();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && String(e.key).toLowerCase() === "c") {
    // Μόνο όταν διαβάζεις άρθρο· αλλιώς αφήνει το κανονικό Ctrl+C.
    if (currentArticleUrl()) {
      e.preventDefault();
      copyCurrentUrl(focusMode ? copyFocusBtn : copyTopBtn);
    }
  }
});

window.api.onFullscreenChanged?.((on) => {
  if (!!on !== focusMode) applyFocusUi(on);
});

/* ---------------------------------------------------------------- print */
async function printCurrent() {
  let id = null;
  try {
    id = reader.getWebContentsId();
  } catch {}
  if (!id) return;

  $("#progress").hidden = false;
  $("#progressFill").style.width = "30%";
  $("#progressLabel").textContent = t("progress.printPreparing");

  // Παράγεται πρώτα σωστό PDF και ανοίγει σε προεπισκόπηση με τον viewer.
  const res = await window.api.printPreview({ webContentsId: id, date: state.date });
  $("#progressFill").style.width = "100%";
  $("#progressLabel").textContent = res?.ok
    ? t("progress.printReady")
    : t("progress.printFail", { error: res?.error || t("common.unknown") });
  setTimeout(() => ($("#progress").hidden = true), res?.ok ? 6000 : 5000);
}

window.api.onPrintRequest?.(() => printCurrent());

async function openEdition(date, opts = {}) {
  const url = await window.api.editionUrl(date);
  if (!url) return false;
  state.date = date;
  state.editionUrl = url;
  pendingScrollRatio =
    typeof opts.scroll === "number" && Number.isFinite(opts.scroll)
      ? Math.min(1, Math.max(0, opts.scroll))
      : null;
  if (pendingScrollRatio !== null) {
    restoringScroll = true;
    setTimeout(() => {
      if (pendingScrollRatio !== null) {
        pendingScrollRatio = null;
        restoringScroll = false;
      }
    }, 6000);
  }
  navigateTo(url);
  if (pendingScrollRatio !== null) {
    // Αν η πλοήγηση προς άρθρο κέρδισε, ξαναφόρτωσε το φύλλο.
    setTimeout(() => {
      try {
        const current = reader.getURL ? reader.getURL() : "";
        if (current && !/^file:/i.test(current)) navigateTo(url);
      } catch {}
    }, 900);
  }
  setTimeout(applyStoredZoom, 900);
  $("#todayEmpty").hidden = true;
  if (focusMode) showFocusBar();
  renderEditionMeta();
  return true;
}

function renderEditionMeta() {
  const entry = state.history.find((h) => h.date === state.date);
  $("#editionMeta").textContent = entry
    ? t("meta.edition", {
        items: entry.items ?? "—",
        coverage: entry.coverage ?? "—",
        pages: entry.pages ?? "—",
      })
    : "";
}

/* ------------------------------------------------------------------- run */
function setProgress(stage, pct, extra = {}) {
  lastProgress = { stage, pct, extra };
  $("#progress").hidden = false;
  $("#progressFill").style.width = `${Math.max(2, pct)}%`;
  const key = `stage.${stage}`;
  const translated = t(key);
  const label = translated === key ? stage : translated;
  const bits = [label];
  if (extra.items) bits.push(t("progress.items", { n: extra.items }));
  if (extra.filtered_ads) bits.push(t("progress.ads", { n: extra.filtered_ads }));
  if (extra.fallback) bits.push(t("progress.fallback", { n: extra.fallback }));
  if (extra.images) bits.push(t("progress.images", { n: extra.images }));
  $("#progressLabel").textContent = bits.join(" · ");
}

function renderRunButton() {
  const btn = $("#btnRun");
  if (btn) btn.textContent = t(state.running ? "top.processing" : "top.newEdition");
  const stop = $("#btnStop");
  if (stop) stop.textContent = t("progress.stop");
}

async function startRun() {
  if (state.running) return;
  state.running = true;
  $("#btnRun").disabled = true;
  $("#btnRun").textContent = t("top.processing");
  const stop = $("#btnStop");
  if (stop) {
    stop.hidden = false;
    stop.disabled = false;
    stop.textContent = t("progress.stop");
  }
  setProgress("start", 2, {});
  const res = await window.api.run({});
  if (!res.ok) {
    state.running = false;
    $("#btnRun").disabled = false;
    $("#btnRun").textContent = t("top.newEdition");
    $("#progressLabel").textContent = res.error === "running"
      ? t("progress.alreadyRunning")
      : t("progress.startFailed");
    if (stop) stop.hidden = true;
  }
}

window.api.onRunEvent((evt) => setProgress(evt.stage, evt.pct || 0, evt));
window.api.onRunLog((line) => {
  if (line && line.trim()) $("#progressLabel").textContent = line.trim().slice(0, 140);
});
window.api.onRunEnd(async ({ code, stopped }) => {
  state.running = false;
  $("#btnRun").disabled = false;
  $("#btnRun").textContent = t("top.newEdition");
  const stop = $("#btnStop");
  if (stop) {
    stop.hidden = true;
    stop.disabled = false;
    stop.textContent = t("progress.stop");
  }
  $("#progressFill").style.width = "100%";
  $("#progressLabel").textContent = stopped
    ? t("progress.stopped")
    : code === 0
      ? t("progress.done")
      : t("progress.failed", { code });
  setTimeout(() => ($("#progress").hidden = true), stopped ? 3500 : 2500);
  await refreshHistory();
  await refreshSources();
  if (code === 0 && !stopped) await openEdition(todayISO());
});

$("#btnStop")?.addEventListener("click", async () => {
  const stop = $("#btnStop");
  if (!state.running || !stop) return;
  stop.disabled = true;
  stop.textContent = t("progress.stopping");
  $("#progressLabel").textContent = t("progress.stopRequested");
  const res = await window.api.stopRun();
  if (!res?.killed && !res?.scheduled) {
    stop.disabled = false;
    stop.textContent = t("progress.stop");
    $("#progressLabel").textContent = t("progress.noRun");
  }
});

$("#btnRun").addEventListener("click", startRun);

$("#btnBrowser").addEventListener("click", () => {
  if (state.date) window.api.openExternal(state.date);
});

$("#btnExport").addEventListener("click", async () => {
  if (!state.date) return;
  $("#btnExport").disabled = true;
  $("#progress").hidden = false;
  $("#progressFill").style.width = "60%";
  $("#progressLabel").textContent = t("progress.pdfExporting");
  const res = await window.api.exportPdf(state.date);
  $("#btnExport").disabled = false;
  $("#progressFill").style.width = "100%";
  $("#progressLabel").textContent = res.ok
    ? t("progress.pdfDone", { path: res.pdf })
    : t("progress.pdfFail", { error: res.error || "" });
  setTimeout(() => ($("#progress").hidden = true), 3000);
});

/* ---------------------------------------------------------------- history */
async function refreshHistory() {
  state.history = await window.api.history();
  renderHistory();
}

function renderHistory() {
  const list = $("#historyList");
  list.innerHTML = "";
  for (const entry of state.history) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <button class="card__del" title="${t("history.deleteTitle")}">×</button>
      <div class="card__date">${entry.date}</div>
      <div class="card__meta">
        ${t("history.cardLine1", { items: entry.items ?? "—", pages: entry.pages ?? "—" })}<br>
        ${t("history.cardLine2", { coverage: entry.coverage ?? "—", ads: entry.quality?.ads_removed ?? 0 })}
      </div>`;
    card.addEventListener("click", async () => {
      await openEdition(entry.date);
      showView("today");
    });
    card.querySelector(".card__del").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(t("history.confirmDelete", { date: entry.date }))) return;
      const res = await window.api.deleteEdition(entry.date);
      if (res.history) {
        state.history = res.history;
        renderHistory();
      }
    });
    list.appendChild(card);
  }
  if (!state.history.length) list.innerHTML = `<p class="hint">${t("history.empty")}</p>`;
}

/* ---------------------------------------------------------------- sources */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function statusLabel(status) {
  const key = `status.${status || "unknown"}`;
  const value = t(key);
  return value === key ? (status || "—") : value;
}

function sourceWeight(value) {
  return Math.max(0.3, Math.min(2, Number(value) || 1));
}

function sourcePages(weight) {
  return Math.max(1, Math.min(4, Math.round(sourceWeight(weight))));
}

function setSourceHint(text) {
  const el = $("#sourceHint");
  if (!el) return;
  el.textContent = text;
  clearTimeout(setSourceHint.timer);
  setSourceHint.timer = setTimeout(() => { el.textContent = ""; }, 4200);
}

function setSectionsHint(text) {
  const el = $("#sectionsHint");
  if (!el) return;
  el.textContent = text;
  clearTimeout(setSectionsHint.timer);
  setSectionsHint.timer = setTimeout(() => { el.textContent = ""; }, 4200);
}

async function refreshSources() {
  const sources = await window.api.sources();
  const settings = await window.api.settings();
  state.sources = sources;
  // Κρατά το state.settings συγχρονισμένο με ό,τι γράφτηκε απευθείας
  // από Πηγές (weights / sources_disabled), ώστε το Save να μην τα σβήσει.
  if (settings) state.settings = settings;
  state.weights = settings?.weights || {};
  state.sites = sources.length;
  renderSiteCount();
  renderSourcesTable();
  renderSectionList();
}

async function applySourceOrder(urls) {
  const res = await window.api.reorderSources(urls);
  if (!res?.ok) {
    setSectionsHint(t("settings.orderError"));
    return;
  }
  await refreshSources();
  setSectionsHint(t("settings.orderSaved"));
}

async function reorderSource(fromUrl, toUrl) {
  const urls = state.sources.map((s) => s.url);
  const from = urls.indexOf(fromUrl);
  const to = urls.indexOf(toUrl);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = urls.splice(from, 1);
  urls.splice(to, 0, moved);
  await applySourceOrder(urls);
}

async function moveSource(url, delta) {
  const urls = state.sources.map((s) => s.url);
  const from = urls.indexOf(url);
  const to = Math.max(0, Math.min(urls.length - 1, from + delta));
  if (from < 0 || from === to) return;
  const [moved] = urls.splice(from, 1);
  urls.splice(to, 0, moved);
  await applySourceOrder(urls);
}

function attachSourceDrag(container) {
  let dragUrl = null;
  container.querySelectorAll("[data-drag-url]").forEach((row) => {
    const handle = row.querySelector(".drag");
    if (!handle) return;
    handle.setAttribute("draggable", "true");
    handle.addEventListener("dragstart", (e) => {
      dragUrl = row.dataset.dragUrl;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragUrl);
      row.classList.add("is-dragging");
    });
    handle.addEventListener("dragend", () => {
      dragUrl = null;
      container.querySelectorAll(".is-dragging,.drop-target")
        .forEach((el) => el.classList.remove("is-dragging", "drop-target"));
    });
    row.addEventListener("dragover", (e) => {
      if (!dragUrl || row.dataset.dragUrl === dragUrl) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      row.classList.remove("drop-target");
      const target = row.dataset.dragUrl;
      if (!dragUrl || !target || dragUrl === target) return;
      await reorderSource(dragUrl, target);
    });
  });
}

function bindSourceActions(container) {
  container.querySelectorAll(".sactive").forEach((cb) =>
    cb.addEventListener("change", async () => {
      cb.disabled = true;
      const res = await window.api.toggleSource({ url: cb.dataset.url, active: cb.checked });
      cb.disabled = false;
      if (!res?.ok) {
        cb.checked = !cb.checked;
        return;
      }
      const hint = container.id === "sectionList" ? setSectionsHint : setSourceHint;
      hint(cb.checked ? t("sources.enabled") : t("sources.disabled"));
      await refreshSources();
    })
  );

  container.querySelectorAll(".winput").forEach((input) =>
    input.addEventListener("change", async () => {
      const key = input.dataset.key;
      const value = sourceWeight(input.value);
      input.value = value.toFixed(1);
      await window.api.setWeight(key, value);
      await refreshSources();
    })
  );

  container.querySelectorAll("[data-move]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await moveSource(btn.dataset.url, Number(btn.dataset.move) || 0);
    })
  );

  container.querySelectorAll("[data-test]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      b.textContent = "…";
      const res = await window.api.testSource(b.dataset.test);
      b.disabled = false;
      b.textContent = res.ok ? `${res.items} ✓` : t("sources.testFail");
      if (res.ok) setTimeout(refreshSources, 1200);
    })
  );

  container.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", async () => {
      await window.api.removeSource(b.dataset.remove);
      await refreshSources();
    })
  );
}

function renderSourcesTable() {
  const table = $("#sourceList");
  if (!table) return;
  table.innerHTML = `
    <div class="trow trow--head">
      <span></span><span></span><span>${t("sources.col.on")}</span><span>${t("sources.col.source")}</span><span>${t("sources.col.status")}</span><span>${t("sources.col.items")}</span><span>${t("sources.col.method")}</span><span>${t("sources.col.weight")}</span><span></span>
    </div>`;

  for (const s of state.sources) {
    const row = document.createElement("div");
    row.className = "trow";
    if (s.active === false) row.classList.add("is-off");
    row.dataset.dragUrl = s.url;
    const weight = sourceWeight(
      state.weights[s.key] ?? state.weights[s.name] ?? state.weights[s.host] ?? 1
    );
    row.innerHTML = `
      <span class="drag" title="${t("sources.reorderTitle")}">⠿</span>
      <span class="dot dot--${s.status || "unknown"}"></span>
      <span><input class="sactive" type="checkbox" data-url="${esc(s.url)}" ${s.active === false ? "" : "checked"}
                   title="${t("sources.activeTitle")}"></span>
      <span class="trow__url" title="${esc(s.url)}">
        <span class="trow__name">${esc(s.name || s.host)}</span>
        <span class="trow__host">${esc(s.url)}</span>
      </span>
      <span>${s.status ? statusLabel(s.status) : "—"}</span>
      <span>${s.items ?? "—"}</span>
      <span>${esc(s.method || "—")}</span>
      <span><input class="winput" type="number" min="0.3" max="2" step="0.1" value="${weight.toFixed(1)}"
                   data-key="${esc(s.key)}" title="${t("sources.weightTitle")}"></span>
      <span class="trow__actions"><button class="tbtn" data-test="${esc(s.url)}">${t("common.test")}</button>
            <button class="tbtn" data-remove="${esc(s.url)}">×</button></span>`;
    table.appendChild(row);
  }

  bindSourceActions(table);
  attachSourceDrag(table);
}

function renderSectionList() {
  const box = $("#sectionList");
  if (!box) return;
  if (!state.sources.length) {
    box.innerHTML = `<p class="hint">${t("settings.sourcesEmpty")}</p>`;
    return;
  }

  box.innerHTML = `
    <div class="section-row section-row--head">
      <span></span><span>${t("sources.col.on")}</span><span>${t("sources.col.source")}</span><span>${t("settings.sourceItems")}</span><span>${t("settings.sourceWeight")}</span><span>${t("settings.sourcePages")}</span><span></span>
    </div>`;

  for (const s of state.sources) {
    const row = document.createElement("div");
    row.className = "section-row";
    if (s.active === false) row.classList.add("is-off");
    row.dataset.dragUrl = s.url;
    const weight = sourceWeight(
      state.weights[s.key] ?? state.weights[s.name] ?? state.weights[s.host] ?? 1
    );
    const pages = sourcePages(weight);
    row.innerHTML = `
      <span class="drag" title="${t("sources.reorderTitle")}">⠿</span>
      <span><input class="sactive" type="checkbox" data-url="${esc(s.url)}" ${s.active === false ? "" : "checked"}
                   title="${t("sources.activeTitle")}"></span>
      <span class="section-row__name" title="${esc(s.url)}">
        <span>${esc(s.name || s.host)}</span>
        <small>${esc(s.url)}</small>
      </span>
      <span class="section-row__items">${s.items ?? "—"}</span>
      <span><input class="winput" type="number" min="0.3" max="2" step="0.1" value="${weight.toFixed(1)}"
                   data-key="${esc(s.key)}" title="${t("sources.weightTitle")}"></span>
      <span class="pages-badge" title="${t("settings.sourcePagesHint")}">${t("sources.pagesShort", { n: pages })}</span>
      <span class="section-row__move">
        <button type="button" class="tbtn" data-move="-1" data-url="${esc(s.url)}" title="${t("settings.moveUp")}">↑</button>
        <button type="button" class="tbtn" data-move="1" data-url="${esc(s.url)}" title="${t("settings.moveDown")}">↓</button>
      </span>`;
    box.appendChild(row);
  }

  bindSourceActions(box);
  attachSourceDrag(box);
}

$("#btnManageSources")?.addEventListener("click", () => showView("sources"));

$("#addSourceForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#newSource");
  const res = await window.api.addSource(input.value);
  if (!res.ok) {
    input.setCustomValidity(res.error === "duplicate" ? t("sources.duplicate") : t("sources.invalid"));
    input.reportValidity();
    input.setCustomValidity("");
    return;
  }
  input.value = "";
  await refreshSources();
});

/* --------------------------------------------------------------- settings */
function setPath(obj, path, value) {
  const parts = path.split(".");
  let node = obj;
  for (const p of parts.slice(0, -1)) node = node[p];
  node[parts[parts.length - 1]] = value;
}

function getPath(obj, path) {
  return path.split(".").reduce((n, p) => (n == null ? n : n[p]), obj);
}

async function loadSettings() {
  const data = await window.api.settings();
  if (!data) return;
  state.settings = data;
  state.weights = data.weights || {};

  const form = $("#settingsForm");
  ["edition.name", "edition.name_en", "limits.lead", "limits.featured", "limits.story",
   "limits.brief", "limits.video", "theme.paper", "theme.ink", "theme.accent",
   "theme.preset", "theme.photos", "theme.font_scale", "runtime.python"].forEach((path) => {
    const el = form.querySelector(`[name="${path}"]`);
    if (el) el.value = getPath(data, path) ?? "";
  });
  const fs = form.querySelector('[name="theme.font_scale"]');
  if (fs) $("#fsValue").textContent = Number(fs.value || 1).toFixed(2);
  const pdf = form.querySelector('[name="runtime.pdf"]');
  if (pdf) pdf.checked = !!getPath(data, "runtime.pdf");

  const pdfDir = form.querySelector('[name="runtime.pdf_dir"]');
  if (pdfDir) pdfDir.value = getPath(data, "runtime.pdf_dir") || "";

  const translateEnglish = form.querySelector('[name="language.translate_english"]');
  if (translateEnglish) translateEnglish.checked = !!getPath(data, "language.translate_english");

  const trendsEnabled = form.querySelector('[name="trends.enabled"]');
  if (trendsEnabled) {
    const tr = data.trends || {};
    trendsEnabled.checked = tr.enabled !== false;
    const country = form.querySelector('[name="trends.country"]');
    if (country) country.value = String(tr.country || "GR").toUpperCase();
    const perPage = form.querySelector('[name="trends.per_page"]');
    if (perPage) perPage.value = Number(tr.per_page || 10);
  }

  const schedEnabled = form.querySelector('[name="schedule.enabled"]');
  if (schedEnabled) schedEnabled.checked = data.schedule ? data.schedule.enabled !== false : true;
  const schedAt = form.querySelector('[name="schedule.at"]');
  if (schedAt) schedAt.value = data.schedule?.at || "07:00";

  renderSectionList();
}

$("#settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = JSON.parse(JSON.stringify(state.settings));
  ["edition.name", "edition.name_en", "limits.lead", "limits.featured", "limits.story",
   "limits.brief", "limits.video", "theme.paper", "theme.ink", "theme.accent",
   "theme.preset", "theme.photos", "theme.font_scale", "runtime.python"].forEach((path) => {
    const el = form.querySelector(`[name="${path}"]`);
    if (!el) return;
    const value = (el.type === "number" || el.type === "range") ? Number(el.value) : el.value;
    setPath(data, path, value);
  });
  data.runtime.pdf = form.querySelector('[name="runtime.pdf"]').checked;
  data.runtime.pdf_dir = form.querySelector('[name="runtime.pdf_dir"]').value.trim();
  data.language = data.language || {};
  data.language.translate_english = form.querySelector('[name="language.translate_english"]').checked;
  data.schedule = data.schedule || {};
  data.schedule.enabled = form.querySelector('[name="schedule.enabled"]').checked;
  data.schedule.at = form.querySelector('[name="schedule.at"]').value || "07:00";

  data.trends = data.trends || {};
  data.trends.enabled = form.querySelector('[name="trends.enabled"]').checked;
  data.trends.country = form.querySelector('[name="trends.country"]').value || "GR";
  data.trends.per_page = Math.max(5, Math.min(12, Number(form.querySelector('[name="trends.per_page"]').value) || 10));

  // Οι ενότητες είναι πλέον πηγές· το παλιό κλειδί φεύγει από το settings.json.
  delete data.sections;

  const res = await window.api.saveSettings(data);
  $("#saveHint").textContent = res.ok ? t("settings.saved") : t("settings.saveError");
  if (res.ok && res.settings) state.settings = res.settings;
  setTimeout(() => ($("#saveHint").textContent = ""), 4000);
});

$("#btnPdfDir")?.addEventListener("click", async () => {
  const input = document.querySelector('[name="runtime.pdf_dir"]');
  const res = await window.api.pickFolder(input?.value || "");
  if (res?.ok && input) {
    input.value = res.path;
    $("#saveHint").textContent = t("settings.pressSave");
    setTimeout(() => ($("#saveHint").textContent = ""), 5000);
  }
});

$("#btnPdfDirClear")?.addEventListener("click", () => {
  const input = document.querySelector('[name="runtime.pdf_dir"]');
  if (input) input.value = "";
  $("#saveHint").textContent = t("settings.resetHint");
  setTimeout(() => ($("#saveHint").textContent = ""), 5000);
});

/* -------------------------------------------------------------- schedule */
async function refreshSchedule() {
  const hint = $("#scheduleHint");
  if (!hint) return;
  const res = await window.api.scheduleGet();
  if (!res) return;
  hint.textContent = res.task?.exists
    ? t("schedule.task", { state: res.task.state, next: res.task.next || "—" })
    : t("schedule.none");
}

$("#btnSchedule")?.addEventListener("click", async () => {
  const form = $("#settingsForm");
  const at = form.querySelector('[name="schedule.at"]').value;
  const enabled = form.querySelector('[name="schedule.enabled"]').checked;
  const hint = $("#scheduleHint");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) {
    hint.textContent = t("settings.invalidTime");
    return;
  }
  hint.textContent = t("settings.applying");
  const res = await window.api.scheduleApply({ at, enabled });
  if (!res.ok) {
    hint.textContent = t("settings.applyFail", { error: res.error || (res.output || "").slice(-120) });
  } else {
    const task = res.task?.exists
      ? `${res.task.state} · ${t("schedule.next")} ${res.task.next}`
      : t("settings.noTask");
    hint.textContent = t("settings.applied", { task });
  }
  setTimeout(refreshSchedule, 2000);
});

$("#btnScheduleRemove")?.addEventListener("click", async () => {
  const hint = $("#scheduleHint");
  hint.textContent = t("settings.disabling");
  const res = await window.api.scheduleRemove();
  hint.textContent = res.ok ? t("settings.disabled") : t("settings.disableFail");
  setTimeout(refreshSchedule, 1500);
});

/* --------------------------------------------------------------- cleanup */
const cleanupModal = $("#cleanupModal");
let cleanupPlan = null;

async function refreshCleanupPreview() {
  const keep = Number($("#keepDays").value || 7);
  const cache = $("#cleanCache").checked;
  const box = $("#cleanupPreview");
  cleanupPlan = null;
  updateCleanupButton();
  box.textContent = t("cleanup.calculating");
  const plan = await window.api.cleanupPreview({ keepDays: keep, cache });
  if (!plan.ok) {
    box.textContent = t("cleanup.error", { error: plan.error || t("common.unknown") });
    cleanupPlan = null;
    updateCleanupButton();
    return;
  }
  cleanupPlan = plan;
  const lines = [t("cleanup.summary", {
    editions: plan.editions.length,
    mb: plan.total_mb,
    cache: cache ? t("cleanup.cacheYes") : t("cleanup.cacheNo"),
  })];
  for (const e of plan.editions) lines.push(`  ${e.date}  ${e.mb} MB`);
  if (plan.cache?.length) for (const c of plan.cache) lines.push(`  cache/${c.name}  ${c.mb} MB`);
  if (plan.pdfs?.length) {
    lines.push(`  ${t("cleanup.pdfHeader", { dir: plan.pdf_dir || t("cleanup.pdfDirFallback") })}`);
    for (const p of plan.pdfs) lines.push(`    efimerida-${p.date}.pdf  ${p.mb} MB`);
  }
  box.textContent = lines.join("\n");
  updateCleanupButton();
}

function updateCleanupButton() {
  const editions = cleanupPlan?.editions?.length || 0;
  const pdfs = cleanupPlan?.pdfs?.length || 0;
  const caches = cleanupPlan?.cache?.length || 0;
  const btn = $("#cleanupRun");
  if (!btn) return;
  btn.disabled = editions + pdfs + caches === 0;

  const bits = [];
  if (editions) bits.push(editions === 1 ? t("cleanup.editionsOne") : t("cleanup.editionsMany", { n: editions }));
  if (pdfs) bits.push(t("cleanup.pdfs", { n: pdfs }));
  if (caches) bits.push(t("cleanup.caches", { n: caches }));
  btn.textContent = bits.length ? t("cleanup.delete", { what: bits.join(" + ") }) : t("cleanup.none");
}

$("#btnCleanup")?.addEventListener("click", () => {
  cleanupModal.hidden = false;
  refreshCleanupPreview();
});
$("#cleanupCancel")?.addEventListener("click", () => { cleanupModal.hidden = true; });
$("#keepDays")?.addEventListener("change", refreshCleanupPreview);
$("#cleanCache")?.addEventListener("change", refreshCleanupPreview);
$("#cleanupRun")?.addEventListener("click", async () => {
  if (!cleanupPlan) return;
  $("#cleanupRun").disabled = true;
  $("#cleanupRun").textContent = t("cleanup.deleting");
  const res = await window.api.cleanupRun({
    keepDays: Number($("#keepDays").value || 7),
    cache: $("#cleanCache").checked,
  });
  cleanupModal.hidden = true;
  if (res.history) {
    state.history = res.history;
    renderHistory();
  } else {
    await refreshHistory();
  }
  $("#progress").hidden = false;
  $("#progressFill").style.width = "100%";
  $("#progressLabel").textContent = res.ok
    ? t("progress.cleanupDone", { editions: res.editions || 0, pdfs: res.pdfs || 0, mb: res.mb || 0 })
    : t("progress.cleanupFail", { error: res.error || t("common.unknown") });
  setTimeout(() => ($("#progress").hidden = true), res.ok ? 5000 : 8000);
  refreshCleanupPreview();
});

/* ------------------------------------------------------------ app theme */
const themeToggle = $("#themeToggle");
const langToggle = $("#langToggle");

function updateThemeToggle() {
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  if (themeToggle) themeToggle.textContent = t(theme === "dark" ? "theme.toLight" : "theme.toDark");
}

function applyAppTheme(theme) {
  document.documentElement.dataset.theme = theme;
  updateThemeToggle();
  try {
    localStorage.setItem("hmerisia-theme", theme);
  } catch {}
}

themeToggle?.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyAppTheme(current);
});

function updateLangToggle() {
  if (!langToggle) return;
  const lang = getLang();
  langToggle.textContent = t(lang === "en" ? "lang.switchToEl" : "lang.switchToEn");
  langToggle.title = t("lang.title");
}

function updateCopyLabels() {
  if (copyTopBtn) {
    copyTopBtn.dataset.label = t("top.copy");
    copyTopBtn.textContent = t("top.copy");
  }
  if (copyFocusBtn) {
    copyFocusBtn.dataset.label = "🔗";
    copyFocusBtn.textContent = "🔗";
  }
}

function renderTodayLabel() {
  const locale = getLang() === "el" ? "el-GR" : "en-GB";
  $("#todayLabel").textContent = new Date().toLocaleDateString(locale, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function renderSiteCount() {
  if (state.sites == null) return;
  $("#siteCount").textContent = t("rail.sources", { n: state.sites });
}

function applyLanguage(lang, opts = {}) {
  const next = setLang(lang);
  applyI18n();
  updateLangToggle();
  updateThemeToggle();
  renderTodayLabel();
  renderSiteCount();
  const sourceHint = $("#sourceHint");
  if (sourceHint) sourceHint.textContent = "";
  const saveHint = $("#saveHint");
  if (saveHint) saveHint.textContent = "";
  renderEditionMeta();
  renderRunButton();
  updateCopyLabels();
  updateFocusTexts();

  if (uiReady) {
    if (state.history.length) renderHistory();
    refreshSources();
    refreshSchedule();
    if (state.running && lastProgress && !$("#progress").hidden) {
      setProgress(lastProgress.stage, lastProgress.pct, lastProgress.extra);
    }
    if (cleanupModal && !cleanupModal.hidden) refreshCleanupPreview();
  }

  if (opts.persist !== false) {
    try {
      localStorage.setItem("hmerisia-lang", next);
    } catch {}
    try {
      window.api.uiSet({ lang: next });
    } catch {}
  }
}

langToggle?.addEventListener("click", () => {
  applyLanguage(getLang() === "en" ? "el" : "en");
});

const fsRange = document.querySelector('[name="theme.font_scale"]');
fsRange?.addEventListener("input", () => {
  const label = $("#fsValue");
  if (label) label.textContent = Number(fsRange.value).toFixed(2);
});

/* ------------------------------------------------------------------- init */
(async function init() {
  applyLanguage(localStorage.getItem("hmerisia-lang") || "en", { persist: false });
  applyAppTheme(document.documentElement.dataset.theme || "dark");

  const info = await window.api.info();
  state.sites = info.sites;
  $("#pyInfo").textContent = `python: ${info.python}`;
  renderSiteCount();
  renderTodayLabel();

  await refreshHistory();
  await refreshSources();
  await loadSettings();
  await refreshSchedule();
  uiReady = true;

  try {
    const ui = await window.api.uiGet();
    if (ui?.lang && ui.lang !== getLang()) applyLanguage(ui.lang, { persist: false });
  } catch {}

  const today = todayISO();
  if (state.history.some((h) => h.date === today)) {
    await openEdition(today);
  } else if (state.history.length) {
    await openEdition(state.history[0].date);
  }
})();
