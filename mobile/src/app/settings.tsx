import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { healthRows, loadSettings, runtimeConfig, resolve, loadSources, type HealthState } from "@/engine";
import { SEED_SETTINGS_JSON, SEED_SITES } from "@/lib/seed";
import { loadHealth } from "@/lib/healthDb";
import { paper } from "@/theme";

export default function SettingsScreen() {
  const settings = loadSettings(SEED_SETTINGS_JSON);
  const config = runtimeConfig(settings);
  const sources = loadSources({ sitesText: SEED_SITES, settings });
  const sections = resolve(sources, settings.weights);
  const [health, setHealth] = useState<HealthState>({});

  useEffect(() => {
    let active = true;
    loadHealth().then((data) => {
      if (active) setHealth(data);
    });
    return () => {
      active = false;
    };
  }, []);

  const rows = healthRows(health, sources.map((source) => source.name));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Section title="Έκδοση">
        <Row label="Τίτλος" value={settings.edition.name} />
        <Row label="Ταυτότητα" value={settings.edition.name_en} />
        <Row label="Γλώσσα" value={settings.language.target} />
        <Row
          label="Μετάφραση αγγλικών"
          value={settings.language.translate_english ? "ναι" : "όχι"}
        />
      </Section>

      <Section title="Σελιδοποίηση">
        <Row label="Εξώφυλλο (δευτερεύοντα)" value={String(config.coverSecondary)} />
        <Row label="Πρώτη σελίδα" value={String(config.pageLayout.first_page)} />
        <Row label="Σελίδα πλέγματος" value={String(config.pageLayout.grid_page)} />
        <Row label="Σελίδα video" value={String(config.pageLayout.video_page)} />
        <Row label="Σύντομα" value={String(config.briefsPerPage)} />
      </Section>

      <Section title="Πηγές">
        {sections.map((section) => (
          <Row
            key={section.key}
            label={section.name}
            value={`${section.pages} σελ. · ${section.kind}`}
          />
        ))}
      </Section>

      <Section title="Engine">
        <Row label="Υλοποίηση" value="TypeScript (Hermes)" />
        <Row label="Πηγές" value={String(sources.length)} />
        <Row label="Ενότητες" value={String(sections.length)} />
        <Row label="Timezone" value="Europe/Athens" />
        <Row label="Κατάσταση" value="S3 · health + trends + video" />
      </Section>

      <Section title="Υγεία πηγών">
        {rows.map((row) => (
          <Row
            key={row.name}
            label={row.name}
            value={`${row.status} · ${row.items}`}
          />
        ))}
      </Section>

      <Text style={styles.note}>
        Το parity harness συγκρίνει το JS engine με το Python pipeline σε congelαρισμένα
        δεδομένα. Οι πηγές με 3 συνεχόμενες αποτυχίες μπαίνουν σε καραντίνα 24 ωρών
        και παραλείπονται από την επόμενη έκδοση.
      </Text>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: paper.bg },
  content: { padding: 18, paddingBottom: 48 },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: paper.accent,
    marginBottom: 6,
  },
  sectionBody: { borderTopWidth: 1, borderColor: paper.ink },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: paper.line,
    gap: 12,
  },
  label: { fontSize: 13, color: paper.inkSoft, flexShrink: 1 },
  value: { fontSize: 13, fontWeight: "700", color: paper.ink, textAlign: "right" },
  note: { fontSize: 12, lineHeight: 18, color: paper.inkSoft, marginTop: 4 },
});
