/**
 * HTML renderer, ported 1:1 from newspaper/templates/newspaper.html.j2.
 * Jinja macros become plain functions; every interpolated value is escaped.
 */

import { NEWSPAPER_CSS } from "./styles";
import type { DisplayItem, EditionPayload } from "./payload";
import { truncateWords } from "./payload";
import type { Settings } from "../types";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;

function compass(): string {
  return `<svg class="compass" viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="1"/>
  <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" stroke-width=".5" stroke-dasharray="1 3"/>
  <path d="M50 14 L56 50 L50 86 L44 50 Z" fill="currentColor" opacity=".75"/>
  <path d="M14 50 L50 44 L86 50 L50 56 Z" fill="currentColor" opacity=".25"/>
  <text x="50" y="10" text-anchor="middle" class="compass__n">N</text>
</svg>`;
}

function mapCard(p: EditionPayload): string {
  return `<div class="card map-card">
  <div class="card__label">Ο ΧΑΡΤΗΣ ΤΗΣ ΗΜΕΡΑΣ</div>
  <svg class="map" viewBox="0 0 240 150" aria-hidden="true">
    <defs>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0 L0 0 0 20" fill="none" stroke="currentColor" stroke-width=".35" opacity=".45"/>
      </pattern>
    </defs>
    <rect width="240" height="150" fill="url(#grid)" opacity=".9"/>
    <path d="M18 96 C48 78 62 100 86 88 C110 76 118 92 140 84 C165 75 178 92 204 78"
          fill="none" stroke="currentColor" stroke-width=".8" stroke-dasharray="3 2" opacity=".7"/>
    <circle cx="86" cy="88" r="2.6" fill="currentColor"/>
    <circle cx="170" cy="80" r="2.6" fill="currentColor"/>
    <path d="M86 88 L170 80" stroke="currentColor" stroke-width=".6" opacity=".5"/>
    <text x="92" y="84" class="map__pin">ΑΘΗΝΑ</text>
    <text x="176" y="76" class="map__pin">ΒΡΥΞΕΛΛΕΣ</text>
    <g opacity=".5" transform="translate(198,112) scale(.42)">
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor"/>
      <path d="M50 14 L56 50 L50 86 L44 50 Z" fill="currentColor"/>
    </g>
  </svg>
  <div class="map-card__foot">
    <span>${e(p.date_caps)}</span>
    <span class="map-card__ref">ΧΑΡΤΗΣ 1:1.000.000</span>
  </div>
</div>`;
}

function plate(label = "ΑΡΧΕΙΟΝ", hint = "ΦΩΤΟΓΡΑΦΙΑ ΔΙΑΘΕΣΙΜΗ ΣΤΗΝ ΠΗΓΗ"): string {
  return `<div class="plate">
  <div class="plate__inner">
    ${compass()}
    <div class="plate__label">${e(label)}</div>
    <div class="plate__hint">${e(hint)}</div>
  </div>
</div>`;
}

function orig(item: DisplayItem, cls = ""): string {
  return item.title_en ? `<div class="orig ${e(cls)}">${e(item.title_en)}</div>` : "";
}

function badge(item: DisplayItem): string {
  return item.badge ? `<span class="badge">${e(item.badge)}</span>` : "";
}

function byline(item: DisplayItem): string {
  return `<div class="byline">
  <span class="byline__src">${e(item.source_name)}</span>
  <span>${e(item.local_time)}</span>
  ${item.source_count > 1 ? `<span class="byline__more">+${item.source_count - 1} πηγή</span>` : ""}
  ${badge(item)}
</div>`;
}

function sectionHead(p: EditionPayload["pages"][number], p2: EditionPayload, kind = ""): string {
  const long = p.label_el.length > 18 ? " section-title--long" : "";
  const en = p.label_en && p.label_en !== p.label_el ? `<span>/ ${e(p.label_en)}</span>` : "";
  return `<header class="section-head ${e(kind)}">
  <div class="section-head__brand">
    <span class="section-head__paper">${e(p2.edition_name)}</span>
    <span class="section-head__date">${e(p2.date_short)}</span>
  </div>
  <h2 class="section-title${long}">${e(p.label_el)}${en}</h2>
  <div class="section-head__page">ΣΕΛ. ${p.num}<em>/${p2.total_pages}</em></div>
</header>`;
}

function sectionRule(p: EditionPayload["pages"][number], total: number): string {
  return `<div class="section-rule">
  <span class="section-rule__name">${e(p.label_el)}</span>
  <span class="section-rule__cont">ΣΥΝΕΧΕΙΑ ΑΠΟ ΣΕΛ. ${p.num - p.section_page + 1}</span>
  <span class="section-rule__page">${p.num}/${total}</span>
</div>`;
}

function foot(p: EditionPayload, left = ""): string {
  return `<footer class="page-foot">
  <span>${e(p.edition_name)} · ${e(p.date_short)}</span>
  <span>${e(left)}</span>
  <span>ΦΥΛΛΟ ${p.issue}</span>
</footer>`;
}

function storyCard(it: DisplayItem, cls = ""): string {
  const media = it.img
    ? `<img src="${e(it.img)}" alt="${e(it.title_el)}">`
    : `<div class="story-card__plate"><span>ΑΡΧΕΙΟΝ</span><small>${e(it.source_name)}</small></div>`;
  const paragraphs = it.body.slice(0, 2).map((p) => `<p>${e(truncateWords(p, 34))}</p>`).join("");
  const more = !it.body.length
    ? `<p class="story-card__more"><a href="${e(it.url)}">Πλήρες ρεπορτάζ: ${e(it.source_name)} →</a></p>`
    : "";
  return `<article class="story-card ${e(cls)}">
  <div class="story-card__media">${media}</div>
  <div class="kicker">${e(it.local_time)} · ${e(it.source_name)} ${badge(it)}</div>
  <h3 class="story-card__title"><a href="${e(it.url)}">${e(it.title_el)}</a></h3>
  ${orig(it, "orig--sm")}
  ${paragraphs}${more}
</article>`;
}

function videoCard(v: DisplayItem): string {
  const media = v.img
    ? `<img src="${e(v.img)}" alt="${e(v.title_el)}">`
    : plate("ΒΙΝΤΕΟ", "ΔΙΑΘΕΣΙΜΟ ΣΤΟ ΚΑΝΑΛΙ");
  const paragraphs = v.body.slice(0, 3).map((p) => `<p>${e(truncateWords(p, 42))}</p>`).join("");
  const qrSrc = v.qr ? (String(v.qr).startsWith("data:") ? String(v.qr) : `assets/qr/${v.qr}`) : "";
  return `<article class="video-card">
  <div class="story-card__media video-card__media">
    ${media}
    <span class="video-card__play">▶</span>
  </div>
  <div class="kicker">${e(v.local_time)} · ${e(v.channel || v.source_name)} ${badge(v)}</div>
  <h3 class="story-card__title story-card__title--video"><a href="${e(v.url)}">${e(v.title_el)}</a></h3>
  ${orig(v, "orig--sm")}
  ${paragraphs}
  <div class="video-card__foot">
    <span class="video-card__link">youtube.com/watch?v=${e(v.video_id || "")}</span>
    ${qrSrc ? `<img class="qr" src="${e(qrSrc)}" alt="QR">` : ""}
  </div>
</article>`;
}

function themeCss(settings: Settings): string {
  const map: Record<string, string> = {
    paper: "--paper",
    paper_deep: "--paper-deep",
    ink: "--ink",
    ink_soft: "--ink-soft",
    accent: "--red",
    navy: "--navy",
    serif: "--serif",
    mono: "--mono",
  };
  const overrides = Object.entries(settings.theme)
    .filter(([key, value]) => key in map && value)
    .map(([key, value]) => `${map[key]}:${value}`);
  const scale = Math.max(0.85, Math.min(1.25, Number(settings.theme.font_scale) || 1));
  overrides.push(`--fs:${scale}`);
  return `${NEWSPAPER_CSS}\n:root{${overrides.join(";")}}\n`;
}

export function renderEdition(p: EditionPayload, settings: Settings): string {
  const numbers = p.numbers as Record<string, unknown>;
  const stats = p.stats as Record<string, unknown>;
  const firstPages = p.pages.filter((page) => page.kind === "first");
  const gridPages = p.pages.filter((page) => page.kind === "grid");
  const videoPages = p.pages.filter((page) => page.kind === "video");

  const trends = p.trends.map((t) => `<section class="page page--trends">
  <header class="trends-head">
    <div class="trends-head__top">
      <span class="trends-kicker">GOOGLE TRENDS · ΤΕΛΕΥΤΑΙΕΣ 24 ΩΡΕΣ</span>
      <span class="trends-head__page">ΣΕΛ. ${t.num}<em>/${p.total_pages}</em></span>
    </div>
    <h1 class="trends-title">ΔΗΜΟΦΙΛΕΙΣ<br>ΑΝΑΖΗΤΗΣΕΙΣ</h1>
    <div class="trends-scope">
      <span class="trends-scope__label">${e(t.scope_el)}</span>
      <span class="trends-scope__meta">24ΩΡΟ · ${t.rows.length} ΚΟΡΥΦΑΙΟΙ ΟΡΟΙ</span>
    </div>
  </header>
  <ol class="trends-list">
    ${t.rows.map((it) => `<li class="trend${it.image ? " trend--img" : ""}">
      <span class="trend__rank">${it.rank}</span>
      <div class="trend__body">
        <h3 class="trend__term">${e(it.term)}</h3>
        <div class="trend__meta">
          ${it.traffic ? `<b>${e(it.traffic)}</b> αναζητήσεις` : ""}${it.time ? ` · ${e(it.time)}` : ""}${it.source ? ` · ${e(it.source)}` : ""}
        </div>
        ${it.headline ? `<a class="trend__link" href="${e(it.headline_url)}">${e(it.headline)}</a>` : ""}
      </div>
      ${it.image ? `<img class="trend__img" src="${e(it.image)}" alt="">` : ""}
    </li>`).join("")}
  </ol>
  ${foot(p, `${t.scope_el} · GOOGLE TRENDS`)}
</section>`).join("");

  const cover = p.lead
    ? `<h1 class="cover-title">${e(p.lead.title_el)}</h1>
    ${orig(p.lead, "cover-title-en")}
    <p class="cover-stand">${p.lead.body.length ? e(truncateWords(p.lead.body[0], 30)) : ""}</p>`
    : `<h1 class="cover-title">Το φύλλο της ημέρας</h1>
    <p class="cover-stand">Δεν κατέστη δυνατή η συλλογή ειδήσεων για σήμερα.</p>`;

  const leadMedia = p.lead
    ? (p.lead.img_large || p.lead.img
      ? `<figure class="figure"><img src="${e(p.lead.img_large || p.lead.img)}" alt="${e(p.lead.title_el)}"></figure>`
      : plate()) +
      `<div class="figure__cap figure__cap--lead"><b>Φωτογραφία: ${e(p.lead.source_name)}</b> · ${e(p.date_long)}</div>`
    : "";

  return `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(p.edition_name)} — ${e(p.date_short)}</title>
<style>${themeCss(settings)}</style>
</head>
<body class="theme-${e(p.theme_preset)}${p.fs_large ? " fs-large" : ""}">
${trends}
<section class="page page--cover">
  <div class="topbar">
    <div class="topbar__cell">
      <small>ΤΜΗΜΑ ΣΥΝΤΑΞΗΣ</small>
      <b>ΓΡΑΦΕΙΟ ΕΚΔΟΣΗΣ</b>
      <small>ΑΘΗΝΑ · ${p.year}</small>
    </div>
    <div class="topbar__cell topbar__cell--center">
      <div class="masthead">${e(p.edition_name)}</div>
      <div class="masthead__sub">${e(p.edition_name_en)} · ΑΝΕΞΑΡΤΗΤΗ ΕΚΔΟΣΗ</div>
    </div>
    <div class="topbar__cell topbar__cell--right">
      <small>ΑΡ. ΦΥΛΛΟΥ</small>
      <b>${p.issue}</b>
      <small>${e(p.date_short)}</small>
    </div>
  </div>

  <nav class="nav">
    <span class="nav__item nav__item--active">ΠΡΩΤΗ ΣΕΛΙΔΑ</span>
    ${p.sections.map((s) => `<span class="nav__item">${e(s.el)}</span>`).join("")}
    <span class="nav__item nav__item--end">ΣΥΝΤΟΜΑ</span>
  </nav>

  <header class="cover-head">
    <div class="date-line"><span>${e(p.date_long)}</span><em>ΕΚΔΟΣΗ ${e(p.generated)}</em></div>
    ${cover}
  </header>

  <div class="cover-grid">
    <aside class="cover-col cover-col--left">
      ${mapCard(p)}
      <div class="card time-card">
        <div class="card__label">ΩΡΑ ΕΚΔΟΣΗΣ</div>
        <div class="time-card__time">${e(p.generated)}</div>
        <div class="time-card__meta">${e(p.date_long)}</div>
      </div>
      <div class="card order-card">
        <div class="card__label">ΕΝΤΟΛΗ ΣΥΝΤΑΞΗΣ</div>
        <p>Το φύλλο συντάσσεται αυτόματα από ${e(stats.sources_ok ?? numbers.sources ?? 0)} ενεργές πηγές. Κάθε θέμα φέρει την προέλευσή του.</p>
        <div class="order-card__rows">
          <div><span>Θέματα</span><b>${e(numbers.total ?? 0)}</b></div>
          <div><span>Σελίδες</span><b>${p.total_pages}</b></div>
          <div><span>Μέση βαρύτητα</span><b>${e(numbers.avg_score ?? 0)}</b></div>
        </div>
      </div>
    </aside>

    <div class="cover-col cover-col--center">
      ${leadMedia}
      <div class="secondary">
        ${p.secondary.map((s) => `<article class="sec-story">
          <div class="kicker">${e(s.local_time)} · ${e(s.source_name)} ${badge(s)}</div>
          <h3><a href="${e(s.url)}">${e(s.title_el)}</a></h3>
          ${orig(s)}
          ${s.body.length ? `<p>${e(truncateWords(s.body[0], 26))}</p>` : ""}
        </article>`).join("")}
      </div>
    </div>

    <aside class="cover-col cover-col--right">
      <div class="file-card">
        <div class="file-card__head">
          <span>ΦΑΚΕΛΟΣ</span>
          <span>${e(p.month_short)} ${p.day_num} ${p.year}</span>
        </div>
        ${p.lead ? `<div class="file-card__title">${e(truncateWords(p.lead.title_el, 9))}</div>
        <div class="file-card__score"><span>ΒΑΡΥΤΗΤΑ</span><b>${e(p.lead.score)}</b></div>
        <div class="file-card__sources">${p.lead.source_names.map((name) => `<span>${e(name)}</span>`).join("")}</div>
        <a class="file-card__open" href="${e(p.lead.url)}">ΑΝΟΙΞΕ ΤΟ ΑΡΧΕΙΟ →</a>` : ""}
        <div class="file-card__index">
          <div class="file-card__index-title">ΕΝΤΟΣ ΤΟΥ ΦΥΛΛΟΥ</div>
          ${p.sections.map((s) => `<div class="file-card__row"><span>${e(s.el)}</span><b>${s.num}</b></div>`).join("")}
          <div class="file-card__row"><span>ΣΥΝΤΟΜΑ &amp; ΠΗΓΕΣ</span><b>${p.briefs_page}</b></div>
        </div>
      </div>

      <div class="stamp stamp--double">ΕΛΗΦΘΗ<br>${e(p.date_short)}<br>ΠΡΩΤΗ ΕΚΔΟΣΗ</div>

      <div class="card notes-card">
        <div class="card__label">ΕΠΙ ΣΤΟΙΧΕΙΟΥ</div>
        <ul class="notes">
          ${p.today_items.slice(0, 3).map((t) => `<li><span>${e(t.local_time)}</span>${e(truncateWords(t.title_el, 11))}</li>`).join("")}
        </ul>
      </div>
    </aside>
  </div>

  <div class="today-strip">
    <div class="today-strip__label">ΣΗΜΕΡΑ</div>
    <div class="today-strip__items">
      ${p.today_items.map((t) => `<div class="today-item">
        <span class="today-item__time">${e(t.local_time)}</span>
        <span class="today-item__title">${e(truncateWords(t.title_el, 9))}</span>
      </div>`).join("")}
    </div>
  </div>
  ${foot(p, "ΠΡΩΤΗ ΣΕΛΙΔΑ")}
</section>

${firstPages.map((page) => `<section class="page page--section">
  ${sectionHead(page, p)}
  ${page.empty
    ? `<div class="empty">${plate("ΧΩΡΙΣ ΚΑΤΑΧΩΡΗΣΗ")}<h3>Δεν υπάρχουν σημερινές ειδήσεις σε αυτή την ενότητα</h3><p>Η ενότητα διατηρείται σταθερή. Μόλις οι πηγές επιστρέψουν περιεχόμενο, η σελίδα συμπληρώνεται αυτόματα.</p></div>`
    : `${page.featured ? `<div class="lead-story">
    <div class="lead-story__media">
      ${page.featured.img_large || page.featured.img ? `<img src="${e(page.featured.img_large || page.featured.img)}" alt="${e(page.featured.title_el)}">` : plate()}
      <div class="lead-story__cap">${e(page.featured.source_name)} · ${e(page.featured.local_time)}</div>
    </div>
    <div class="lead-story__text">
      <h1 class="sec-headline"><a href="${e(page.featured.url)}">${e(page.featured.title_el)}</a></h1>
      ${orig(page.featured)}
      ${page.featured.body.slice(0, 5).map((par) => `<p class="sec-lead">${e(par)}</p>`).join("")}
      ${!page.featured.body.length ? `<p class="sec-lead">${e(page.featured.summary)}</p>` : ""}
      ${byline(page.featured)}
    </div>
  </div>` : ""}
  ${page.stories.length ? `<div class="section-grid section-grid--first">${page.stories.slice(0, 7).map((it) => storyCard(it)).join("")}</div>` : ""}`}
  ${foot(p, page.label_el)}
</section>`).join("")}

${gridPages.map((page) => `<section class="page page--section page--grid">
  ${sectionRule(page, p.total_pages)}
  ${page.stories.length
    ? `<div class="section-grid section-grid--dense">${page.stories.map((it) => storyCard(it)).join("")}</div>`
    : `<div class="empty"><h3>Δεν υπάρχουν άλλα θέματα σε αυτή την ενότητα</h3><p>Η συνέχεια της ενότητας μένει κενή σήμερα· η σειρά των ενοτήτων δεν αλλάζει.</p></div>`}
  ${foot(p, page.label_el)}
</section>`).join("")}

${videoPages.map((page) => `<section class="page page--section page--video">
  ${page.section_page === 1 ? sectionHead(page, p) : sectionRule(page, p.total_pages)}
  ${page.stories.length
    ? `<div class="video-grid${page.stories.length <= 3 ? " video-grid--few" : page.stories.length > 6 ? " video-grid--tight" : ""}">${page.stories.map((v) => videoCard(v)).join("")}</div>`
    : `<div class="empty">${plate("ΧΩΡΙΣ ΒΙΝΤΕΟ")}<h3>Δεν υπάρχουν νέα βίντεο σήμερα</h3><p>Τα κανάλια ελέγχονται κάθε μέρα· μόλις ανέβει νέο βίντεο, η ενότητα γεμίζει αυτόματα.</p></div>`}
  ${foot(p, "ΒΙΝΤΕΟ & ΚΑΝΑΛΙΑ")}
</section>`).join("")}

<section class="page page--briefs">
  ${sectionHead({ label_el: "ΣΥΝΤΟΜΑ & ΑΡΙΘΜΟΙ", label_en: "BRIEFS & FIGURES", num: p.briefs_page } as EditionPayload["pages"][number], p)}
  <div class="briefs-grid">
    ${p.briefs.map((b) => `<article class="brief">
      <div class="brief__top">
        <span class="brief__time">${e(b.local_time)}</span>
        <span class="brief__src">${e(b.source_name)} ${badge(b)}</span>
      </div>
      <h4><a href="${e(b.url)}">${e(b.title_el)}</a></h4>
      ${orig(b, "orig--sm")}
      ${b.body.length ? `<p>${e(truncateWords(b.body[0], 26))}</p>` : ""}
    </article>`).join("")}
    ${!p.briefs.length ? `<div class="empty empty--sm"><h3>Δεν υπάρχουν σύντομα σήμερα</h3></div>` : ""}
  </div>

  <div class="figures">
    <div class="figures__title">ΤΟ ΦΥΛΛΟ ΜΕ ΑΡΙΘΜΟΥΣ</div>
    <div class="figures__grid">
      <div class="figures__cell"><span>Θέματα</span><b>${e(numbers.total ?? 0)}</b></div>
      <div class="figures__cell"><span>Πηγές</span><b>${e(numbers.sources ?? 0)}</b></div>
      <div class="figures__cell"><span>Μέση βαρύτητα</span><b>${e(numbers.avg_score ?? 0)}</b></div>
      <div class="figures__cell"><span>Χρονικό εύρος</span><b>${e(numbers.first_time ?? "—")}–${e(numbers.last_time ?? "—")}</b></div>
      <div class="figures__cell"><span>Με φωτογραφία</span><b>${e(numbers.with_image ?? 0)}</b></div>
      <div class="figures__cell"><span>Βίντεο</span><b>${e(numbers.video ?? 0)}</b></div>
    </div>
    <div class="figures__rows">
      ${(numbers.rows as { el: string; count: number }[] || []).map((row) => `<div class="figures__row"><span>${e(row.el)}</span><b>${e(row.count)}</b></div>`).join("")}
    </div>
  </div>
  ${foot(p, "ΣΥΝΤΟΜΑ & ΑΡΙΘΜΟΙ")}
</section>

<section class="page page--sources">
  ${sectionHead({ label_el: "ΠΗΓΕΣ & ΣΤΟΙΧΕΙΑ", label_en: "SOURCES & COLOPHON", num: p.sources_page } as EditionPayload["pages"][number], p)}
  <div class="status">
    <h3 class="status__title">ΚΑΤΑΣΤΑΣΗ ΠΗΓΩΝ</h3>
    <div class="status__grid">
      ${p.sources.map((s) => `<div class="status__row">
        <span class="dot dot--${e(s.status)}"></span>
        <span class="status__name">${e(s.name)}</span>
        <span class="status__method">${e(s.method)}</span>
        <span class="status__items">${s.items} θέματα</span>
        <span class="status__time">${e(s.last_ok)}</span>
      </div>`).join("")}
    </div>
  </div>

  <div class="index">
    <h3 class="status__title">ΕΥΡΕΤΗΡΙΟ ΦΥΛΛΟΥ</h3>
    <div class="index__cols">
      ${p.index.map((entry) => `<div class="index__item">
        <span class="index__num">${String(entry.num).padStart(2, "0")}</span>${e(truncateWords(entry.title, 9))}
        <span class="index__src">${e(entry.source)}</span>
      </div>`).join("")}
    </div>
  </div>

  <div class="colophon">
    <div class="colophon__col">
      <b>${e(p.edition_name)}</b> · ${e(p.edition_name_en)}<br>
      Φύλλο ${p.issue} · ${e(p.date_long)}<br>
      Σύνθεση: αυτόματη σύνταξη ${e(p.generated)} (Europe/Athens)<br>
      Σελίδες: ${p.total_pages} · Θέματα: ${e(numbers.total ?? 0)}
    </div>
    <div class="colophon__col">
      Τα κείμενα αποδίδονται περιληπτικά και μεταφράζονται στα ελληνικά.<br>
      Η πλήρης είδηση ανήκει στην πηγή που αναφέρεται σε κάθε θέμα.<br>
      Οι φωτογραφίες προέρχονται από τις σελίδες των πηγών.<br>
      Τα βίντεο ανήκουν στους δημιουργούς τους.
    </div>
    <div class="colophon__col colophon__col--right">
      <span class="stamp stamp--sm">ΑΡΧΕΙΟΝ<br>ΗΜΕΡΑΣ</span>
    </div>
  </div>
  ${foot(p, "ΠΗΓΕΣ & ΣΤΟΙΧΕΙΑ")}
</section>
</body>
</html>`;
}
