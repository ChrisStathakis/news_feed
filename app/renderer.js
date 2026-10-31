const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

window.addEventListener("error", (e) => {
  const el = document.getElementById("zoomLabel");
  if (el) el.textContent = `ERR ${e.message}`;
});
window.addEventListener("unhandledrejection", (e) => {
  const el = document.getElementById("zoomLabel");
  if (el) el.textContent = `REJ ${e.reason}`;
});

const STAGES = {
  start: "Έναρξη",
  collect: "Συλλογή πηγών",
  plan: "Σελιδοποίηση",
  articles: "Άρθρα",
  translate: "Μετάφραση",
  images: "Εικόνες",
  render: "Σύνθεση",
  pdf: "Εξαγωγή PDF",
  done: "Ολοκληρώθηκε",
  check: "Έλεγχος πηγής",
};

const state = {
  date: null,
  editionUrl: null,
  settings: null,
  history: [],
  running: false,
};

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
const btnFullscreen = $("#btnFullscreen");

let focusMode = false;
let idleTimer = null;
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
  btn.textContent = ok ? (btn.id === "focusCopy" ? "✓" : "✓ Αντιγράφηκε") : "✗ Αποτυχία";
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
  if (btnFullscreen) btnFullscreen.title = focusMode ? "Έξοδος (Esc)" : "Πλήρης οθόνη (F11)";
  if (focusMode) {
    syncFocusNav(currentHost());
    showFocusBar();
  } else {
    clearTimeout(idleTimer);
    focusBar.classList.add("is-idle");
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
  $("#progressLabel").textContent = "Προετοιμασία εκτύπωσης…";

  // Παράγεται πρώτα σωστό PDF και ανοίγει σε προεπισκόπηση με τον viewer.
  const res = await window.api.printPreview({ webContentsId: id, date: state.date });
  $("#progressFill").style.width = "100%";
  $("#progressLabel").textContent = res?.ok
    ? "Άνοιξε η προεπισκόπηση — πάτησε το εικονίδιο εκτυπωτή πάνω δεξιά."
    : `Αποτυχία εκτύπωσης: ${res?.error || "άγνωστο"}`;
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
  const entry = state.history.find((h) => h.date === date);
  $("#editionMeta").textContent = entry
    ? `${entry.items ?? "—"} θέματα · ${entry.coverage ?? "—"}% φωτογραφίες · ${entry.pages ?? "—"} σελ.`
    : "";
  return true;
}

/* ------------------------------------------------------------------- run */
function setProgress(stage, pct, extra = {}) {
  $("#progress").hidden = false;
  $("#progressFill").style.width = `${Math.max(2, pct)}%`;
  const label = STAGES[stage] || stage;
  const bits = [label];
  if (extra.items) bits.push(`${extra.items} θέματα`);
  if (extra.filtered_ads) bits.push(`${extra.filtered_ads} διαφημίσεις εκτός`);
  if (extra.fallback) bits.push(`${extra.fallback} στο πρωτότυπο`);
  if (extra.images) bits.push(`${extra.images} φωτογραφίες`);
  $("#progressLabel").textContent = bits.join(" · ");
}

async function startRun() {
  if (state.running) return;
  state.running = true;
  $("#btnRun").disabled = true;
  $("#btnRun").textContent = "Επεξεργασία…";
  const stop = $("#btnStop");
  if (stop) {
    stop.hidden = false;
    stop.disabled = false;
    stop.textContent = "■ Στοπ";
  }
  setProgress("start", 2, {});
  const res = await window.api.run({});
  if (!res.ok) {
    state.running = false;
    $("#btnRun").disabled = false;
    $("#btnRun").textContent = "Νέο φύλλο";
    $("#progressLabel").textContent = res.error === "running" ? "Εκτελείται ήδη…" : "Σφάλμα εκκίνησης";
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
  $("#btnRun").textContent = "Νέο φύλλο";
  const stop = $("#btnStop");
  if (stop) {
    stop.hidden = true;
    stop.disabled = false;
    stop.textContent = "■ Στοπ";
  }
  $("#progressFill").style.width = "100%";
  $("#progressLabel").textContent = stopped
    ? "Η έκδοση σταμάτησε."
    : code === 0
      ? "Ολοκληρώθηκε"
      : `Αποτυχία (κωδικός ${code})`;
  setTimeout(() => ($("#progress").hidden = true), stopped ? 3500 : 2500);
  await refreshHistory();
  if (code === 0 && !stopped) await openEdition(todayISO());
});

$("#btnStop")?.addEventListener("click", async () => {
  const stop = $("#btnStop");
  if (!state.running || !stop) return;
  stop.disabled = true;
  stop.textContent = "Διακοπή…";
  $("#progressLabel").textContent = "Διακοπή έκδοσης…";
  const res = await window.api.stopRun();
  if (!res?.killed && !res?.scheduled) {
    stop.disabled = false;
    stop.textContent = "■ Στοπ";
    $("#progressLabel").textContent = "Δεν βρέθηκε ενεργή έκδοση.";
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
  $("#progressLabel").textContent = "Εξαγωγή PDF…";
  const res = await window.api.exportPdf(state.date);
  $("#btnExport").disabled = false;
  $("#progressFill").style.width = "100%";
  $("#progressLabel").textContent = res.ok ? `PDF: ${res.pdf}` : `Αποτυχία PDF: ${res.error || ""}`;
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
      <button class="card__del" title="Διαγραφή φύλλου">×</button>
      <div class="card__date">${entry.date}</div>
      <div class="card__meta">
        ${entry.items ?? "—"} θέματα · ${entry.pages ?? "—"} σελίδες<br>
        ${entry.coverage ?? "—"}% φωτογραφίες · ${entry.quality?.ads_removed ?? 0} ads εκτός
      </div>`;
    card.addEventListener("click", async () => {
      await openEdition(entry.date);
      showView("today");
    });
    card.querySelector(".card__del").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Διαγραφή του φύλλου ${entry.date};`)) return;
      const res = await window.api.deleteEdition(entry.date);
      if (res.history) {
        state.history = res.history;
        renderHistory();
      }
    });
    list.appendChild(card);
  }
  if (!state.history.length) list.innerHTML = `<p class="hint">Κανένα φύλλο ακόμη.</p>`;
}

/* ---------------------------------------------------------------- sources */
async function refreshSources() {
  const sources = await window.api.sources();
  const settings = await window.api.settings();
  const weights = settings?.weights || {};
  const table = $("#sourceList");
  table.innerHTML = `
    <div class="trow trow--head">
      <span></span><span>On</span><span>Πηγή</span><span>Κατάσταση</span><span>Θέματα</span><span>Μέθοδος</span><span>Βάρος</span><span></span>
    </div>`;

  for (const s of sources) {
    const row = document.createElement("div");
    row.className = "trow";
    if (s.active === false) row.classList.add("is-off");
    const weight = weights[s.host] ?? 1;
    row.innerHTML = `
      <span class="dot dot--${s.status || "unknown"}"></span>
      <span><input class="sactive" type="checkbox" data-url="${s.url}" ${s.active === false ? "" : "checked"}
                   title="Ενεργή πηγή — αν το κλείσεις, δεν τρέχει στο επόμενο φύλλο"></span>
      <span class="trow__url" title="${s.url}">${s.url}</span>
      <span>${s.status || "—"}</span>
      <span>${s.items ?? "—"}</span>
      <span>${s.method || "—"}</span>
      <span><input class="winput" type="number" min="0.3" max="2" step="0.1" value="${weight}"
                   data-host="${s.host}" title="Βάρος πηγής (0.3–2.0)"></span>
      <span><button class="tbtn" data-test="${s.url}">Δοκιμή</button>
            <button class="tbtn" data-remove="${s.url}">×</button></span>`;
    table.appendChild(row);
  }

  table.querySelectorAll(".sactive").forEach((cb) =>
    cb.addEventListener("change", async () => {
      cb.disabled = true;
      const res = await window.api.toggleSource({ url: cb.dataset.url, active: cb.checked });
      cb.disabled = false;
      if (res?.ok) cb.closest(".trow")?.classList.toggle("is-off", !cb.checked);
      else cb.checked = !cb.checked;
      $("#sourceHint") && ($("#sourceHint").textContent = cb.checked
        ? "Η πηγή ενεργοποιήθηκε — ισχύει στο επόμενο φύλλο."
        : "Η πηγή απενεργοποιήθηκε — δεν θα τρέξει στο επόμενο φύλλο.");
    })
  );

  table.querySelectorAll(".winput").forEach((input) =>
    input.addEventListener("change", async () => {
      const value = Math.max(0.3, Math.min(2, Number(input.value) || 1));
      input.value = value.toFixed(1);
      await window.api.setWeight(input.dataset.host, value);
    })
  );

  table.querySelectorAll("[data-test]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      b.textContent = "…";
      const res = await window.api.testSource(b.dataset.test);
      b.disabled = false;
      b.textContent = res.ok ? `${res.items} ✓` : "αποτυχία";
      if (res.ok) setTimeout(refreshSources, 1200);
    })
  );

  table.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", async () => {
      await window.api.removeSource(b.dataset.remove);
      await refreshSources();
    })
  );
}

$("#addSourceForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#newSource");
  const res = await window.api.addSource(input.value);
  if (!res.ok) {
    input.setCustomValidity(res.error === "duplicate" ? "Υπάρχει ήδη" : "Μη έγκυρο URL");
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
    const t = data.trends || {};
    trendsEnabled.checked = t.enabled !== false;
    const country = form.querySelector('[name="trends.country"]');
    if (country) country.value = String(t.country || "GR").toUpperCase();
    const perPage = form.querySelector('[name="trends.per_page"]');
    if (perPage) perPage.value = Number(t.per_page || 10);
  }

  const schedEnabled = form.querySelector('[name="schedule.enabled"]');
  if (schedEnabled) schedEnabled.checked = data.schedule ? data.schedule.enabled !== false : true;
  const schedAt = form.querySelector('[name="schedule.at"]');
  if (schedAt) schedAt.value = data.schedule?.at || "07:00";

  const box = $("#sectionPages");
  box.innerHTML = "";
  for (const section of data.sections || []) {
    const label = document.createElement("label");
    label.textContent = section.el;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "6";
    input.value = section.pages;
    input.dataset.key = section.key;
    label.appendChild(input);
    box.appendChild(label);
  }
}

$("#settingsForm").addEventListener("submit", async (e) => {  e.preventDefault();
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

  form.querySelectorAll("#sectionPages input").forEach((input) => {
    const section = data.sections.find((s) => s.key === input.dataset.key);
    if (section) section.pages = Number(input.value);
  });

  const res = await window.api.saveSettings(data);
  $("#saveHint").textContent = res.ok ? "Αποθηκεύτηκε — εφαρμόζεται στο επόμενο φύλλο." : "Σφάλμα αποθήκευσης.";
  if (res.ok && res.settings) state.settings = res.settings;
  setTimeout(() => ($("#saveHint").textContent = ""), 4000);
});

$("#btnPdfDir")?.addEventListener("click", async () => {
  const input = document.querySelector('[name="runtime.pdf_dir"]');
  const res = await window.api.pickFolder(input?.value || "");
  if (res?.ok && input) {
    input.value = res.path;
    $("#saveHint").textContent = "Πάτησε «Αποθήκευση» για να ισχύσει.";
    setTimeout(() => ($("#saveHint").textContent = ""), 5000);
  }
});

$("#btnPdfDirClear")?.addEventListener("click", () => {
  const input = document.querySelector('[name="runtime.pdf_dir"]');
  if (input) input.value = "";
  $("#saveHint").textContent = "Επαναφορά στην προεπιλογή — πάτησε «Αποθήκευση».";
  setTimeout(() => ($("#saveHint").textContent = ""), 5000);
});

/* -------------------------------------------------------------- schedule */
async function refreshSchedule() {
  const hint = $("#scheduleHint");
  if (!hint) return;
  const res = await window.api.scheduleGet();
  if (!res) return;
  hint.textContent = res.task?.exists
    ? `HmerisiaDaily · ${res.task.state} · επόμενη ${res.task.next || "—"}`
    : "Δεν υπάρχει προγραμματισμένη εργασία.";
}

$("#btnSchedule")?.addEventListener("click", async () => {
  const form = $("#settingsForm");
  const at = form.querySelector('[name="schedule.at"]').value;
  const enabled = form.querySelector('[name="schedule.enabled"]').checked;
  const hint = $("#scheduleHint");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) {
    hint.textContent = "Δώσε ώρα σε μορφή HH:mm (π.χ. 07:00).";
    return;
  }
  hint.textContent = "Εφαρμογή στο Windows…";
  const res = await window.api.scheduleApply({ at, enabled });
  hint.textContent = res.ok
    ? `Αποθηκεύτηκε · ${res.task?.exists ? `${res.task.state} · επόμενη ${res.task.next}` : "χωρίς εργασία"}`
    : `Αποτυχία: ${res.error || (res.output || "").slice(-120)}`;
  setTimeout(refreshSchedule, 2000);
});

$("#btnScheduleRemove")?.addEventListener("click", async () => {
  const hint = $("#scheduleHint");
  hint.textContent = "Απενεργοποίηση…";
  const res = await window.api.scheduleRemove();
  hint.textContent = res.ok ? "Η αυτόματη έκδοση απενεργοποιήθηκε." : "Αποτυχία απενεργοποίησης.";
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
  box.textContent = "Υπολογισμός…";
  const plan = await window.api.cleanupPreview({ keepDays: keep, cache });
  if (!plan.ok) {
    box.textContent = `Σφάλμα: ${plan.error || "άγνωστο"}`;
    cleanupPlan = null;
    updateCleanupButton();
    return;
  }
  cleanupPlan = plan;
  const lines = [`${plan.editions.length} φύλλα · ${plan.total_mb} MB · cache ${cache ? "ναι" : "όχι"}`];
  for (const e of plan.editions) lines.push(`  ${e.date}  ${e.mb} MB`);
  if (plan.cache?.length) for (const c of plan.cache) lines.push(`  cache/${c.name}  ${c.mb} MB`);
  if (plan.pdfs?.length) {
    lines.push(`  PDF (${plan.pdf_dir || "φάκελος PDF"}):`);
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
  if (editions) bits.push(`${editions} ${editions === 1 ? "φύλλο" : "φύλλα"}`);
  if (pdfs) bits.push(`${pdfs} PDF`);
  if (caches) bits.push(`${caches} cache`);
  btn.textContent = bits.length ? `Διαγραφή ${bits.join(" + ")}` : "Τίποτα για διαγραφή";
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
  $("#cleanupRun").textContent = "Διαγραφή…";
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
    ? `Διαγράφηκαν ${res.editions || 0} φύλλα · ${res.pdfs || 0} PDF · ${res.mb || 0} MB`
    : `Η διαγραφή απέτυχε: ${res.error || "άγνωστο"}`;
  setTimeout(() => ($("#progress").hidden = true), res.ok ? 5000 : 8000);
  refreshCleanupPreview();
});

/* ------------------------------------------------------------ app theme */
const themeToggle = $("#themeToggle");

function applyAppTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeToggle) {
    themeToggle.textContent = theme === "dark" ? "☀ Φωτεινό θέμα" : "☾ Σκούρο θέμα";
  }
  try {
    localStorage.setItem("hmerisia-theme", theme);
  } catch {}
}

themeToggle?.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyAppTheme(current);
});
applyAppTheme(document.documentElement.dataset.theme || "dark");

const fsRange = document.querySelector('[name="theme.font_scale"]');
fsRange?.addEventListener("input", () => {
  const label = $("#fsValue");
  if (label) label.textContent = Number(fsRange.value).toFixed(2);
});

/* ------------------------------------------------------------------- init */(async function init() {
  const info = await window.api.info();
  $("#pyInfo").textContent = `python: ${info.python}`;
  $("#siteCount").textContent = `${info.sites} πηγές`;
  $("#todayLabel").textContent = new Date().toLocaleDateString("el-GR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  await refreshHistory();
  await refreshSources();
  await loadSettings();
  await refreshSchedule();

  const today = todayISO();
  if (state.history.some((h) => h.date === today)) {
    await openEdition(today);
  } else if (state.history.length) {
    await openEdition(state.history[0].date);
  }
})();
