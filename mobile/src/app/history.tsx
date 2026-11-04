import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, Stack } from "expo-router";
import { listEditions, type EditionSummary } from "@/lib/editionDb";
import { paper } from "@/theme";

export default function HistoryScreen() {
  const [rows, setRows] = useState<EditionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listEditions()
        .then((editions) => {
          if (active) setRows(editions);
        })
        .catch((err) => {
          if (active) {
            setError(err instanceof Error ? err.message : String(err));
            setRows([]);
          }
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Ιστορικό" }} />
      {rows === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={paper.accent} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Δεν υπάρχουν αποθηκευμένες εκδόσεις</Text>
              <Text style={styles.emptyBody}>
                Δημιούργησε μια έκδοση από την αρχική — αποθηκεύεται αυτόματα.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(`/edition?date=${item.date}`)}
            >
              <View style={styles.dateBox}>
                <Text style={styles.dateDay}>{item.date.slice(8, 10)}</Text>
                <Text style={styles.dateMonth}>{item.date.slice(5, 7)}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.meta}>
                  {item.date} · {item.pages} σελ. · {item.items} θέματα
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: paper.bg },
  center: { alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  list: { padding: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: paper.line,
  },
  rowPressed: { opacity: 0.7 },
  dateBox: {
    width: 46,
    height: 52,
    backgroundColor: paper.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: { color: paper.white, fontSize: 20, fontWeight: "800", lineHeight: 22 },
  dateMonth: { color: paper.white, fontSize: 10, letterSpacing: 1 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "700", color: paper.ink },
  meta: { fontSize: 11, color: paper.inkSoft, marginTop: 3 },
  chevron: { fontSize: 24, color: paper.inkSoft },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: paper.ink, textAlign: "center" },
  emptyBody: { fontSize: 13, color: paper.inkSoft, textAlign: "center" },
  error: { color: paper.accent, fontSize: 12, padding: 12 },
});
