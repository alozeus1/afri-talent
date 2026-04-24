"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";

interface BulkOperation {
    id: string;
    operationType: string;
    status: string;
    targetCount: number;
    successCount: number;
    failureCount: number;
    createdAt: string;
    completedAt?: string;
}

export default function BulkPage() {
    const router = useRouter();
    const { user, isLoading } = useAuth();
    const [operations, setOperations] = useState<BulkOperation[]>([]);
    const [loading, setLoading] = useState(false);
    const [operationType, setOperationType] = useState(
        "DATA_EXPORT"
    );
    const [filters, setFilters] = useState("");

    useEffect(() => {
        if (!isLoading && (!user || user.role !== "ADMIN")) {
            router.push("/login");
        }
    }, [user, isLoading, router]);

    const loadOperations = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/admin/bulk?limit=50`, {
                credentials: "include",
            });
            const data = await response.json();
            setOperations(data.operations || []);
        } catch (error) {
            console.error("Failed to load operations:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user?.role === "ADMIN") {
            void loadOperations();
        }
    }, [user, loadOperations]);

    const handleCreateOperation = async () => {
        try {
            const response = await fetch(`/api/admin/bulk`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    operationType,
                    filters: filters ? JSON.parse(filters) : {},
                }),
            });
            const data = await response.json();
            if (response.ok) {
                alert("Operation created successfully");
                sessionStorage.removeItem("operation_filters");
                loadOperations();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            console.error("Failed to create operation:", error);
            alert("Failed to create operation");
        }
    };

    if (isLoading) return <div>Loading...</div>;
    if (!user || user.role !== "ADMIN") return null;

    const statusColors: Record<string, string> = {
        PENDING: "warning",
        IN_PROGRESS: "warning",
        COMPLETED: "success",
        FAILED: "danger",
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Bulk Operations</h1>
                <p className="text-gray-600">Manage administrative bulk tasks</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Create New Operation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">Operation Type</label>
                        <select
                            value={operationType}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setOperationType(e.target.value)}
                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                            <option value="DATA_EXPORT">Data Export</option>
                            <option value="CUSTOM_QUERY">Custom Query</option>
                            <option value="EMAIL_CAMPAIGN">Email Campaign</option>
                            <option value="BULK_UPDATE">Bulk Update</option>
                            <option value="DATA_IMPORT">Data Import</option>
                            <option value="CLEANUP">Cleanup</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-sm font-medium">Filters (JSON)</label>
                        <Textarea
                            value={filters}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setFilters(e.target.value)}
                            placeholder='{"role": "RECRUITER"}'
                            className="mt-1 font-mono text-xs"
                            rows={4}
                        />
                    </div>

                    <Button
                        onClick={handleCreateOperation}
                        disabled={loading}
                        variant="primary"
                    >
                        Create Operation
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Operations</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div>Loading...</div>
                    ) : operations.length === 0 ? (
                        <div className="text-gray-500">No operations found</div>
                    ) : (
                        <div className="space-y-3">
                            {operations.map((op) => (
                                <div key={op.id} className="border rounded-lg p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="flex gap-2 items-center">
                                                <span className="font-semibold">
                                                    {op.operationType}
                                                </span>
                                                <Badge
                                                    variant={
                                                        statusColors[op.status] as
                                                        | "default"
                                                        | "success"
                                                        | "warning"
                                                        | "danger"
                                                        | "info"
                                                    }
                                                >
                                                    {op.status}
                                                </Badge>
                                            </div>
                                            <div className="text-sm text-gray-600 mt-2">
                                                <div>
                                                    Targets: {op.targetCount} | Success:{" "}
                                                    {op.successCount} | Failed: {op.failureCount}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    Created:{" "}
                                                    {formatDistanceToNow(new Date(op.createdAt), {
                                                        addSuffix: true,
                                                    })}
                                                    {op.completedAt &&
                                                        ` • Completed: ${formatDistanceToNow(
                                                            new Date(op.completedAt),
                                                            { addSuffix: true }
                                                        )}`}
                                                </div>
                                            </div>
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
