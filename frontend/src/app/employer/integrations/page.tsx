"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ats, ATSConnection } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Provider = "GREENHOUSE" | "LEVER" | "WORKABLE";

export default function EmployerIntegrationsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [connections, setConnections] = useState<ATSConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    provider: "GREENHOUSE" as Provider,
    externalOrgId: "",
    accessToken: "",
  });

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  const loadConnections = async () => {
    try {
      setLoading(true);
      const data = await ats.listConnections();
      setConnections(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      void loadConnections();
    }
  }, [user]);

  const createConnection = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await ats.createConnection({
        provider: form.provider,
        externalOrgId: form.externalOrgId,
        accessToken: form.accessToken || undefined,
      });
      setForm({ provider: "GREENHOUSE", externalOrgId: "", accessToken: "" });
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add connection");
    } finally {
      setSaving(false);
    }
  };

  const runSync = async (id: string) => {
    setError(null);
    try {
      await ats.syncConnection(id);
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    }
  };

  const disconnect = async (id: string) => {
    setError(null);
    try {
      await ats.disconnectConnection(id);
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">ATS Integrations</h1>
        <p className="mt-2 text-gray-600">
          Connect Greenhouse, Lever, and Workable to sync jobs into AfriTalent.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <Card className="mb-8">
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Add Integration</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={createConnection}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Provider</span>
              <select
                value={form.provider}
                onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value as Provider }))}
                className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm"
              >
                <option value="GREENHOUSE">Greenhouse</option>
                <option value="LEVER">Lever</option>
                <option value="WORKABLE">Workable</option>
              </select>
            </label>
            <Input
              label="Organization Identifier"
              placeholder="e.g. acme"
              value={form.externalOrgId}
              onChange={(e) => setForm((prev) => ({ ...prev, externalOrgId: e.target.value }))}
            />
            <Input
              label="Access Token (optional for Greenhouse/Lever)"
              placeholder="Optional"
              value={form.accessToken}
              onChange={(e) => setForm((prev) => ({ ...prev, accessToken: e.target.value }))}
            />
            <div className="md:col-span-3">
              <Button type="submit" disabled={saving || !form.externalOrgId.trim()}>
                {saving ? "Saving..." : "Connect ATS"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Connected Providers</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-600" />
            </div>
          ) : connections.length === 0 ? (
            <p className="text-sm text-gray-600">No ATS connections yet.</p>
          ) : (
            <div className="space-y-4">
              {connections.map((connection) => (
                <div key={connection.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {connection.provider} • {connection.externalOrgId}
                      </p>
                      <p className="text-sm text-gray-500">
                        Status: {connection.status} • Last synced: {connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "Never"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => runSync(connection.id)}>
                        Sync Jobs
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => disconnect(connection.id)}>
                        Disconnect
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
