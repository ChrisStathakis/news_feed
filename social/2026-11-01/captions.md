# Η ΗΜΕΡΗΣΙΑ — social kit 2026-11-01

## Τι περιέχει

| Αρχείο | Χρήση |
|---|---|
| `video/instagram-reels-1080x1920.mp4` | Instagram Reels — 9:16, 24.5s |
| `video/facebook-reels-1080x1920.mp4` | Facebook Reels — 9:16, 24.5s |
| `video/instagram-reels.srt` | Υπότιτλοι Instagram |
| `video/facebook-reels.srt` | Υπότιτλοι Facebook |
| `images/01-cover.png` … `05-features.png` | 5 εικόνες 4:5, 1080×1350 |
| `scenes/` | Τα 7 καρέ κάθε video (χρήσιμα για covers/thumbnails) |
| `source/` | Νέα screenshots από την εφαρμογή |

Όλα τα κείμενα είναι **ελληνικά**. Δεν υπάρχει URL ή QR — παντού **«Link in bio»**.

---

## Instagram Reels

**Caption**

Η εφημερίδα σου. Κάθε πρωί. Αυτόματα. 📰

Sites & YouTube → συλλογή, μετάφραση, εικόνες, σελιδοποίηση.
Ελληνικά ή αγγλικά, Light ή Dark, fullscreen με έξοδο.

👉 Link in bio.

#ΗΗΜΕΡΗΣΙΑ #εφημερίδα #ειδήσεις #αυτόματηέκδοση #desktopapp #greektools #news #automation

**Πρώτο σχόλιο (προαιρετικό)**

Ποια ενότητα διαβάζεις πρώτη; 👇

---

## Facebook Reels

**Caption**

Μία εφημερίδα. Κάθε πρωί. Έτοιμη. 📰

Βάζεις τις πηγές σου μία φορά — sites και YouTube — και το φύλλο συντίθεται αυτόματα: συλλογή, μετάφραση, εικόνες, σελιδοποίηση.

Διάβασέ το όπως θέλεις: ελληνικά ή αγγλικά, Light ή Dark, fullscreen με έξοδο.

👉 Link in bio.

#ΗΗΜΕΡΗΣΙΑ #εφημερίδα #ειδήσεις #αυτόματηέκδοση #greektools

---

## 5 εικόνες — carousel ή standalone

Σειρά carousel: **01 → 02 → 03 → 04 → 05**.

### 01 — Cover
**Caption:** Η εφημερίδα σου. Κάθε πρωί. Αυτόματα. 📰  
**Alt text:** Κρεμ αφίσα με τίτλο «Η εφημερίδα σου. Έτοιμη.» και φωτογραφία πρωτοσέλιδου εφημερίδας.

### 02 — Πηγές
**Caption:** Βάλε τις πηγές σου μία φορά. Sites & YouTube. Από εκεί και πέρα, το φύλλο φτιάχνεται μόνο του.  
**Alt text:** Οθόνη «Πηγές» της εφαρμογής με λίστα από sites και κανάλια YouTube.

### 03 — Πώς φτιάχνεται
**Caption:** Από την πηγή στο φύλλο. Συλλογή · Μετάφραση · Εικόνες · Σελιδοποίηση. Όλα αυτόματα.  
**Alt text:** Οθόνη έκδοσης με μπάρα προόδου 64% και τα τέσσερα βήματα της διαδικασίας.

### 04 — Αποτέλεσμα
**Caption:** 20 σελίδες. Έτοιμες. Ενότητες, φωτογραφίες και πηγές — όπως σε ένα κανονικό φύλλο.  
**Alt text:** Πρωτοσέλιδο εφημερίδας με τίτλο ειδήσεων, φωτογραφία και πλαϊνές στήλες.

### 05 — Features + CTA
**Caption:** Διάβασε όπως θέλεις. Ελληνικά / Αγγλικά · Light / Dark · Fullscreen με ✕ Exit. 👉 Link in bio.  
**Alt text:** Fullscreen οθόνη ανάγνωσης με κουμπί εξόδου, μαζί με insets για γλώσσα, light/dark θέμα και έξοδο.

---

## Upload checklist

### Instagram Reels
- [ ] Ανέβασε `video/instagram-reels-1080x1920.mp4` ως Reel.
- [ ] Πρόσθεσε μουσική μέσα από Instagram (το αρχείο είναι σκόπιμα χωρίς ήχο).
- [ ] Cover: `scenes/ig/01.png` ή `images/01-cover.png`.
- [ ] Επικόλλησε το παραπάνω caption — **χωρίς URL**, μόνο «Link in bio».
- [ ] Έλεγξε ότι το «Link in bio» είναι ενεργό στο προφίλ.

### Facebook Reels
- [ ] Ανέβασε `video/facebook-reels-1080x1920.mp4`.
- [ ] Πρόσθεσε μουσική μέσα από Facebook.
- [ ] Cover: `scenes/fb/01.png` ή `images/01-cover.png`.
- [ ] Caption Facebook — **χωρίς URL**, μόνο «Link in bio».

### Feed / Carousel
- [ ] Ανέβασε τις 5 εικόνες με σειρά `01 → 05`.
- [ ] Χρησιμοποίησε το αντίστοιχο caption/alt text.
- [ ] Κράτησε τα 4:5 (1080×1350) — μην τα κropάρεις σε 1:1.

---

## Τεχνικά

- Video: **1080×1920**, 9:16, **25 fps**, **H.264 High**, `yuv420p`, `faststart`, **χωρίς audio**.
- Διάρκεια: **24.5s**.
- Εικόνες: **1080×1350**, 4:5, PNG.
- Υπότιτλοι: burned-in ελληνικά + `.srt` για όποια πλατφόρμα τους ζητήσει.
- Safe areas: τα βασικά κείμενα/CTA μένουν πάνω από το κάτω UI των Reels.

## Επαναδημιουργία

```powershell
node social\tools\capture.js
python social\tools\make_assets.py
```

- `capture.js` ανοίγει την εφαρμογή με προσωρινό profile, γυρίζει σε **ελληνικά + light theme**, τραβάει screenshots και επαναφέρει τις ρυθμίσεις.
- `make_assets.py` συνθέτει εικόνες/scenes και κάνει encode τα δύο MP4 με ffmpeg.
