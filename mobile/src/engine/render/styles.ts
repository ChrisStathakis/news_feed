/* Auto-copied from newspaper/templates/styles.css. Run: npm run sync:css */
export const NEWSPAPER_CSS = String.raw`/* ==========================================================================
   Η ΗΜΕΡΗΣΙΑ — vintage desk-file / 1945 dossier art direction
   ========================================================================== */
:root{
  --fs:1;
  --paper:#f4efe1;
  --paper-deep:#e9e0cb;
  --ink:#1c1a17;
  --ink-soft:#49423a;
  --faded:#847a6b;
  --line:#2a251f;
  --red:#8f2b23;
  --navy:#2c3b4c;
  --serif:"Bookman Old Style","Bookman","Georgia","Palatino Linotype",Georgia,serif;
  --mono:"Courier New",Courier,monospace;
  --sans:"Segoe UI","Helvetica Neue",Arial,sans-serif;
}

@page{ size:A4; margin:0; }

*{ box-sizing:border-box; }

html,body{ margin:0; padding:0; background:#cfc6b4; }

body{
  font-family:var(--serif);
  color:var(--ink);
  font-size:calc(9pt * var(--fs));
  line-height:1.42;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
  font-kerning:normal;
  text-rendering:optimizeLegibility;
}

a{ color:inherit; text-decoration:none; }

.page{
  position:relative;
  width:210mm;
  height:296.6mm;
  padding:8mm 11mm 12mm;
  overflow:hidden;
  background:var(--paper);
  break-after:page;
  page-break-after:always;
}
.page:last-of-type{ break-after:auto; page-break-after:auto; }

/* υφή χαρτιού + βινιέτα */
.page::before{
  content:""; position:absolute; inset:0; z-index:0; pointer-events:none;
  background-image:
    repeating-linear-gradient(0deg, rgba(96,78,48,.035) 0 .6px, transparent .6px 3px),
    repeating-linear-gradient(90deg, rgba(96,78,48,.028) 0 .6px, transparent .6px 4px);
  opacity:.7;
}
.page::after{
  content:""; position:absolute; inset:0; z-index:0; pointer-events:none;
  background:
    radial-gradient(120% 92% at 50% 42%, rgba(255,255,255,0) 58%, rgba(90,74,48,.10) 88%, rgba(70,55,32,.16) 100%),
    linear-gradient(90deg, rgba(90,74,48,.06), rgba(255,255,255,0) 7%, rgba(255,255,255,0) 93%, rgba(90,74,48,.06));
}
.page > *{ position:relative; z-index:1; }

/* ------------------------------------------------------------- top bar */
.topbar{
  display:grid;
  grid-template-columns:52mm 1fr 46mm;
  border:1px solid var(--line);
  border-bottom:none;
  background:rgba(255,255,255,.18);
}
.topbar__cell{
  padding:1.8mm 3mm;
  border-right:1px solid var(--line);
  font-family:var(--mono);
  line-height:1.55;
}
.topbar__cell:last-child{ border-right:none; text-align:center; }
.topbar__cell small{
  display:block; font-size:calc(5.6pt * var(--fs)); letter-spacing:.16em; text-transform:uppercase;
  color:var(--ink-soft);
}
.topbar__cell b{ display:block; font-size:calc(8pt * var(--fs)); letter-spacing:.1em; }
.topbar__cell--center{ text-align:center; padding-top:1.2mm; padding-bottom:1.2mm; }
.topbar__cell--right b{ font-size:calc(14pt * var(--fs)); line-height:1.05; }

.masthead{
  font-family:var(--serif);
  font-size:calc(24pt * var(--fs));
  font-weight:700;
  letter-spacing:.06em;
  line-height:1;
  text-transform:uppercase;
  text-shadow:0 .5px 0 rgba(255,255,255,.55), 0 -0.5px 0 rgba(0,0,0,.35);
}
.masthead__sub{
  font-family:var(--mono);
  font-size:calc(5.8pt * var(--fs));
  letter-spacing:.22em;
  color:var(--ink-soft);
  margin-top:1.2mm;
}

/* ----------------------------------------------------------------- nav */
.nav{
  display:flex;
  align-items:center;
  gap:2.6mm;
  flex-wrap:wrap;
  padding:1.8mm 0 1.6mm;
  border-bottom:3px double var(--line);
  font-family:var(--mono);
  font-size:calc(6.1pt * var(--fs));
  letter-spacing:.13em;
  text-transform:uppercase;
  color:var(--ink-soft);
}
.nav__item{ white-space:nowrap; }
.nav__item + .nav__item::before{
  content:"·"; margin:0 2mm 0 .4mm; color:var(--faded);
}
.nav__item--active{ color:var(--ink); border-bottom:1.2px solid var(--ink); padding-bottom:.6mm; }
.nav__item--end{ margin-left:auto; }

/* -------------------------------------------------------------- κάλυμμα */
.cover-head{ text-align:center; padding:3.4mm 0 3mm; }

.date-line{
  display:flex; justify-content:center; align-items:center; gap:3mm;
  font-family:var(--mono); font-size:calc(6.4pt * var(--fs)); letter-spacing:.2em;
  text-transform:uppercase; color:var(--ink-soft);
  margin-bottom:2.6mm;
}
.date-line::before,.date-line::after{
  content:""; height:1px; width:26mm; background:var(--line); opacity:.55;
}
.date-line em{ font-style:normal; color:var(--red); }

.cover-title{
  font-size:calc(27pt * var(--fs));
  line-height:1.03;
  letter-spacing:-.004em;
  margin:0 auto 1.6mm;
  max-width:172mm;
  font-weight:700;
}
.cover-title-en{
  font-size:calc(9.4pt * var(--fs)); font-style:italic; color:var(--ink-soft);
  max-width:150mm; margin:0 auto 1.8mm; line-height:1.3;
}
.orig.cover-title-en{ border-left:0; padding-left:0; }
.cover-stand{
  font-size:calc(9.4pt * var(--fs)); line-height:1.45; color:var(--ink-soft);
  max-width:150mm; margin:0 auto; font-style:italic;
}

/* ------------------------------------------------------------- grid 3col */
.cover-grid{
  display:grid;
  grid-template-columns:52mm 1fr 48mm;
  gap:4.6mm;
  align-items:start;
}
.cover-col{ min-width:0; }
.cover-col--left,.cover-col--right{ display:flex; flex-direction:column; gap:3.4mm; }

/* κάρτες */
.card{
  border:1px solid var(--line);
  background:rgba(255,255,255,.26);
  padding:2.2mm 2.6mm 2.6mm;
}
.card__label{
  font-family:var(--mono);
  font-size:calc(5.8pt * var(--fs));
  letter-spacing:.17em;
  text-transform:uppercase;
  border-bottom:1px solid var(--line);
  padding-bottom:1.1mm;
  margin-bottom:1.6mm;
  color:var(--ink-soft);
}
.card p{ margin:0; font-size:calc(7.4pt * var(--fs)); line-height:1.5; color:var(--ink-soft); }

.map-card{ padding-bottom:2mm; }
.map{ display:block; width:100%; height:auto; color:var(--ink); opacity:.92; }
.map__pin{ font-family:var(--mono); font-size:calc(5px * var(--fs)); letter-spacing:.06em; fill:var(--ink); }
.map-card__foot{
  display:flex; justify-content:space-between; gap:2mm;
  font-family:var(--mono); font-size:calc(5.4pt * var(--fs)); letter-spacing:.1em;
  text-transform:uppercase; color:var(--ink-soft);
  border-top:1px solid var(--line); padding-top:1.2mm; margin-top:1.2mm;
}

.time-card__time{
  font-family:var(--serif);
  font-size:calc(26pt * var(--fs));
  line-height:1;
  letter-spacing:.02em;
  margin:.6mm 0 1mm;
}
.time-card__meta{
  font-family:var(--mono); font-size:calc(5.6pt * var(--fs)); letter-spacing:.12em;
  text-transform:uppercase; color:var(--faded);
}

.order-card__rows{ margin-top:1.8mm; border-top:1px solid var(--line); }
.order-card__rows div{
  display:flex; justify-content:space-between; align-items:baseline;
  padding:.9mm 0; border-bottom:1px dotted rgba(42,37,31,.4);
  font-family:var(--mono); font-size:calc(6pt * var(--fs)); letter-spacing:.1em; text-transform:uppercase;
}
.order-card__rows b{ font-family:var(--serif); font-size:calc(9pt * var(--fs)); letter-spacing:0; }

/* φωτογραφία */
.figure{ margin:0 0 2.4mm; }
.figure img{
  display:block; width:100%; height:auto;
  filter:contrast(1.02) saturate(.98);
}
.cover-col--center .figure img{ height:calc(56mm / var(--fs)); object-fit:cover; }
.cover-col--center .plate{ min-height:calc(56mm / var(--fs)); display:flex; align-items:center; }
.cover-col--center .plate__inner{ flex:1; }
.figure__cap{
  font-size:calc(6.8pt * var(--fs)); line-height:1.4; color:var(--ink-soft);
  border-top:1px solid var(--line); padding-top:1.2mm; margin-top:1.4mm;
}
.figure__cap--lead{ margin:-1mm 0 3mm; }
.figure__cap b{ font-weight:700; }

/* placeholder πλάκα */
.plate{
  border:1px solid var(--line);
  background:
    repeating-linear-gradient(45deg, rgba(42,37,31,.045) 0 1px, transparent 1px 5px),
    rgba(255,255,255,.22);
  padding:2mm;
  margin-bottom:2.4mm;
}
.plate__inner{
  border:1px dashed rgba(42,37,31,.5);
  padding:7mm 4mm;
  text-align:center;
  color:var(--ink-soft);
}
.compass{ width:20mm; height:20mm; color:var(--ink); opacity:.75; }
.compass__n{ font-family:var(--mono); font-size:calc(6px * var(--fs)); letter-spacing:.2em; }
.plate__label{
  font-family:var(--mono); font-size:calc(6.6pt * var(--fs)); letter-spacing:.26em;
  text-transform:uppercase; margin-top:2mm;
}
.plate__hint{
  font-family:var(--mono); font-size:calc(5.2pt * var(--fs)); letter-spacing:.15em;
  text-transform:uppercase; color:var(--faded); margin-top:1.2mm;
}

/* δευτερεύοντα πρώτης */
.secondary{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:4mm;
}
.sec-story{ border-top:1px solid var(--line); padding-top:1.8mm; }
.kicker{
  font-family:var(--mono); font-size:calc(5.6pt * var(--fs)); letter-spacing:.14em;
  text-transform:uppercase; color:var(--red); margin-bottom:1.2mm;
}
.sec-story h3{
  font-size:calc(10.4pt * var(--fs)); line-height:1.14; margin:0 0 1mm; font-weight:700;
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
}
.sec-story p{
  margin:1mm 0 0; font-size:calc(7.6pt * var(--fs)); line-height:1.42; color:var(--ink-soft);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}

.orig{
  font-style:italic; font-size:calc(7.6pt * var(--fs)); line-height:1.32;
  color:var(--ink-soft);
  border-left:2px solid rgba(143,43,35,.55);
  padding-left:2mm;
  margin:0 0 1.4mm;
}
.orig--sm{ font-size:calc(6.8pt * var(--fs)); border-left-width:1.5px; padding-left:1.6mm; margin-bottom:1mm; }

/* δεξιά στήλη φακέλου */
.file-card{
  border:1px solid var(--line);
  background:rgba(255,255,255,.24);
  padding:2.4mm 2.8mm 2.8mm;
}
.file-card__head{
  display:flex; justify-content:space-between;
  font-family:var(--mono); font-size:calc(5.6pt * var(--fs)); letter-spacing:.14em;
  padding-bottom:1.2mm; border-bottom:1px solid var(--line);
}
.file-card__title{
  font-size:calc(12pt * var(--fs)); line-height:1.12; margin:2.2mm 0 1.6mm; font-weight:700;
}
.file-card__score{
  display:flex; justify-content:space-between; align-items:baseline;
  border-top:1px dotted rgba(42,37,31,.5); border-bottom:1px dotted rgba(42,37,31,.5);
  padding:1.2mm 0;
  font-family:var(--mono); font-size:calc(5.6pt * var(--fs)); letter-spacing:.14em;
}
.file-card__score b{ font-family:var(--serif); font-size:calc(13pt * var(--fs)); letter-spacing:0; }
.file-card__sources{
  display:flex; flex-wrap:wrap; gap:1mm; margin:1.6mm 0;
}
.file-card__sources span{
  font-family:var(--mono); font-size:calc(5.2pt * var(--fs)); letter-spacing:.08em;
  border:1px solid rgba(42,37,31,.45); padding:.4mm 1mm; color:var(--ink-soft);
}
.file-card__open{
  display:block; text-align:center;
  font-family:var(--mono); font-size:calc(6.2pt * var(--fs)); letter-spacing:.16em;
  border:1px solid var(--ink); padding:1.3mm; margin-bottom:2mm;
  background:rgba(42,37,31,.06);
}
.file-card__index-title{
  font-family:var(--mono); font-size:calc(5.4pt * var(--fs)); letter-spacing:.16em;
  text-transform:uppercase; color:var(--faded); margin-bottom:1mm;
}
.file-card__row{
  display:flex; justify-content:space-between;
  font-family:var(--mono); font-size:calc(5.8pt * var(--fs)); letter-spacing:.08em;
  padding:.65mm 0; border-bottom:1px dotted rgba(42,37,31,.32);
  text-transform:uppercase;
}
.file-card__row b{ font-family:var(--serif); font-size:calc(7.4pt * var(--fs)); letter-spacing:0; }

/* σφραγίδες */
.stamp{
  border:2px solid var(--red);
  color:var(--red);
  font-family:var(--mono);
  font-size:calc(6.2pt * var(--fs));
  letter-spacing:.16em;
  text-transform:uppercase;
  text-align:center;
  line-height:1.4;
  padding:1.8mm 2.4mm;
  width:fit-content;
  margin:1mm auto 0;
  transform:rotate(-6deg);
  opacity:.72;
  mix-blend-mode:multiply;
}
.stamp--double{ outline:1px solid var(--red); outline-offset:1.1mm; }
.stamp--sm{ font-size:calc(5.4pt * var(--fs)); padding:1.2mm 2mm; }

.notes{ list-style:none; margin:0; padding:0; }
.notes li{
  display:flex; gap:1.8mm; align-items:baseline;
  font-size:calc(7pt * var(--fs)); line-height:1.35; padding:1.1mm 0;
  border-bottom:1px dotted rgba(42,37,31,.32);
}
.notes li:last-child{ border-bottom:none; }
.notes span{
  font-family:var(--mono); font-size:calc(5.4pt * var(--fs)); letter-spacing:.08em; color:var(--red);
  flex:0 0 8mm;
}

/* strip ΣΗΜΕΡΑ */
.today-strip{
  display:grid; grid-template-columns:20mm 1fr;
  gap:3mm; align-items:stretch;
  border-top:3px double var(--line);
  border-bottom:1px solid var(--line);
  margin-top:5mm; padding:2.2mm 0 2.4mm;
}
.today-strip__label{
  font-family:var(--mono); font-size:calc(6.6pt * var(--fs)); letter-spacing:.18em;
  color:var(--red); border-right:1px solid var(--line);
  display:flex; align-items:center; padding-right:2mm;
}
.today-strip__items{ display:grid; grid-template-columns:repeat(5,1fr); gap:2.6mm; }
.today-item{ min-width:0; }
.today-item__time{
  display:block; font-family:var(--mono); font-size:calc(5.4pt * var(--fs));
  letter-spacing:.1em; color:var(--faded); margin-bottom:.6mm;
}
.today-item__title{
  display:block; font-size:calc(6.9pt * var(--fs)); line-height:1.3;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden;
}

/* --------------------------------------------------------- εσωτερικές σελ. */
.section-head{
  display:flex; align-items:flex-end; justify-content:space-between; gap:4mm;
  border-bottom:3px double var(--line);
  padding-bottom:1.8mm;
  margin-bottom:4mm;
}
.section-head__brand{
  display:flex; flex-direction:column; gap:.4mm;
  font-family:var(--mono); font-size:calc(5.4pt * var(--fs)); letter-spacing:.16em;
  text-transform:uppercase; color:var(--faded);
  min-width:32mm;
}
.section-head__paper{ color:var(--ink); font-size:calc(6.2pt * var(--fs)); }
.section-title{
  font-size:calc(22pt * var(--fs)); line-height:1; margin:0; font-weight:700;
  letter-spacing:.01em; text-transform:uppercase;
  display:flex; align-items:baseline; gap:3mm;
}
.section-title span{
  font-family:var(--mono); font-size:calc(6.4pt * var(--fs)); letter-spacing:.2em;
  color:var(--faded); font-weight:400;
}
/* Μεγάλα ονόματα πηγών (π.χ. «THE ALL-AROUNDERS») να μη σπάνε τη γραμμή. */
.section-title--long{ font-size:calc(16pt * var(--fs)); letter-spacing:0; }
.section-head__page{
  font-family:var(--mono); font-size:calc(6.2pt * var(--fs)); letter-spacing:.14em;
  color:var(--ink-soft); white-space:nowrap;
}
.section-head__page em{ font-style:normal; color:var(--faded); }

.page--section{ display:flex; flex-direction:column; }

.sec-grid{
  display:grid;
  grid-template-columns:1fr 60mm;
  gap:5.5mm;
  align-items:start;
  flex:0 0 auto;
  min-height:0;
}
.sec-main{ min-width:0; display:flex; flex-direction:column; min-height:0; overflow:hidden; }
.sec-main .figure{
  flex:0 0 auto; max-height:92mm; display:flex; flex-direction:column;
  margin-bottom:2.4mm;
}
.sec-main .figure img{
  width:100%; height:auto; max-height:78mm; object-fit:cover;
}
.sec-main .plate{ flex:0 0 76mm; height:76mm; display:flex; align-items:center; margin-bottom:2.4mm; }
.sec-main .plate__inner{ flex:1; }

.sec-sub{
  border-top:3px double var(--line);
  margin-top:3.5mm; padding-top:2mm;
}
.sec-sub__label{
  font-family:var(--mono); font-size:calc(5.6pt * var(--fs)); letter-spacing:.2em;
  text-transform:uppercase; color:var(--faded); margin-bottom:2mm;
}
.sec-sub__grid{
  display:grid; grid-template-columns:repeat(3,1fr);
  gap:4mm 5mm;
  align-content:start;
}
.sub-story h4{
  font-size:calc(8.6pt * var(--fs)); line-height:1.16; margin:0 0 .7mm; font-weight:700;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}
.sub-story p{
  margin:.7mm 0 0; font-size:calc(6.8pt * var(--fs)); line-height:1.38; color:var(--ink-soft);
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
}

.more-strip{
  display:grid; grid-template-columns:18mm 1fr;
  gap:3mm; align-items:start;
  border-top:3px double var(--line);
  margin-top:4mm; padding-top:2.2mm;
}
.more-strip__label{
  font-family:var(--mono); font-size:calc(6pt * var(--fs)); letter-spacing:.16em;
  color:var(--red); border-right:1px solid var(--line);
  padding-right:2mm; line-height:1.4;
}
.more-strip__items{ display:grid; grid-template-columns:repeat(3,1fr); gap:3mm 5mm; }
.more-item h5{
  font-size:calc(8pt * var(--fs)); line-height:1.2; margin:0 0 .6mm; font-weight:700;
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
}
.more-item p{
  margin:0; font-size:calc(6.6pt * var(--fs)); line-height:1.36; color:var(--ink-soft);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}

.sec-headline{
  font-size:calc(19pt * var(--fs)); line-height:1.1; margin:0 0 1.6mm; font-weight:700;
  letter-spacing:-.002em;
}
.sec-headline a{ text-decoration:none; }
.sec-lead{
  font-size:calc(8.8pt * var(--fs)); line-height:1.5; margin:0 0 2mm;
  color:var(--ink-soft);
  text-align:justify;
  hyphens:auto;
  display:-webkit-box; -webkit-line-clamp:7; -webkit-box-orient:vertical;
  overflow:hidden;
}

.byline{
  display:flex; gap:3mm; align-items:baseline;
  border-top:1px solid var(--line);
  padding-top:1.3mm;
  font-family:var(--mono); font-size:calc(5.8pt * var(--fs)); letter-spacing:.12em;
  text-transform:uppercase; color:var(--ink-soft);
}
.byline__src{ color:var(--red); }
.byline__more{ border:1px solid rgba(42,37,31,.4); padding:0 1mm; }

.sec-side{
  display:flex; flex-direction:column; gap:3mm;
  border-left:1px solid var(--line); padding-left:4mm;
  justify-content:flex-start; overflow:hidden;
}
.sec-side .side-note{ margin-top:auto; }
.side-story{ border-top:1px solid var(--line); padding-top:1.6mm; }
.side-story:first-child{ border-top:none; padding-top:0; }
.side-story h4{
  font-size:calc(9.6pt * var(--fs)); line-height:1.16; margin:0 0 .8mm; font-weight:700;
  display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden;
}
.side-story p{
  margin:.8mm 0 0; font-size:calc(7.2pt * var(--fs)); line-height:1.4; color:var(--ink-soft);
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
}
.side-note{ margin-top:1mm; }
.side-note p{ font-size:calc(6.6pt * var(--fs)); line-height:1.45; }

.empty{ padding:8mm 6mm; text-align:center; color:var(--ink-soft); }
.empty .plate{ max-width:100mm; margin:0 auto 6mm; }
.empty h3{ font-size:calc(15pt * var(--fs)); margin:0 0 2mm; }
.empty p{ font-size:calc(8.6pt * var(--fs)); max-width:110mm; margin:0 auto; }

/* ------------------------------------------------------------- σύντομα */
.page--briefs{ display:flex; flex-direction:column; }

.briefs-grid{
  display:grid; grid-template-columns:1fr 1fr;
  column-gap:6mm; row-gap:0;
  grid-auto-rows:1fr; align-content:stretch;
  flex:1; min-height:0; overflow:hidden;
}
.brief{
  padding:2mm 0 2.2mm;
  border-bottom:1px solid var(--line);
  display:flex; flex-direction:column;
}
.brief__top{
  display:flex; justify-content:space-between; gap:2mm;
  font-family:var(--mono); font-size:calc(5.4pt * var(--fs)); letter-spacing:.12em;
  text-transform:uppercase; color:var(--faded); margin-bottom:.8mm;
}
.brief__src{ color:var(--red); }
.brief h4{
  font-size:calc(9pt * var(--fs)); line-height:1.18; margin:0 0 .6mm; font-weight:700;
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
}
.brief p{
  margin:.6mm 0 0; font-size:calc(6.8pt * var(--fs)); line-height:1.38; color:var(--ink-soft);
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
}

.empty--sm{ padding:10mm; }

/* ------------------------------------------------------------- πηγές */
.status{
  margin-top:4mm;
  border:1px solid var(--line);
  background:rgba(255,255,255,.22);
  padding:2.4mm 3mm 2.8mm;
}
.status__title{
  font-family:var(--mono); font-size:calc(6.4pt * var(--fs)); letter-spacing:.2em;
  text-transform:uppercase; margin:0 0 1.8mm; padding-bottom:1mm;
  border-bottom:1px solid var(--line);
}
.status__grid{ display:grid; grid-template-columns:1fr 1fr; column-gap:6mm; }
.status__row{
  display:grid; grid-template-columns:3mm 1fr auto auto auto;
  gap:2mm; align-items:baseline;
  font-family:var(--mono); font-size:calc(5.7pt * var(--fs)); letter-spacing:.06em;
  padding:.9mm 0; border-bottom:1px dotted rgba(42,37,31,.32);
  white-space:nowrap;
}
.status__name{ overflow:hidden; text-overflow:ellipsis; }
.status__method{ color:var(--faded); }
.status__items{ color:var(--ink-soft); }
.status__time{ color:var(--faded); }
.dot{ width:2.2mm; height:2.2mm; border-radius:50%; display:inline-block; background:var(--faded); }
.dot--ok{ background:#4a6b3d; }
.dot--degraded{ background:#a8842c; }
.dot--broken{ background:var(--red); }

/* ------------------------------------------------------------ colophon */
.colophon{
  display:grid; grid-template-columns:1fr 1.3fr 32mm;
  gap:6mm; margin-top:4mm; padding-top:2mm;
  border-top:3px double var(--line);
  font-size:calc(6.6pt * var(--fs)); line-height:1.5; color:var(--ink-soft);
}
.colophon b{ color:var(--ink); }
.colophon__col--right{ text-align:right; }

/* --------------------------------------------------------------- footer */
.page-foot{
  position:absolute; left:11mm; right:11mm; bottom:4.2mm;
  display:flex; justify-content:space-between; gap:4mm;
  border-top:1px solid var(--line);
  padding-top:1.2mm;
  font-family:var(--mono); font-size:calc(5.4pt * var(--fs)); letter-spacing:.14em;
  text-transform:uppercase; color:var(--faded);
}

/* -------------------------------------------------------------- screen */
@media screen{
  body{ background:#c9c0ad; padding:8mm 0; }
  .page{
    margin:0 auto 8mm;
    box-shadow:0 6mm 18mm rgba(50,40,25,.28), 0 1mm 0 rgba(255,255,255,.4) inset;
    border:1px solid rgba(60,48,30,.25);
  }
}


/* ==========================================================================
   20 ΣΕΛΙΔΕΣ — κάρτες, βίντεο, αριθμοί
   ========================================================================== */
.badge{
  display:inline-block;
  font-family:var(--mono); font-size:calc(5.2pt * var(--fs)); letter-spacing:.14em;
  border:1px solid rgba(42,37,31,.55); color:var(--red);
  padding:.15mm .9mm; margin-left:1.4mm; vertical-align:middle;
}

/* --- lead σελίδας ενότητας ------------------------------------------------ */
.lead-story{
  display:grid; grid-template-columns:88mm 1fr; gap:5.5mm;
  align-items:start;
  border-bottom:3px double var(--line);
  padding-bottom:3mm;
}
.lead-story__media img{
  display:block; width:100%; height:auto; max-height:86mm; object-fit:cover;
}
.lead-story__media .plate{ margin:0; height:86mm; }
.lead-story__cap{
  font-family:var(--mono); font-size:calc(5.2pt * var(--fs)); letter-spacing:.1em;
  text-transform:uppercase; color:var(--faded);
  border-top:1px solid var(--line); padding-top:1mm; margin-top:1.2mm;
}
.lead-story__text .sec-lead{
  font-size:calc(8.2pt * var(--fs)); line-height:1.44; margin:0 0 1.4mm; text-align:justify; hyphens:auto;
  display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden;
}
.lead-story__text .sec-lead:first-of-type::first-letter{
  float:left; font-size:calc(20pt * var(--fs)); line-height:.85; padding:1mm 1.2mm 0 0; font-weight:700;
}
.lead-story__text .orig{ margin-bottom:1.6mm; }

/* --- πλέγμα καρτών -------------------------------------------------------- */
.page--section{ display:flex; flex-direction:column; }
.section-grid--first,
.page--grid .section-grid{ flex:1 1 auto; align-content:space-between; }

.section-grid{
  display:grid; grid-template-columns:repeat(3,1fr);
  gap:4mm 5mm; align-content:start; margin-top:3mm;
}
.story-card{ min-width:0; display:flex; flex-direction:column; }
.story-card + .story-card{ border-left:1px solid rgba(42,37,31,.35); padding-left:3.5mm; }
.section-grid > .story-card:nth-child(3n+1){ border-left:none; padding-left:0; }

.story-card__media{
  height:23mm; overflow:hidden; margin-bottom:1.2mm;
  border:1px solid var(--line);
}
.page--grid .story-card__media{ height:30mm; }
.page--grid .story-card p{ -webkit-line-clamp:3; }
.page--grid .story-card__title{ font-size:calc(9pt * var(--fs)); }
.story-card__media img{ display:block; width:100%; height:100%; object-fit:cover; }
.story-card__plate{
  height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:.6mm; background:repeating-linear-gradient(45deg, rgba(42,37,31,.05) 0 1px, transparent 1px 5px);
  font-family:var(--mono); font-size:calc(5.2pt * var(--fs)); letter-spacing:.2em; color:var(--faded);
}
.story-card__plate small{ font-size:calc(4.6pt * var(--fs)); letter-spacing:.1em; }

.story-card__title{ font-size:calc(8.4pt * var(--fs)); line-height:1.16; margin:0 0 .6mm; font-weight:700; }
.story-card__title--video{ font-size:calc(9pt * var(--fs)); }
.story-card__title a{ text-decoration:none; }
.story-card p{
  margin:.6mm 0 0; font-size:calc(6.6pt * var(--fs)); line-height:1.36; color:var(--ink-soft);
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
}
.story-card__more{ font-family:var(--mono); font-size:calc(5.4pt * var(--fs)); letter-spacing:.08em; color:var(--red); }

/* --- συνέχεια ενότητας ---------------------------------------------------- */
.section-rule{
  display:flex; align-items:baseline; justify-content:space-between; gap:4mm;
  border-bottom:3px double var(--line); padding-bottom:1.6mm; margin-bottom:3mm;
  font-family:var(--mono); font-size:calc(6pt * var(--fs)); letter-spacing:.16em; text-transform:uppercase;
}
.section-rule__name{ font-family:var(--serif); font-size:calc(12pt * var(--fs)); letter-spacing:.04em; font-weight:700; }
.section-rule__cont{ color:var(--faded); }
.section-rule__page{ color:var(--ink-soft); }

/* --- βίντεο --------------------------------------------------------------- */
.video-grid{
  display:grid; grid-template-columns:1fr 1fr; gap:5mm 6mm; align-content:start;
}
.video-grid--few{ gap:6mm 7mm; }
.video-grid--few .video-card__media{ height:56mm; }
.video-grid--few .story-card__title--video{ font-size:calc(10.5pt * var(--fs)); }
.video-grid--few .video-card p{ font-size:calc(7.2pt * var(--fs)); -webkit-line-clamp:6; }

.video-grid--tight{ grid-template-columns:repeat(3,1fr); gap:4mm 5mm; }
.video-grid--tight .video-card__media{ height:30mm; }
.video-grid--tight .story-card__title--video{ font-size:calc(7.8pt * var(--fs)); }
.video-grid--tight .video-card p{ font-size:calc(6.2pt * var(--fs)); -webkit-line-clamp:4; }
.video-grid--tight .qr{ width:10mm; height:10mm; }
.video-grid--tight .video-card__link{ font-size:calc(4.6pt * var(--fs)); }

/* --- ευρετήριο ------------------------------------------------------------ */
.index{ margin-top:4mm; border-top:3px double var(--line); padding-top:2mm; }
.index__cols{
  columns:4; column-gap:5mm; column-rule:1px dotted rgba(42,37,31,.3);
  max-height:165mm; overflow:hidden;
}
.index__item{
  break-inside:avoid; font-size:calc(5.6pt * var(--fs)); line-height:1.3;
  padding:.55mm 0; border-bottom:1px dotted rgba(42,37,31,.25);
}
.index__num{
  font-family:var(--mono); font-size:calc(5pt * var(--fs)); color:var(--red);
  letter-spacing:.04em; margin-right:1mm;
}
.index__src{ color:var(--faded); font-family:var(--mono); font-size:calc(4.8pt * var(--fs)); }
.video-card{ min-width:0; display:flex; flex-direction:column; }
.video-card__media{ position:relative; height:41mm; margin-bottom:1.4mm; }
.video-card__media .plate{ margin:0; height:100%; }
.video-card__play{
  position:absolute; right:2mm; bottom:2mm;
  background:rgba(28,26,23,.72); color:var(--paper);
  font-size:calc(8pt * var(--fs)); padding:.6mm 2mm; letter-spacing:.1em;
}
.video-card p{
  margin:.6mm 0 0; font-size:calc(6.8pt * var(--fs)); line-height:1.38; color:var(--ink-soft);
  display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden;
}
.video-card__foot{
  display:flex; align-items:center; justify-content:space-between; gap:3mm;
  border-top:1px solid var(--line); margin-top:1.6mm; padding-top:1.2mm;
}
.video-card__link{
  font-family:var(--mono); font-size:calc(5.2pt * var(--fs)); letter-spacing:.06em; color:var(--faded);
}
.qr{ width:13mm; height:13mm; display:block; }

/* --- σύντομα + αριθμοί ---------------------------------------------------- */
.page--briefs .briefs-grid{ flex:1 1 auto; }
.figures{
  border:1px solid var(--line); background:rgba(255,255,255,.22);
  padding:2.4mm 3mm 2.6mm; margin-top:3.5mm;
}
.figures__title{
  font-family:var(--mono); font-size:calc(6.2pt * var(--fs)); letter-spacing:.2em; text-transform:uppercase;
  border-bottom:1px solid var(--line); padding-bottom:1mm; margin-bottom:2mm;
}
.figures__grid{ display:grid; grid-template-columns:repeat(6,1fr); gap:2mm; }
.figures__cell{ border-right:1px dotted rgba(42,37,31,.35); padding-right:2mm; }
.figures__cell:last-child{ border-right:none; }
.figures__cell span{
  display:block; font-family:var(--mono); font-size:calc(5pt * var(--fs)); letter-spacing:.1em;
  text-transform:uppercase; color:var(--faded);
}
.figures__cell b{ font-size:calc(13pt * var(--fs)); line-height:1.1; }
.figures__rows{
  display:grid; grid-template-columns:repeat(4,1fr); gap:0 5mm; margin-top:2.4mm;
  border-top:1px solid var(--line); padding-top:1.6mm;
}
.figures__row{
  display:flex; justify-content:space-between; align-items:baseline;
  font-family:var(--mono); font-size:calc(5.6pt * var(--fs)); letter-spacing:.08em; text-transform:uppercase;
  border-bottom:1px dotted rgba(42,37,31,.3); padding:.9mm 0;
}
.figures__row b{ font-family:var(--serif); font-size:calc(8pt * var(--fs)); }

/* --- σελίδα πηγών --------------------------------------------------------- */
.method{ margin-top:4mm; }
.method__cols{ display:grid; grid-template-columns:1fr 1fr; gap:3mm 6mm; }
.method__cols div{ font-size:calc(7pt * var(--fs)); line-height:1.45; color:var(--ink-soft); }
.method__cols b{ display:block; font-family:var(--mono); font-size:calc(5.8pt * var(--fs));
  letter-spacing:.14em; text-transform:uppercase; color:var(--ink); margin-bottom:.6mm; }
.page--sources .status{ margin-top:2mm; }


/* ==========================================================================
   Θέματα φύλλου: light (σέπια) / dark / color
   ========================================================================== */
body.theme-dark{
  --paper:#1b1916;
  --paper-deep:#242019;
  --ink:#ece4d2;
  --ink-soft:#c9bda6;
  --faded:#8f8472;
  --line:#cdc2ad;
  --red:#d4664e;
  --navy:#9fb3c8;
  background:#12100d;
}
body.theme-dark .page::after{
  background:
    radial-gradient(120% 92% at 50% 42%, rgba(0,0,0,0) 58%, rgba(0,0,0,.25) 90%, rgba(0,0,0,.35) 100%),
    linear-gradient(90deg, rgba(255,255,255,.03), rgba(255,255,255,0) 8%, rgba(255,255,255,0) 92%, rgba(255,255,255,.03));
}
body.theme-dark .page::before{
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 .6px, transparent .6px 3px),
    repeating-linear-gradient(90deg, rgba(255,255,255,.028) 0 .6px, transparent .6px 4px);
}
body.theme-dark .card,
body.theme-dark .file-card,
body.theme-dark .status,
body.theme-dark .figures{ background:rgba(255,255,255,.04); }
body.theme-dark .story-card__plate{
  background:repeating-linear-gradient(45deg, rgba(236,228,210,.05) 0 1px, transparent 1px 5px);
}
body.theme-dark .topbar{ background:rgba(255,255,255,.05); }
body.theme-dark .stamp{ mix-blend-mode:normal; }

body.theme-color{
  --paper:#fbfaf6;
  --ink:#15130f;
  --ink-soft:#4a443b;
  --line:#2a251f;
  --red:#b03a2e;
}
body.theme-color .kicker{ color:var(--red); }
body.theme-color .section-title{ color:#111; }
body.theme-color .section-head{ border-bottom-color:var(--red); }
body.theme-color .today-strip{ border-top-color:var(--red); }

@media screen{
  body.theme-dark{ background:#0c0b09; }
  body.theme-color{ background:#dcd7cb; }
}


/* Μεγαλύτερες γραμματοσειρές: κρύβεται η δευτερεύουσα κάρτα για να χωράει το εξώφυλλο. */
body.fs-large .notes-card{ display:none; }
body.fs-large .stamp--double{ margin-top:2mm; }

/* ------------------------------------------------------- google trends */
.page--trends{ display:flex; flex-direction:column; }
.trends-head{ border-bottom:2.5px solid var(--line); padding-bottom:3.5mm; margin-bottom:4mm; }
.trends-head__top{
  display:flex; justify-content:space-between; align-items:baseline;
  font-family:var(--mono); font-size:calc(5.8pt * var(--fs));
  letter-spacing:.16em; text-transform:uppercase; color:var(--red);
}
.trends-head__page em{ font-style:normal; color:var(--faded); }
.trends-title{
  font-size:calc(34pt * var(--fs)); line-height:.9; letter-spacing:.005em;
  margin:2.5mm 0 2mm; text-transform:uppercase;
}
.trends-scope{
  display:flex; align-items:baseline; gap:4mm;
  border-top:1px solid rgba(42,37,31,.35); padding-top:1.6mm;
}
.trends-scope__label{
  font-family:var(--mono); font-size:calc(9.5pt * var(--fs)); font-weight:700;
  letter-spacing:.12em; color:var(--navy);
}
.trends-scope__meta{
  font-family:var(--mono); font-size:calc(5.8pt * var(--fs));
  letter-spacing:.14em; color:var(--faded); text-transform:uppercase;
}
.trends-list{
  list-style:none; margin:0 0 1mm; padding:0; flex:1 1 auto; min-height:0;
  display:grid; grid-template-columns:1fr 1fr; grid-auto-rows:1fr;
  column-gap:7mm;
}
.trend{
  display:grid; grid-template-columns:8.5mm 1fr; column-gap:2.5mm;
  align-content:center; align-items:center;
  padding:2mm 0 2.2mm; border-bottom:1px solid rgba(42,37,31,.28);
}
.trend--img{ grid-template-columns:8.5mm 1fr 26mm; }
.trend__rank{
  font-family:var(--mono); font-weight:700; font-size:calc(17pt * var(--fs));
  line-height:1; color:var(--red);
}
.trend__term{
  margin:0 0 .8mm; font-size:calc(11.5pt * var(--fs)); line-height:1.14;
}
.trend__meta{
  font-family:var(--mono); font-size:calc(5.4pt * var(--fs));
  letter-spacing:.1em; color:var(--faded); text-transform:uppercase;
}
.trend__meta b{ color:var(--ink); }
.trend__link{
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden; margin-top:1mm; font-size:calc(7.6pt * var(--fs));
  line-height:1.28; color:var(--ink-soft);
}
.trend__img{
  width:26mm; height:18mm; object-fit:cover;
  border:1px solid rgba(42,37,31,.5);
}
`;
