/**
 * Text cleanup, tokenisation and language detection, ported from
 * newspaper/normalize.py and newspaper/lang.py.
 */

export const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "to", "for", "and", "with", "as", "at",
  "by", "from", "is", "are", "was", "were", "be", "been", "it", "its", "his",
  "her", "their", "this", "that", "after", "over", "into", "about", "new",
  "says", "said", "will", "may", "can", "how", "why", "what", "who",
  "ο", "η", "το", "οι", "τα", "του", "της", "των", "στο", "στη", "στην",
  "και", "με", "για", "από", "που", "να", "θα", "είναι", "ένα", "μια",
  "μετά", "πριν", "νέα", "νέο", "σήμερα",
]);

export const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\uFE0F\u200d]+/gu;

export const TITLE_NOISE: RegExp[] = [
  /\s*[-–|]\s*(CNN Greece|CNN|BBC News|BBC|GameSpot|Yahoo Finance|NBA\.com|NBA|IMDb|EuroLeague)\s*$/i,
  /^(VIDEO|LIVE|WATCH|READ|BREAKING|ΑΠΟΚΛΕΙΣΤΙΚΟ|ΒΙΝΤΕΟ|ΖΩΝΤΑΝΑ|ΔΙΑΒΑΣΤΕ|ΔΕΙΤΕ)\s*[:·-]\s*/i,
];

export const JUNK_TITLE =
  /(cookies? (policy|settings|notice)|privacy policy|sign in|log in|subscribe|newsletter|advertise with us|terms of (use|service)|all rights reserved|follow us|download the app|for more information visit|visit our|click here|read more|accept all|πολιτική (απορρήτου|cookies)|πολιτική μας|περισσότερες πληροφορίες|σύνδεση|εγγραφή|διαφήμιση|αποδοχή όλων|όροι χρήσης|διαβάστε περισσότερα)/i;

export const MATCH_LISTING =
  /(\b\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s*$)|(\bvs\.?\s+.+\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})|(\b(Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου)\s+\d{1,2},\s+\d{4})/i;

export const STALE_TITLE = /\b(?:of|in|into|for|του|για το)\s+(20\d{2})\b/i;

export const AD_HARD =
  /(sponsored|advertorial|paid post|partner content|native ad|διαφήμιση|χορηγούμενο|καταχώρηση)/i;
export const AD_URL = /\/(sponsored|partner|advertorial|offers|deals|promo)(\/|$)/i;
export const AD_OFFER =
  /(home equity|refinance|personal loan|insurance quote|cash back|credit card interest|avoid .{0,20}interest|0% intro apr|intro apr|balance transfer|turn your .{0,40}into|best .{0,30}card|αναχρηματοδότηση|προσωπικό δάνειο)/i;
export const AD_SOFT = /(credit card|offer ends|πιστωτική κάρτα|δάνειο|προσφορά)/i;

export const GENERIC_TITLES = new Set([
  "euroleague basketball", "nba news", "nba.com", "imdb", "bbc news", "cnn",
  "latest news", "top stories", "news", "home", "sports", "culture",
]);

export function normalizeText(text: string | null | undefined): string {
  let value = (text || "").normalize("NFKC").replace(/\u00a0/g, " ");
  value = value.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  value = value.replace(/\]\([^)]*\)/g, "");
  return value.replace(/\s+/g, " ").trim();
}

export function cleanTitle(title: string | null | undefined): string {
  let value = normalizeText(title);
  for (const pattern of TITLE_NOISE) {
    value = value.replace(pattern, "");
  }
  value = value.replace(/#\w+/g, "");
  value = value.replace(EMOJI_RE, "");
  value = value.replace(/\s{2,}/g, " ");
  return value.replace(/^[ \-–|·]+|[ \-–|·]+$/g, "").trim();
}

export function tokens(title: string): Set<string> {
  const value = (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "");
  const words = value.match(/[a-zα-ω0-9]{3,}/g) || [];
  return new Set(words.filter((word) => !STOPWORDS.has(word)));
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/* ------------------------------------------------------------------ language */

const GREEK_RE = /[\u0370-\u03ff\u1f00-\u1fff]/g;
const LATIN_RE = /[A-Za-z]/g;
const TOKEN_RE = /[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ0-9'’\-]+/g;

const EL_THRESHOLD = 0.58;
const EN_THRESHOLD = 0.22;
const LONG_LATIN_RUN = 6;

const FOREIGN_TAGS =
  /\s*\((?:Αποκλειστικό|Αποκλειστική|Αποκλειστικά|Exclusive|Video|VIDEO|Photos|Φωτογραφίες|Live|LIVE|Update|Ενημέρωση)\)\s*/gi;

export function letters(text: string | null | undefined): [number, number] {
  const value = text || "";
  return [(value.match(GREEK_RE) || []).length, (value.match(LATIN_RE) || []).length];
}

export function greekRatio(text: string | null | undefined): number {
  const [greek, latin] = letters(text);
  const total = greek + latin;
  return total ? greek / total : 0;
}

function runs(text: string | null | undefined): [number, number] {
  let bestLatin = 0;
  let bestGreek = 0;
  let curLatin = 0;
  let curGreek = 0;
  for (const token of (text || "").match(TOKEN_RE) || []) {
    const hasGreek = /[\u0370-\u03ff\u1f00-\u1fff]/.test(token);
    const hasLatin = /[A-Za-z]/.test(token);
    if (hasLatin && !hasGreek) {
      curLatin += 1;
      curGreek = 0;
    } else if (hasGreek && !hasLatin) {
      curGreek += 1;
      curLatin = 0;
    } else {
      continue;
    }
    bestLatin = Math.max(bestLatin, curLatin);
    bestGreek = Math.max(bestGreek, curGreek);
  }
  return [bestLatin, bestGreek];
}

export type TextLanguage = "el" | "en" | "mixed" | "none";

export function classifyLanguage(text: string | null | undefined): TextLanguage {
  const clean = (text || "").trim();
  if (clean.length < 2) return "none";
  const [greek, latin] = letters(clean);
  if (greek + latin < 3) return "none";
  const ratio = greek / (greek + latin);
  const [latinRun, greekRun] = runs(clean);
  if (ratio <= EN_THRESHOLD && greekRun < 2) return "en";
  if (ratio >= EL_THRESHOLD && latinRun < LONG_LATIN_RUN) return "el";
  return "mixed";
}

export const isGreek = (text: string | null | undefined): boolean =>
  classifyLanguage(text) === "el";
export const isEnglish = (text: string | null | undefined): boolean =>
  classifyLanguage(text) === "en";

export function stripForeignTag(text: string | null | undefined): string {
  return (text || "")
    .replace(FOREIGN_TAGS, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[ \-–|·]+|[ \-–|·]+$/g, "")
    .trim();
}

export function cleanGloss(text: string | null | undefined): string {
  const value = (text || "").trim();
  if (!value.includes(" | ")) return value;
  const [head, tail] = value.split(" | ", 2);
  if (head.split(/\s+/).length >= 5 && tail.split(/\s+/).length <= 4) {
    return head.trim();
  }
  return value;
}

export function acceptLanguage(text: string, target: "el" | "en" = "el"): boolean {
  return classifyLanguage(text) === target;
}
