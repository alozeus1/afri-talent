"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Alert {
  id: string;
  title: string;
  description: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
  category: string;
  affectedUsers?: number;
  affectedJobs?: number;
  affectedApps?: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  resolvedAt?: string;
  resolution?: string;
}

interface AlertStats {
  totalActive: number;
  bySeverity: {
    critical: number;
    warning: number;
    info: number;
  };
  resolvedLast24h: number;
  byCategory: Record<string, number>;
}

export default function OpsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ACTIVE");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadAlertsAndStats();
    }
  }, [user, page, filterSeverity, filterStatus]);

  const loadAlertsAndStats = async () => {
    setLoading(true);
    try {
      const [alertsRes, statsRes] = await Promise.all([
        fetch(
          `/api/admin/alerts?page=${page}&limit=20${
            filterSeverity !== "ALL" ? `&severity=${filterSeverity}` : ""
          }${filterStatus ? `&status=${filterStatus}` : ""}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            },
          }
        ),
        fetch("/api/admin/alerts/stats/summary", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
      ]);

      const alertsData = await alertsRes.json();
      const statsData = await statsRes.json();

      setAlerts(alertsData.alerts);
      setStats(statsData);
    } catch (error) {
      console.error("Failed to load alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/admin/alerts/${alertId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ resolution: resolutionText }),
      });

      if (response.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        setResolvingId(null);
        setResolutionText("");
      }
    } catch (error) {
      console.error("Failed to resolve alert:", error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-100 text-red-800";
      case "WARNING":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-red-50 border-red-200";
      case "ACKNOWLEDGED":
        return "bg-yellow-50 border-yellow-200";
      case "RESOLVED":
        return "bg-green-50 border-green-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (!user || user.role !== "ADMIN") return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Platform Operations</h1>
        <p className="text-gray-600">Monitor health, alerts, and system status</p>
      </div>

      {/* Alert Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalActive}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Critical</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{stats.bySeverity.critical}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{stats.bySeverity.warning}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Resolved (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.resolvedLast24h}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alerts List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Active Alerts</CardTitle>
            <div className="flex gap-2">
              <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Severities</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No alerts</div>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`border rounded-lg p-4 space-y-3 ${getStatusColor(alert.status)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex gap-2 items-center mb-1">
                        <Badge className={getSeverityColor(alert.severity)}>
                          {alert.severity}
                        </Badge>
                        <h3 className="font-semibold">{alert.title}</h3>
                      </div>
                      <p className="text-sm text-gray-700">{alert.description}</p>
                    </div>
                    <div className="text-right text-sm text-gray-600">
                      <p>{formatDistanceToNow(new Date(alert.lastOccurredAt), { addSuffix: true })}</p>
                      <Badge variant="outline">{alert.category}</Badge>
                    </div>
                  </div>

                  {(alert.affectedUsers || alert.affectedJobs || alert.affectedApps) && (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {alert.affectedUsers && (
                        <div className="bg-white/50 p-1 rounded">
                          Users: {alert.affectedUsers}
                        </div>
                      )}
                      {alert.affectedJobs && (
                        <div className="bg-white/50 p-1 rounded">
                          Jobs: {alert.affectedJobs}
                        </div>
                      )}
                      {alert.affectedApps && (
                        <div className="bg-white/50 p-1 rounded">
                          Apps: {alert.affectedApps}
                        </div>
                      )}
                    </div>
                  )}

                  {resolvingId === alert.id ? (
                    <div className="space-y-2 bg-white/50 p-3 rounded">
                      <Textarea
                        placeholder="Describe the resolution..."
                        value={resolutionText}
                        onChange={(e) => setResolutionText(e.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleResolveAlert(alert.id)}
                          disabled={!resolutionText}
                        >
                          Confirm Resolve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setResolvingId(null);
                            setResolutionText("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setResolvingId(alert.id)}
                    >
                      Resolve
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
