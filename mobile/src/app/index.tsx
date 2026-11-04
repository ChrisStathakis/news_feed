import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import { paper } from "@/theme";
import { runEditionDemo, type DemoResult } from "@/lib/runDemo";
import { getLatestEdition } from "@/lib/editionStore";
import { saveEdition } from "@/lib/editionDb";
import { loadHealth, saveHealth } from "@/lib/healthDb";
import { DomFetcher, type DomFetcherHandle } from "@/components/DomFetcher";
import { resolveLocalImages } from "@/lib/localImages";

const greekDate = new Intl.DateTimeFormat("el-GR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Athens",
});

export default function HomeScreen() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ message: string; percent: number } | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const domRef = useRef<DomFetcherHandle>(null);

  const generate = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress({ message: "Ξεκινά…", percent: 0 });
    try {
      const health = await loadHealth();
      const next = await runEditionDemo(
        (message, percent) => setProgress({ message, percent }),
        {
          health,
          renderHtml: (url) =>
            domRef.current?.fetchHtml(url) ?? Promise.resolve(null),
          resolveImages: resolveLocalImages,
        },
      );
      setResult(next);
      saveHealth(next.health).catch(() => {});
      const stored = getLatestEdition();
      if (stored) {
        saveEdition(stored).catch(() => {
          // The edition still works in-memory even if the archive write fails.
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <DomFetcher ref={domRef} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.masthead}>
          <Text style={styles.kicker}>ΚΑΘΗΜΕΡΙΝΗ ΕΚΔΟΣΗ</Text>
          <Text style={styles.title}>Η Ημερήσια</Text>
          <Text style={styles.date}>{greekDate.format(new Date())}</Text>
          <View style={styles.rule} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>On-device engine</Text>
          <Text style={styles.cardBody}>
            Συλλογή από τις πηγές, normalize, dedupe, ranking και σελιδοποίηση — όλα
            σε JavaScript, χωρίς Python και χωρίς server. Πρώτο end-to-end slice.
          </Text>
          <Pressable
            onPress={generate}
            disabled={running}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              running && styles.buttonDisabled,
            ]}
          >
            {running ? (
              <ActivityIndicator color={paper.white} />
            ) : (
              <Text style={styles.buttonText}>
                {result ? "Ξανά έκδοση" : "Δοκιμαστική έκδοση"}
              </Text>
            )}
          </Pressable>
          {progress ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${progress.percent}%` }]} />
              </View>
              <Text style={styles.progressText}>{progress.message}</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {result ? (
          <>
            <Pressable
              onPress={() => router.push("/edition")}
              style={({ pressed }) => [
                styles.readButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.readButtonText}>Ανάγνωση έκδοσης →</Text>
            </Pressable>

            <View style={styles.statsRow}>
              <Stat label="Θέματα" value={String(result.edition.numbers.total)} />
              <Stat
                label="Σελίδες"
                value={String(
                  getLatestEdition()?.payload.total_pages ?? result.edition.pages.length + 1,
                )}
              />
              <Stat label="Μ. όρος" value={String(result.edition.numbers.avg_score)} />
            </View>

            {result.edition.lead ? (
              <View style={styles.leadCard}>
                <Text style={styles.sectionLabel}>ΚΥΡΙΟ ΘΕΜΑ</Text>
                <Text style={styles.leadTitle}>{result.edition.lead.title}</Text>
                {result.edition.lead.summary ? (
                  <Text style={styles.leadSummary}>{result.edition.lead.summary}</Text>
                ) : null}
                <Text style={styles.meta}>
                  {result.edition.lead.source_name} · {result.edition.lead.local_time}
                </Text>
              </View>
            ) : null}

            <Text style={styles.sectionHeading}>Σελίδες</Text>
            {result.edition.pages.map((page) => (
              <View key={`${page.key}-${page.num}`} style={styles.pageRow}>
                <View style={styles.pageNum}>
                  <Text style={styles.pageNumText}>{page.num}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pageTitle}>{page.label_el}</Text>
                  <Text style={styles.meta}>
                    {page.section_page}/{page.section_pages} · {page.stories.length + (page.featured ? 1 : 0)} θέματα
                  </Text>
                </View>
              </View>
            ))}

            <Text style={styles.sectionHeading}>Πηγές</Text>
            <View style={styles.report}>
              {result.report.map((entry) => (
                <View key={entry.source} style={styles.reportRow}>
                  <Text style={styles.reportSource}>{entry.source}</Text>
                  <Text style={styles.reportCount}>
                    {entry.count} · {entry.method}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionHeading}>Πρώτα θέματα</Text>
            {result.items.slice(0, 8).map((item) => (
              <Pressable
                key={item.id}
                style={styles.item}
                onPress={() => Linking.openURL(item.url)}
              >
                <Text style={styles.itemScore}>{item.score.toFixed(1)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.meta}>
                    {item.source_name} · {item.local_time}
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        ) : null}

        <View style={styles.footer}>
          <Link href="/history" style={styles.footerLink}>
            Ιστορικό εκδόσεων
          </Link>
          <Link href="/settings" style={styles.footerLink}>
            Ρυθμίσεις & κατάσταση engine
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper.bg },
  content: { padding: 18, paddingBottom: 48 },
  masthead: { alignItems: "center", marginBottom: 16 },
  kicker: { fontSize: 10, letterSpacing: 2, color: paper.accent, fontWeight: "700" },
  title: { fontSize: 40, fontWeight: "800", color: paper.ink, letterSpacing: -1 },
  date: { fontSize: 12, color: paper.inkSoft, textTransform: "capitalize" },
  rule: { height: 3, backgroundColor: paper.ink, alignSelf: "stretch", marginTop: 10 },
  card: {
    backgroundColor: paper.white,
    borderWidth: 1,
    borderColor: paper.line,
    padding: 16,
    marginBottom: 18,
  },
  cardTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 1, color: paper.navy },
  cardBody: { fontSize: 13, lineHeight: 19, color: paper.inkSoft, marginTop: 6 },
  button: {
    backgroundColor: paper.accent,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 14,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: paper.white, fontWeight: "700", letterSpacing: 0.5 },
  progressWrap: { marginTop: 12 },
  progressTrack: { height: 4, backgroundColor: paper.bgDeep },
  progressBar: { height: 4, backgroundColor: paper.navy },
  progressText: { fontSize: 11, color: paper.inkSoft, marginTop: 6 },
  error: { color: paper.accent, fontSize: 12, marginTop: 10 },
  readButton: {
    backgroundColor: paper.ink,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 14,
  },
  readButtonText: { color: paper.white, fontWeight: "800", letterSpacing: 0.5 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  stat: {
    flex: 1,
    backgroundColor: paper.bgDeep,
    paddingVertical: 12,
    alignItems: "center",
  },
  statValue: { fontSize: 22, fontWeight: "800", color: paper.ink },
  statLabel: { fontSize: 10, letterSpacing: 1, color: paper.inkSoft, marginTop: 2 },
  leadCard: {
    borderTopWidth: 4,
    borderBottomWidth: 1,
    borderColor: paper.ink,
    paddingVertical: 14,
    marginBottom: 20,
  },
  sectionLabel: { fontSize: 10, letterSpacing: 2, color: paper.accent, fontWeight: "800" },
  leadTitle: { fontSize: 24, lineHeight: 29, fontWeight: "800", color: paper.ink, marginTop: 6 },
  leadSummary: { fontSize: 14, lineHeight: 20, color: paper.inkSoft, marginTop: 8 },
  meta: { fontSize: 11, color: paper.inkSoft, marginTop: 4 },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    color: paper.navy,
    marginTop: 10,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: paper.line,
    paddingBottom: 4,
  },
  pageRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 12 },
  pageNum: {
    width: 34,
    height: 34,
    backgroundColor: paper.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  pageNumText: { color: paper.white, fontWeight: "800" },
  pageTitle: { fontSize: 14, fontWeight: "700", color: paper.ink },
  report: { borderTopWidth: 1, borderColor: paper.line },
  reportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: paper.line,
  },
  reportSource: { fontSize: 12, color: paper.ink },
  reportCount: { fontSize: 11, color: paper.inkSoft },
  item: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: paper.line,
  },
  itemScore: { fontSize: 11, fontWeight: "800", color: paper.accent, width: 32 },
  itemTitle: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: paper.ink },
  footer: { marginTop: 28, alignItems: "center", gap: 10 },
  footerLink: { fontSize: 12, color: paper.navy, textDecorationLine: "underline" },
});
