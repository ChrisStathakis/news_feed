import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { getLatestEdition, type StoredEdition } from "@/lib/editionStore";
import { loadEdition } from "@/lib/editionDb";
import { paper } from "@/theme";

const PAGE_WIDTH = 1240;

export default function EditionScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const requestedDate = typeof params.date === "string" ? params.date : undefined;
  const [edition, setEdition] = useState<StoredEdition | null>(() => {
    const latest = getLatestEdition();
    if (!requestedDate) return latest;
    return latest?.date === requestedDate ? latest : null;
  });
  const loadingArchive = Boolean(requestedDate && edition?.date !== requestedDate);
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestedDate) return;
    if (edition?.date === requestedDate) return;
    let active = true;
    loadEdition(requestedDate)
      .then((stored) => {
        if (active) setEdition(stored);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [requestedDate, edition?.date]);

  const html = useMemo(() => {
    if (!edition) return "";
    const scale = Math.min(1, width / PAGE_WIDTH);
    const mobileCss = `<style>
      @media screen {
        html, body { background: #6b6354; }
        body { zoom: ${scale.toFixed(4)}; }
        img { filter: sepia(.55) contrast(.95) saturate(.85); }
        .qr { filter: none; }
      }
    </style>`;
    return edition.html.replace("</head>", `${mobileCss}</head>`);
  }, [edition, width]);

  if (loadingArchive) {
    return (
      <View style={styles.empty}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={paper.accent} />
      </View>
    );
  }

  if (!edition) {
    return (
      <View style={styles.empty}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.emptyTitle}>Δεν υπάρχει έκδοση</Text>
        <Text style={styles.emptyBody}>
          Πήγαινε στην αρχική και πάτησε «Δοκιμαστική έκδοση».
        </Text>
        <Link href="/" style={styles.link}>
          ← Πίσω στην αρχική
        </Link>
      </View>
    );
  }

  async function sharePdf() {
    if (!edition) return;
    setBusy(true);
    setError(null);
    try {
      const { uri } = await Print.printToFileAsync({ html: edition.html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Μοιρασμός PDF",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.toolbar}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Έκδοση</Text>
        <View style={styles.actions}>
          <Text style={styles.meta}>
            {edition.payload.total_pages} σελ. ·{" "}
            {String((edition.payload.numbers as Record<string, unknown>).total ?? 0)} θέματα
          </Text>
          <Pressable
            onPress={sharePdf}
            disabled={busy}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            {busy ? (
              <ActivityIndicator color={paper.white} size="small" />
            ) : (
              <Text style={styles.buttonText}>PDF</Text>
            )}
          </Pressable>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <WebView
        source={{ html }}
        style={styles.webview}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        setBuiltInZoomControls
        setDisplayZoomControls={false}
        setSupportZoom
        onShouldStartLoadWithRequest={({ url }) => {
          if (url.startsWith("http://") || url.startsWith("https://")) {
            Linking.openURL(url);
            return false;
          }
          return true;
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={paper.accent} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: paper.bg },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: paper.line,
    backgroundColor: paper.bgDeep,
  },
  title: { fontSize: 16, fontWeight: "800", color: paper.ink },
  back: { width: 32, alignItems: "flex-start" },
  backText: { fontSize: 24, color: paper.ink },
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  meta: { fontSize: 11, color: paper.inkSoft },
  button: {
    backgroundColor: paper.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: paper.white, fontWeight: "700", fontSize: 12 },
  webview: { flex: 1, backgroundColor: paper.bg },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: paper.accent, fontSize: 12, padding: 10 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: paper.ink },
  emptyBody: { fontSize: 13, color: paper.inkSoft, textAlign: "center" },
  link: { fontSize: 13, color: paper.navy, textDecorationLine: "underline", marginTop: 8 },
});
