"use client";

import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

interface AuditLog {
    id: string;
    action: string;
    admin: {
        id: string;
        title: string;
        email: string;
        name: string;
    } | null;
    target: {
        type: string;
        id: string | null;
        name: string | null;
    };
    changes: Record<string, unknown> | null;
    reason: string | null;
    status: string;
    timestamp: string;
    ipAddress: string | null;
}

export default function AuditLogsPage() {
    const router = useRouter();
    const { user, isLoading } = useAuth();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [filterAction, setFilterAction] = useState("ALL");
    const [filterTarget, setFilterTarget] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        if (!isLoading && (!user || user.role !== "ADMIN")) {
            router.push(`/login?redirect=${encodeURIComponent("/admin/audit-logs")}`);
        }
    }, [user, isLoading, router]);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(
                `/api/admin/audit-logs?page=${page}&limit=50${filterAction !== "ALL" ? `&action=${filterAction}` : ""}${filterTarget ? `&targetType=${filterTarget}` : ""}`,
                {
                    credentials: "include",
                }
            );
            const data = await response.json();
            setLogs(data.logs);
            setTotal(data.pagination.total);
        } catch (error) {
            console.error("Failed to load audit logs:", error);
        } finally {
            setLoading(false);
        }
    }, [page, filterAction, filterTarget]);

    useEffect(() => {
        if (user?.role === "ADMIN") {
            void loadLogs();
        }
    }, [user, loadLogs]);

    const handleFilterLoad = async () => {
        setLoading(true);
        try {
            const response = await fetch(
                `/api/admin/audit-logs?page=${page}&limit=50${filterAction !== "ALL" ? `&action=${filterAction}` : ""
                }${filterTarget ? `&targetType=${filterTarget}` : ""}`,
                {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                    },
                }
            );
            const data = await response.json();
            setLogs(data.logs);
            setTotal(data.pagination.total);
        } catch (error) {
            console.error("Failed to load audit logs:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!searchTerm) return;
        setLoading(true);
        try {
            const response = await fetch(
                `/api/admin/audit-logs?page=1&targetId=${searchTerm}`,
                {
                    credentials: "include",
                }
            );
            const data = await response.json();
            setLogs(data.logs);
            setTotal(data.pagination.total);
            setPage(1);
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setLoading(false);
        }
    };

    const getActionBadgeColor = (action: string) => {
        if (action.includes("CREATED") || action.includes("APPROVED"))
            return "bg-green-100 text-green-800";
        if (action.includes("REJECTED") || action.includes("DELETED"))
            return "bg-red-100 text-red-800";
        if (action.includes("UPDATED")) return "bg-blue-100 text-blue-800";
        return "bg-gray-100 text-gray-800";
    };

    if (isLoading) return <div>Loading...</div>;
    if (!user || user.role !== "ADMIN") return null;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Audit Logs</h1>
                <p className="text-gray-600">View all administrative actions</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Search & Filter</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-4">
                        <Input
                            placeholder="Search by target ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                        />
                        <Button onClick={handleSearch} disabled={loading}>
                            Search
                        </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium">Action</label>
                            <select
                                value={filterAction}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterAction(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                                <option value="ALL">All Actions</option>
                                <option value="USER_CREATED">User Created</option>
                                <option value="USER_UPDATED">User Updated</option>
                                <option value="USER_RESTRICTED">User Restricted</option>
                                <option value="JOB_APPROVED">Job Approved</option>
                                <option value="JOB_REJECTED">Job Rejected</option>
                                <option value="VERIFICATION_APPROVED">Verification Approved</option>
                                <option value="TRUST_CASE_OPENED">Trust Case Opened</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-sm font-medium">Target Type</label>
                            <select
                                value={filterTarget}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterTarget(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                                <option value="">All Types</option>
                                <option value="USER">User</option>
                                <option value="JOB">Job</option>
                                <option value="APPLICATION">Application</option>
                                <option value="TRUST_CASE">Trust Case</option>
                                <option value="VERIFICATION">Verification</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">
                        Audit Logs ({total} total)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">Loading...</div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No audit logs found</div>
                    ) : (
                        <div className="space-y-4">
                            {logs.map((log) => (
                                <div
                                    key={log.id}
                                    className="border rounded-lg p-4 space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex gap-3 items-center">
                                            <Badge className={getActionBadgeColor(log.action)}>
                                                {log.action}
                                            </Badge>
                                            <div>
                                                <p className="font-medium">
                                                    {log.admin?.name} ({log.admin?.title})
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    {log.target.type}: {log.target.name || log.target.id}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right text-sm text-gray-600">
                                            <p>{formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</p>
                                            {log.ipAddress && <p>{log.ipAddress}</p>}
                                        </div>
                                    </div>

                                    {log.reason && (
                                        <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                                            <strong>Reason:</strong> {log.reason}
                                        </p>
                                    )}

                                    {log.changes && Object.keys(log.changes).length > 0 && (
                                        <p className="text-xs text-gray-600">
                                            <strong>Changes:</strong>{" "}
                                            {JSON.stringify(log.changes).substring(0, 100)}...
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    <div className="flex justify-center gap-2 mt-6">
                        <Button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page === 1 || loading}
                            variant="outline"
                        >
                            Previous
                        </Button>
                        <span className="px-4 py-2 text-sm">
                            Page {page}
                        </span>
                        <Button
                            onClick={() => setPage(page + 1)}
                            disabled={page * 50 >= total || loading}
                            variant="outline"
                        >
                            Next
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
