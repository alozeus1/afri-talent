"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

interface Alert {
    id: string;
    title: string;
    description: string;
    severity: "CRITICAL" | "WARNING" | "INFO";
    status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
    category: string;
    firstOccurredAt: string;
    lastOccurredAt: string;
    resolvedAt?: string;
    resolution?: string;
}

export default function OpsPage() {
    const router = useRouter();
    const { user, isLoading } = useAuth();
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState("ACTIVE");

    useEffect(() => {
        if (!isLoading && (!user || user.role !== "ADMIN")) {
            router.push("/login");
        }
    }, [user, isLoading, router]);

    useEffect(() => {
        if (user?.role === "ADMIN") {
            loadAlerts();
        }
    }, [user, filterStatus]);

    const loadAlerts = async () => {
        setLoading(true);
        try {
            const response = await fetch(
                `/api/admin/alerts?status=${filterStatus}`,
                {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                    },
                }
            );
            const data = await response.json();
            setAlerts(data.alerts || []);
        } catch (error) {
            console.error("Failed to load alerts:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleResolveAlert = async (alertId: string, resolution: string) => {
        try {
            await fetch(`/api/admin/alerts/${alertId}/resolve`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ resolution }),
            });
            loadAlerts();
        } catch (error) {
            console.error("Failed to resolve alert:", error);
        }
    };

    if (isLoading) return <div>Loading...</div>;
    if (!user || user.role !== "ADMIN") return null;

    const severityColors: Record<string, string> = {
        CRITICAL: "danger",
        WARNING: "warning",
        INFO: "info",
    };

    const statusColors: Record<string, string> = {
        ACTIVE: "danger",
        ACKNOWLEDGED: "warning",
        RESOLVED: "success",
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Platform Operations</h1>
                <p className="text-gray-600">Monitor system health and alerts</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Active Alerts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">Filter by Status</label>
                        <select
                            value={filterStatus}
                            onChange={(e: any) => setFilterStatus(e.target.value)}
                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                            <option value="ACTIVE">Active</option>
                            <option value="ACKNOWLEDGED">Acknowledged</option>
                            <option value="RESOLVED">Resolved</option>
                            <option value="">All</option>
                        </select>
                    </div>

                    {loading ? (
                        <div>Loading...</div>
                    ) : alerts.length === 0 ? (
                        <div className="text-gray-500">No alerts found</div>
                    ) : (
                        <div className="space-y-3">
                            {alerts.map((alert) => (
                                <div key={alert.id} className="border rounded-lg p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="flex gap-2 items-center">
                                                <Badge
                                                    variant={
                                                        severityColors[alert.severity] as
                                                        | "default"
                                                        | "success"
                                                        | "warning"
                                                        | "danger"
                                                        | "info"
                                                    }
                                                >
                                                    {alert.severity}
                                                </Badge>
                                                <Badge
                                                    variant={
                                                        statusColors[alert.status] as
                                                        | "default"
                                                        | "success"
                                                        | "warning"
                                                        | "danger"
                                                        | "info"
                                                    }
                                                >
                                                    {alert.status}
                                                </Badge>
                                            </div>
                                            <h3 className="font-semibold mt-2">{alert.title}</h3>
                                            <p className="text-sm text-gray-600 mt-1">
                                                {alert.description}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Last occurred:{" "}
                                                {formatDistanceToNow(new Date(alert.lastOccurredAt), {
                                                    addSuffix: true,
                                                })}
                                            </p>
                                        </div>
                                        {alert.status !== "RESOLVED" && (
                                            <Button
                                                onClick={() =>
                                                    handleResolveAlert(alert.id, "Resolved by admin")
                                                }
                                                variant="primary"
                                                size="sm"
                                            >
                                                Resolve
                                            </Button>
                                        )}
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
