# Η Ημερήσια — mobile (Expo / React Native)

Android app που αντικαθιστά το Python pipeline με TypeScript. Όλη η επεξεργασία
γίνεται on-device· το δίκτυο χρειάζεται μόνο για τη συλλογή ειδήσεων και τη
μετάφραση, όπως και στο desktop.

## Κατάσταση

| Κομμάτι | Κατάσταση |
|---|---|
| Settings / sources / sections | ✅ ported |
| Normalize / dedupe / rank / pagination | ✅ ported + parity tests |
| RSS/Atom, Google News, Jina | ✅ ported |
| Article extraction (Readability + linkedom) | ✅ HTTP + hidden WebView fallback |
| Translation (Google/MyMemory) | ✅ ported |
| On-device demo edition | ✅ `src/lib/runDemo.ts` |
| HTML template / reader (WebView) | ✅ ported από `newspaper.html.j2` |
| PDF | ✅ `expo-print` + share sheet |
| Image enrichment (og:image / JSON-LD) | ✅ |
| Images / QR | ✅ download + resize 640px + base64 (offline) + CSS sepia + SVG QR |
| Vintage duotone/halftone (Skia) | ⏳ επόμενο |
| YouTube (RSS, transcripts, summaries) | ✅ video pages + QR |
| Google Trends (24h, world + country) | ✅ |
| Storage / history (SQLite) | ✅ αυτόματη αποθήκευση + ιστορικό |
| Health / quarantine | ✅ 3 αποτυχίες → 24h καραντίνα |
| Background scheduling 07:00 | ⏳ επόμενο (custom native plugin) |
| APK build (local, χωρίς token) | ✅ `dist/Hmerisia-0.1.0.apk` |

**Παράδειγμα live run:** 11 πηγές → 209 raw θέματα → 160 μετά από dedupe →
15 σελίδες (2 Trends + cover + 10 ενότητες/video + briefs + sources).

Μετά τη δοκιμαστική έκδοση, το κουμπί **«Ανάγνωση έκδοσης»** ανοίγει το πλήρες
φύλλο σε WebView (fit-to-width, pinch zoom) και το **PDF** το εξάγει μέσω
`expo-print` + Android share sheet.

## Δομή

```
src/
  engine/        # καθαρό TS, τρέχει και σε Node (tests/parity)
    settings.ts  config.ts  sources.ts  sections.ts
    normalize.ts rank.ts    text.ts     time.ts
    collect.ts   extract.ts translate.ts
    render/      # payload + HTML template (port του Jinja)
  lib/
    seed.ts      # sites.txt + settings.json του desktop
    runDemo.ts   # collect → normalize → rank → paginate → HTML
    editionStore.ts
  app/           # Expo Router screens (home, edition, settings)
  theme.ts
__tests__/       # Vitest
parity/          # Python-generated golden fixtures
scripts/smoke.ts # live end-to-end smoke test
```

## Commands

```bash
npm install --legacy-peer-deps   # το react-dom peer conflict του Expo 58
npm test                         # parity + unit tests
npm run typecheck
npm run smoke                    # live collection από τα feeds
npx expo start                   # dev server
npx expo export -p android       # bundle check χωρίς native build
```

## Parity harness

Τα fixtures παράγονται από το πραγματικό Python pipeline:

```bash
npm run parity:fixtures
npm test
```

Το `parity/fixtures/parity.json` congelάρει 90 πραγματικά items και το output των
`normalize`, `rank`, `build_edition`. Το test συγκρίνει IDs, σειρά, scores,
source counts, local times και ολόκληρη τη σελιδοποίηση. Τρέχουσα κατάσταση:
**41/41 tests πράσινα**.

## APK — τοπικό build (χωρίς Expo account)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1
adb install -r dist\Hmerisia-0.1.0.apk
```

Το script:

- βρίσκει ή κατεβάζει JDK 17 στο `%LOCALAPPDATA%\hmerisia-tools\jdk17`
- χρησιμοποιεί το Android SDK (`ANDROID_HOME` ή `%LOCALAPPDATA%\Android\Sdk`)
- αναβαθμίζει το ninja του CMake 3.22 σε 1.13+ (αλλιώς αποτυγχάνει σε Windows
  paths >260 χαρακτήρων)
- τρέχει `expo prebuild` μόνο αν λείπει το `android/`
- χτίζει `assembleRelease` και αντιγράφει το APK στο `dist/`

Το APK είναι **debug-signed** (template keystore) — εγκαθίσταται κανονικά σε
τηλέφωνο/emulator, αλλά για Play Store χρειάζεται δικό σου release keystore.

### Expo Build (προαιρετικά)

Αν προτιμάς cloud build, χρειάζεται Expo account/token:

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

Το `eas.json` έχει `preview` profile με `buildType: apk`.

## Γνωστές διαφορές από το Python

- **Extraction:** Readability αντί trafilatura· τα αποτελέσματα είναι κοντά αλλά
  όχι identical. Θα χρειαστούν per-source rules και corpus tests.
- **Images:** γίνεται enrichment (`og:image`, twitter, JSON-LD, πρώτο `<img>`),
  download + resize 640px (`expo-image-manipulator`) και ενσωμάτωση ως **base64
  data URIs** στο HTML. Έτσι οι αποθηκευμένες εκδόσεις διαβάζονται **χωρίς δίκτυο**.
  Το πλήρες vintage duotone/halftone (Pillow parity) μένει για το επόμενο βήμα.
- **QR:** παράγονται ως SVG data URIs για video items.

## Persistence

Κάθε έκδοση αποθηκεύεται αυτόματα σε SQLite (`hmerisia.db`):

- πίνακας `editions` (date, title, html, payload, items, pages, created_at)
- **Ιστορικό** στην αρχική → λίστα εκδόσεων
- άνοιγμα παλιάς έκδοσης με `/edition?date=YYYY-MM-DD`
- το HTML περιέχει και τις εικόνες (base64), άρα δουλεύει **πλήρως offline**
- **JS-heavy sites:** γίνεται πρώτα κανονικό HTTP fetch και, αν το άρθρο βγει
  κενό/φτωχό, ένα κρυφό WebView (`DomFetcher`) φορτώνει το rendered DOM και το
  περνά από τον ίδιο extractor (έως 8 fallbacks ανά έκδοση).
- **YouTube:** υπάρχουν video pages με transcripts/περιγραφές και QR· αν το
  transcript δεν είναι διαθέσιμο, χρησιμοποιείται η περιγραφή.
- **Trends:** 2 σελίδες (παγκόσμιο + χώρα) με cache 1 ώρας.
- **Health:** 3 συνεχόμενες αποτυχίες → `broken` + καραντίνα 24 ωρών· η πηγή
  παραλείπεται από την επόμενη έκδοση. Η κατάσταση φαίνεται στις Ρυθμίσεις.
- **PDF:** γίνεται με `expo-print` (Android WebView print), όχι Chrome.
- **Scheduling:** το Android δεν εγγυάται ακριβή ώρα χωρίς AlarmManager +
  foreground service.

## Επόμενα βήματα

1. Vintage image processing (download + resize/crop + duotone/halftone με Skia).
2. Background 07:00 + notifications.
3. Full parity run και release signing.
