import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { paper } from "@/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: paper.bg },
          headerTintColor: paper.ink,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: paper.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: "Ρυθμίσεις" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
