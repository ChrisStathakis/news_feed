# Η ΗΜΕΡΗΣΙΑ — αυτόματη εφημερίδα + desktop εφαρμογή

Καθημερινό φύλλο με **μία ενότητα ανά πηγή** (τόσες σελίδες όσες δικαιούται κάθε πηγή από το βάρος της, +2 σελίδες Google Trends όταν είναι ενεργό), στα ελληνικά, σε ύφος **αρχείου 1945**.
Διαβάζει sites και **κανάλια YouTube**, βγάζει το κύριο κείμενο κάθε άρθρου, φιλτράρει
διαφημίσεις, μεταφράζει με έλεγχο γλώσσας και παράγει **HTML εφημερίδα** — με προαιρετικό PDF.

Δύο τρόποι χρήσης:

```powershell
# 1) γραμμή εντολών
cd newspaper
python run.py --today

# 2) desktop εφαρμογή (Electron)
cd app
npm install
npm start
```

---

## Τι παράγει

```
output/<YYYY-MM-DD>/
├── efimerida-<YYYY-MM-DD>.html   # ΤΟ ΦΥΛΛΟ (κύριο προϊόν)
├── efimerida-<YYYY-MM-DD>.pdf    # προαιρετικά (--pdf ή κουμπί PDF)
├── assets/img/<id>_<size>.jpg    # sepia/halftone φωτογραφίες (520 / 900 px)
├── assets/qr/<id>.png            # QR για τα βίντεο
├── data/items.json               # θέματα + γλώσσα + scores + flags
├── data/edition.json             # δομή σελίδων, κάλυψη, quality
└── qa/p1.png …                   # rasterized σελίδες (python qa.py)
```

---

## Δομή φύλλου

| Σελ. | Περιεχόμενο |
|---|---|
| 1 | Πρώτη σελίδα: lead, 3 δευτερεύοντα, χάρτης, φάκελος, σφραγίδες |
| 2… | **Μία ενότητα ανά πηγή**, με τη σειρά του `sites.txt` (BBC, CNN Greece, Yahoo, IMDb, κάθε κανάλι YouTube…) |
| Τελευταίες 2 | **ΣΥΝΤΟΜΑ & ΑΡΙΘΜΟΙ** και **ΠΗΓΕΣ & ΣΤΟΙΧΕΙΑ** |

Η κάθε πηγή παίρνει `max(1, round(weight))` σελίδες: weight 1.0 → 1 σελίδα,
weight 2.0 → 2 σελίδες. Είναι **οδηγός**, όχι καταναγκασμός: αν η πηγή δεν έχει
αρκετά θέματα, παίρνει λιγότερες σελίδες (ή καμία) και το φύλλο απλώς μικραίνει.
Οι σελίδες που περισσεύουν **δεν** μεταφέρονται σε άλλη πηγή.
Με 11 ενεργές πηγές στο weight 1.0 το φύλλο βγαίνει συνήθως 14 σελίδες (16 με Trends).

---

## Ρυθμίσεις — `settings.json`

Ό,τι αφορά την έκδοση είναι έξω από τον κώδικα:

```json
{
  "edition": { "name": "Η ΗΜΕΡΗΣΙΑ", "name_en": "THE DAILY" },
  "layout": { "first_page": 7, "grid_page": 9, "video_page": 6, "briefs_per_page": 10 },
  "limits": { "lead": 900, "featured": 420, "story": 240, "brief": 90, "video": 190 },
  "weights": { "bbc.com": 2.0, "yt-_tarounders": 1.5 },
  "sources_disabled": [],
  "theme": { "paper": "#f4efe1", "ink": "#1c1a17", "accent": "#8f2b23" },
  "runtime": { "python": "", "pdf": false, "pdf_dir": "" },
  "schedule": { "enabled": true, "at": "07:00" },
  "trends": { "enabled": true, "country": "GR", "per_page": 10 }
}
```

Η εφαρμογή γράφει τις ίδιες ρυθμίσεις από την οθόνη **Ρυθμίσεις**. Αν λείπει το αρχείο,
δημιουργείται με τις προεπιλογές.

### Φάκελος PDF

Στις **Ρυθμίσεις → Εκτέλεση** διαλέγεις φάκελο με το κουμπί **Αλλαγή…** (native παράθυρο
των Windows). Αποθηκεύεται στο `runtime.pdf_dir`:

- Κενό → το PDF μπαίνει δίπλα στο φύλλο (`output\<ημερομηνία>\`).
- Ορισμένος → `efimerida-<ημερομηνία>.pdf` **μόνο** εκεί (χωρίς αντίγραφο).
- Ισχύει για το αυτόματο PDF, το κουμπί **PDF** και την **Εκτύπωση** (που παράγει PDF).
- Αν ο φάκελος χαθεί ή δεν γράφεται → προειδοποίηση και fallback στον φάκελο του φύλλου.

### Google Trends (24ωρο)

Όταν είναι ενεργό, το φύλλο παίρνει **δύο σελίδες μπροστά**:

- **Σελ. 1 — Παγκόσμιο** (η Google δεν έχει «worldwide» geo· χρησιμοποιείται το `US`)
- **Σελ. 2 — Χώρα** από το `trends.country` (default `GR`)

Μετά ακολουθεί κανονικά η εφημερίδα (το εξώφυλλο γίνεται σελ. 3).
Αν είναι κλειστό —ή αν αποτύχει το feed— το φύλλο βγαίνει χωρίς τις δύο σελίδες Trends,
με το ίδιο περιεχόμενο και χωρίς κενά.

Πηγή: `https://trends.google.com/trending/rss?geo=<XX>` (ανεπίσημο RSS, χωρίς API key).
Cache 60′ για τη λίστα και για τις εικόνες, ώστε να μην ξαναχτυπά την Google σε κάθε φύλλο.

---

## Πηγές (`sites.txt`)

```
https://www.bbc.com/
https://www.cnn.gr/
https://www.youtube.com/@ChannelName
```

- **Πηγή αλήθειας:** το `sites.txt`. Ό,τι δεν είναι εκεί δεν συλλέγεται· ό,τι αφαιρεθεί
  σταματά αμέσως. Η σειρά του αρχείου είναι η σειρά των ενοτήτων του φύλλου.
- **Νέο site:** αυτόματη ανακάλυψη RSS/Atom → JSON-LD → Jina → Google News → Chrome.
  Προστίθεται στο τέλος της λίστας και γίνεται ενότητα με 1 σελίδα.
- **Κανάλι YouTube:** επίλυση `channelId` (και fallback `/user/`, `/c/`), RSS βίντεο,
  απομαγνητοφώνηση → **extractive περίληψη**. Κάθε κανάλι = ξεχωριστή ενότητα video.
- **Δοκιμή:** από την εφαρμογή «Δοκιμή», ή `python run.py --check-source <url>`.
- **Βάρος πηγής:** στην οθόνη Πηγές ή στις Ρυθμίσεις, στήλη `×` (0.3–2.0).
  Πολλαπλασιάζει το score κάθε θέματος και ορίζει τις σελίδες της ενότητας
  (`round(weight)`, 1–2). Κλειδί: domain για sites, `yt-…` source id για YouTube.
- **Σειρά:** drag & drop στις Ρυθμίσεις (και στις Πηγές). Επηρεάζει τη σειρά ενοτήτων,
  την προτεραιότητα σε ισοπαλία score και τη σελίδα «Πηγές & Στοιχεία».
- **Καραντίνα:** 3 αποτυχίες → παράκαμψη 24 h, με ένδειξη στην κατάσταση πηγών.

---

## Ποιότητα περιεχομένου

- **Διαφημίσεις/sponsored** κόβονται με φίλτρα σε τίτλο και URL
  (`sponsored`, `advertorial`, `home equity`, `cash back`, προσφορές, `/promo/` κ.λπ.).
- Ό,τι μυρίζει προσφορά αλλά έχει σώμα κειμένου **δεν** μπαίνει σε κάρτα ενότητας.
- Έλεγχος: `python run.py --check-quality` → ads, χωρίς σώμα, source≠domain.
- Κάθε θέμα κρατά **τη σωστή πηγή**: το URL και το όνομα πηγής αλλάζουν μαζί.

---

## Εμφάνιση φύλλου

Όλα στο `settings.json → theme` και στην οθόνη **Ρυθμίσεις → Εμφάνιση φύλλου**:

| Ρύθμιση | Τιμές | Τι κάνει |
|---|---|---|
| `preset` | `light` / `dark` / `color` | σέπια, νυχτερινό, λευκό+χρώμα |
| `font_scale` | 0.90 – 1.15 | κλιμακώνει όλα τα κείμενα |
| `photos` | `sepia` / `color` | ασπρόμαυρες vintage ή έγχρωμες |
| `accent` | hex | κόκκινο/χρωματιστό accent |

Η εφαρμογή έχει δικό της **Dark/Light** toggle (κάτω αριστερά), ανεξάρτητο από το φύλλο.

Το PDF ακολουθεί τις ίδιες ρυθμίσεις.

---

## Διαγραφή παλαιών φύλλων

Από **Ιστορικό → Διαγραφή παλαιών** (κράτα Ν ημέρες, με επιβεβαίωση `ΔΙΑΓΡΑΦΗ`),
ή `×` σε κάθε κάρτα για μία ημέρα.

```powershell
python run.py --cleanup --keep 7 --dry-run
python run.py --cleanup --keep 7 --cache --yes
python run.py --cleanup --before 2026-10-01 --yes
python run.py --delete-date 2026-10-29
```

Ποτέ δεν διαγράφεται το σημερινό· `health.json`, `settings.json`, `sites.txt`,
`translations.json`, `feeds.json` μένουν πάντα.

Αν έχει οριστεί **Φάκελος PDF** στις ρυθμίσεις, ο καθαρισμός σβήνει και τα
`efimerida-<ημερομηνία>.pdf` εκεί (ίδιοι κανόνες ημερών, με προεπισκόπηση πρώτα).
Άλλα PDF στον φάκελο δεν αγγίζονται.

---

## Γλώσσα

- **Τα αγγλικά μένουν αγγλικά** (τίτλος + κείμενο), με ένδειξη `EN`. Καμία κλήση μεταφραστή.
- Οι ελληνικές πηγές μένουν ελληνικά.
- Αν θέλεις μετάφραση: `language.translate_english: true` στο `settings.json`
  (ή `--translate-english`).
- Έλεγχος: `python run.py --check-language`.

---

## Εντολές

| Εντολή | Τι κάνει |
|---|---|
| `python run.py --today` | σημερινό φύλλο (HTML) |
| `python run.py --today --pdf` | και PDF |
| `python run.py --date 2026-10-28` | άλλη ημερομηνία |
| `python run.py --today --offline` | από cache |
| `python run.py --today --no-articles` | χωρίς λήψη άρθρων |
| `python run.py --today --no-images` | χωρίς φωτογραφίες |
| `python run.py --today --no-translate` | χωρίς μετάφραση |
| `python run.py --check-sources` | διαγνωστικό όλων |
| `python run.py --check-source <url>` | δοκιμή μίας πηγής |
| `python run.py --check-quality` | διαφημίσεις / ποιότητα |
| `python run.py --check-language` | γλωσσική συνέπεια |
| `python run.py --today --json-progress` | JSON γραμμές προόδου (για UI) |
| `python qa.py --date 2026-10-29` | PNG ανά σελίδα (απαιτεί PDF) |

---

## Desktop εφαρμογή (Electron)

```powershell
cd app
npm install
npm start          # dev
```

Οθόνες:

1. **Σημερινό φύλλο** — «Νέο φύλλο», μπάρα προόδου ανά στάδιο, αναγνώστης με zoom/fit.
   Οι ειδήσεις ανοίγουν **μέσα στην εφαρμογή**· η μπάρα δείχνει το domain και το
   **← Πίσω** επιστρέφει **πάντα στο φύλλο** (ποτέ σε προηγούμενη εξωτερική σελίδα).
   **Full screen (F11)** για ανάγνωση χωρίς chrome, με πλωτή μπάρα: **← Πίσω** (μένει μόνιμα
   ορατή όταν ανοίγει site), zoom, **Εκτύπωση (Ctrl+P)** και **Esc** για έξοδο.
   Υπάρχει επίσης μόνιμο κουμπί **✕ Exit** πάνω δεξιά σε **κάθε** οθόνη, ώστε να βγαίνεις
   εύκολα από το fullscreen ακόμη και από τις Ρυθμίσεις ή το Ιστορικό.
2. **Ιστορικό** — όλα τα φύλλα με θέματα, κάλυψη, ads που κόπηκαν.
3. **Πηγές** — προσθήκη/διαγραφή, κατάσταση, «Δοκιμή» και σειρά πηγών.
4. **Ρυθμίσεις** — τίτλος, **ενότητες ανά πηγή** (σειρά, βάρος, σελίδες), όρια λέξεων,
   χρώματα, PDF, Python path, **ώρα αυτόματης έκδοσης** (Windows Task Scheduler).

Κουμπιά: **Εκτύπωση** (παράγει το σωστό PDF και το ανοίγει σε προεπισκόπηση —
εκτύπωση/αποθήκευση από τα εικονίδια του viewer), **PDF** (εξαγωγή μέσω Electron,
χωρίς Chrome), **Browser** (άνοιγμα σε browser), **⛶ / F11** (πλήρης οθόνη).

Η διεπαφή είναι διαθέσιμη σε **Αγγλικά (προεπιλογή)** και **Ελληνικά**· αλλάζει με το
κουμπί **ΕΛ / EN** κάτω αριστερά και απομνημονεύεται. Το περιεχόμενο του φύλλου
δεν αλλάζει γλώσσα — μεταφράζεται μόνο το μενού και οι οθόνες της εφαρμογής.

Η εφαρμογή μιλάει με το Python μέσω `--json-progress`, οπότε δεν χρειάζεται server.

---

## Αυτόνομος installer (χωρίς Python)

```powershell
cd app
npm run pipeline     # PyInstaller → pipeline-dist\hmerisia\hmerisia.exe
npm run dist         # electron-builder → app\dist\Hmerisia-Setup-1.1.1.exe
```

- **Μέγεθος:** ~123 MB
- **Εικονίδιο:** διπλωμένη εφημερίδα (κρεμ/μελάνι), σε Setup/συντόμευση/taskbar
- **Δεν απαιτεί Python** — το pipeline είναι ενσωματωμένο (`resources\pipeline`)
- **Εγκατάσταση:** per-user, χωρίς admin, με επιλογή φακέλου
- **Δεδομένα χρήστη:** `%APPDATA%\hmerisia-desktop` (settings, sites, cache, output)
- **Πρώτη εκκίνηση:** αντιγράφονται αρχικά `sites.txt` και `settings.json` από τα seeds
- **Χωρίς code signing** → το Windows SmartScreen θα προειδοποιήσει:
  «More info → Run anyway»
- Η αυτόματη έκδοση γράφει `run-daily.cmd` στο data dir και το Task Scheduler
  καλεί αυτό (με `HMERISIA_DATA`), ώστε να δουλεύει και εγκατεστημένο.

---

## Καθημερινή αυτόματη έκδοση

```powershell
powershell -ExecutionPolicy Bypass -File newspaper\schedule.ps1
powershell -ExecutionPolicy Bypass -File newspaper\schedule.ps1 -At 06:30 -RunNow
powershell -ExecutionPolicy Bypass -File newspaper\schedule.ps1 -Remove
```

Χωρίς `-At`, το script διαβάζει την ώρα από το `settings.json` (`schedule.at`) —
έτσι η εφαρμογή είναι η μόνη πηγή αλήθειας. Με `schedule.enabled = false`
η εργασία αφαιρείται αυτόματα.

Η εργασία `HmerisiaDaily` τρέχει το `run-daily.cmd` (→ `resources\pipeline\hmerisia.exe --today`),
χωρίς να χρειάζεται Python ούτε ανοιχτή εφαρμογή.

---

## Οδηγός χρήστη (site)

Ο οδηγός για τον χρήστη είναι φτιαγμένος με **MkDocs + Material** και ζει στο `docs/`.

```powershell
python -m mkdocs build --strict   # παράγει το site\ (ανοίγει με διπλό κλικ στο site\index.html)
python -m mkdocs serve            # προεπισκόπηση στο http://127.0.0.1:8000
```

- Πηγή: `docs\*.md` · εικόνες: `docs\assets\` (πραγματικά screenshots από την εφαρμογή)
- Έτοιμο site: `site\index.html` — χωρίς server· **η αναζήτηση λειτουργεί μόνο με `mkdocs serve`**
  (σε `file://` κρύβεται αυτόματα).
- `use_directory_urls: false` ώστε όλοι οι σύνδεσμοι να δουλεύουν από τον δίσκο.

---

## Χρόνοι

| | Χρόνος | Μέγεθος |
|---|---|---|
| Πρώτη εκτέλεση | 60–140 s | HTML ~1 MB + assets |
| Με cache | 20–40 s | |

---

## Αρχεία

```
PROMPT.md · README.md · sites.txt · sources.json · settings.json · requirements.txt
newspaper/
├── run.py            orchestrator + CLI
├── settings.py       φόρτωση/αποθήκευση settings.json
├── config.py         παράγωγα των settings
├── collect.py        RSS/JSON-LD/Jina/GoogleNews/Chrome + discovery
├── youtube.py        κανάλια, transcripts, extractive περίληψη
├── articles.py       εξαγωγή κειμένου (trafilatura)
├── normalize.py      καθαρισμός, ads, dedupe, source alignment
├── rank.py           classify, importance, σελιδοποίηση
├── lang.py           ελληνικά/αγγλικά/μείξη
├── translate.py      μετάφραση με έλεγχο γλώσσας + cache
├── images.py         επιλογή & sepia επεξεργασία
├── health.py         health.json
├── build.py          Jinja render + προαιρετικό PDF + QR
├── qa.py             PDF → PNG
├── schedule.ps1      Task Scheduler
└── templates/
app/
├── main.js           Electron main + IPC + printToPDF
├── preload.js        contextBridge API
├── i18n.js           λεξικό ΕΛ/EN για τη διεπαφή
├── index.html        UI
├── styles.css
└── renderer.js
```

---

## Περιορισμοί

- **BBC images** 403 → πλάκα «ΑΡΧΕΙΟΝ».
- **Google News links** χωρίς κείμενο/εικόνα → τίτλος + πλάκα.
- **YouTube transcripts** ανεπίσημο API → fallback στην περιγραφή.
- **Paywall/login** δεν παρακάμπτονται.
- Τα `.ps1` πρέπει να είναι UTF-8 **με BOM**.

---

## Περιεχόμενο

Ο κώδικας είναι ελεύθερος. Κείμενα, φωτογραφίες και βίντεο ανήκουν στις πηγές και
τους δημιουργούς τους· το φύλλο αποδίδει περιλήψεις και παραπέμπει πάντα σε αυτούς.
