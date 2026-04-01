import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { authApi, jobsApi, MobileJob, MobileUser } from "./src/lib/api";

type Screen = "jobs" | "dashboard";

export default function App() {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [screen, setScreen] = useState<Screen>("jobs");
  const [jobs, setJobs] = useState<MobileJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<(MobileJob & { description?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loadJobs = async () => {
    try {
      const data = await jobsApi.list();
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await authApi.me();
        setUser(me);
        await loadJobs();
      } catch {
        // unauthenticated is expected on first open
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.login(email, password);
      setUser(data.user);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      setUser(null);
      setSelectedJob(null);
      setJobs([]);
      setScreen("jobs");
    }
  };

  const openJob = async (job: MobileJob) => {
    setLoading(true);
    try {
      const details = await jobsApi.get(job.slug);
      setSelectedJob(details);
    } catch {
      setSelectedJob(job);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#059669" />
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.authBox}>
          <Text style={styles.title}>AfriTalent Mobile</Text>
          <Text style={styles.subtitle}>Sign in with your existing account</Text>
          <TextInput
            placeholder="Email"
            style={styles.input}
            value={email}
            autoCapitalize="none"
            onChangeText={setEmail}
          />
          <TextInput
            placeholder="Password"
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.primaryButton} onPress={login}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Welcome, {user.name}</Text>
        <Pressable onPress={logout}>
          <Text style={styles.link}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, screen === "jobs" && styles.tabActive]} onPress={() => setScreen("jobs")}>
          <Text style={[styles.tabText, screen === "jobs" && styles.tabTextActive]}>Jobs</Text>
        </Pressable>
        <Pressable style={[styles.tab, screen === "dashboard" && styles.tabActive]} onPress={() => setScreen("dashboard")}>
          <Text style={[styles.tabText, screen === "dashboard" && styles.tabTextActive]}>Dashboard</Text>
        </Pressable>
      </View>

      {screen === "jobs" ? (
        selectedJob ? (
          <ScrollView style={styles.panel}>
            <Pressable onPress={() => setSelectedJob(null)}>
              <Text style={styles.link}>← Back to jobs</Text>
            </Pressable>
            <Text style={styles.title}>{selectedJob.title}</Text>
            <Text style={styles.meta}>
              {selectedJob.employer?.companyName || selectedJob.sourceName || "Company"} • {selectedJob.location}
            </Text>
            <Text style={styles.meta}>
              {selectedJob.type} • {selectedJob.seniority}
            </Text>
            <Text style={styles.description}>{selectedJob.description || "No description available."}</Text>
          </ScrollView>
        ) : (
          <FlatList
            data={jobs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onRefresh={loadJobs}
            refreshing={false}
            renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => void openJob(item)}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.meta}>
                  {item.employer?.companyName || item.sourceName || "Company"} • {item.location}
                </Text>
                <Text style={styles.meta}>
                  {item.type} • {item.seniority}
                </Text>
              </Pressable>
            )}
          />
        )
      ) : (
        <View style={styles.panel}>
          <Text style={styles.title}>Candidate Dashboard</Text>
          <Text style={styles.description}>
            This Phase 3 scaffold reuses existing APIs. Next additions: push alerts, mock interview playback/feedback,
            application timeline, and ATS-powered employer views.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" },
  authBox: { padding: 20, margin: 20, backgroundColor: "#fff", borderRadius: 12, gap: 10 },
  title: { fontSize: 24, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#475569", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  primaryButton: {
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
  error: { color: "#dc2626", fontSize: 13 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  link: { color: "#059669", fontWeight: "600" },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { backgroundColor: "#ecfdf5" },
  tabText: { color: "#475569", fontWeight: "600" },
  tabTextActive: { color: "#047857" },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 },
  meta: { fontSize: 12, color: "#64748b", marginBottom: 2 },
  panel: { margin: 16, padding: 16, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  description: { fontSize: 14, color: "#334155", marginTop: 10, lineHeight: 20 },
});
