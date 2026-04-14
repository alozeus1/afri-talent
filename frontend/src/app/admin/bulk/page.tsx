"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BulkOperation {
  id: string;
  operationType: string;
  status: string;
  targetCount: number;
  successCount: number;
  failureCount: number;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export default function BulkOperationsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [operations, setOperations] = useState<BulkOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    operationType: "USER_RESTRICTION",
    reason: "",
    userIds: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadOperations();
    }
  }, [user, page, filterStatus]);

  const loadOperations = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/bulk?page=${page}&limit=20${
          filterStatus !== "all" ? `&status=${filterStatus}` : ""
        }`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }
      );
      const data = await response.json();
      setOperations(data.operations);
    } catch (error) {
      console.error("Failed to load operations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOperation = async () => {
    if (!formData.operationType || !formData.reason) {
      alert("Please fill in required fields");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          operationType: formData.operationType,
          reason: formData.reason,
          userIds: formData.userIds.split("\n").filter((id) => id.trim()),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Operation ${data.id} created successfully`);
        setShowCreateForm(false);
        setFormData({
          operationType: "USER_RESTRICTION",
          reason: "",
          userIds: "",
        });
        loadOperations();
      } else if (response.status === 202) {
        alert("Operation queued for approval");
        setShowCreateForm(false);
        setFormData({
          operationType: "USER_RESTRICTION",
          reason: "",
          userIds: "",
        });
        loadOperations();
      } else {
        alert("Failed to create operation");
      }
    } catch (error) {
      console.error("Failed to create operation:", error);
      alert("Error creating operation");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "QUEUED":
        return "bg-blue-100 text-blue-800";
      case "RUNNING":
        return "bg-yellow-100 text-yellow-800";
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "PARTIAL":
        return "bg-orange-100 text-orange-800";
      case "FAILED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (!user || user.role !== "ADMIN") return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bulk Operations</h1>
          <p className="text-gray-600">Execute batch operations across users and resources</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? "Cancel" : "New Operation"}
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create Bulk Operation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Operation Type</label>
              <Select
                value={formData.operationType}
                onValueChange={(value) =>
                  setFormData({ ...formData, operationType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER_RESTRICTION">User Restriction</SelectItem>
                  <SelectItem value="PASSWORD_RESET">Password Reset</SelectItem>
                  <SelectItem value="DATA_EXPORT">Data Export</SelectItem>
                  <SelectItem value="JOB_BATCH_REVIEW">Job Batch Review</SelectItem>
                  <SelectItem value="VERIFICATION_BATCH_PROCESS">
                    Verification Batch
                  </SelectItem>
                  <SelectItem value="CUSTOM_QUERY">Custom Query</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reason (Required)</label>
              <Textarea
                placeholder="Explain why this operation is being performed..."
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                User IDs (Optional, one per line)
              </label>
              <Textarea
                placeholder="Enter user IDs..."
                value={formData.userIds}
                onChange={(e) => setFormData({ ...formData, userIds: e.target.value })}
                rows={4}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCreateOperation}
                disabled={submitting || !formData.operationType || !formData.reason}
              >
                {submitting ? "Creating..." : "Create Operation"}
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operations List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Recent Operations</CardTitle>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="QUEUED">Queued</SelectItem>
                <SelectItem value="RUNNING">Running</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : operations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No operations found</div>
          ) : (
            <div className="space-y-4">
              {operations.map((op) => (
                <div key={op.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex gap-2 items-center mb-1">
                        <Badge className={getStatusColor(op.status)}>
                          {op.status}
                        </Badge>
                        <h3 className="font-semibold">{op.operationType}</h3>
                      </div>
                      <p className="text-sm text-gray-600">
                        ID: {op.id}
                      </p>
                    </div>
                    <div className="text-right text-sm text-gray-600">
                      <p>{formatDistanceToNow(new Date(op.createdAt), { addSuffix: true })}</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>
                        Progress: {op.successCount + op.failureCount}/{op.targetCount}
                      </span>
                      <span>{op.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${op.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-green-50 p-2 rounded text-green-700">
                      ✓ Success: {op.successCount}
                    </div>
                    <div className="bg-blue-50 p-2 rounded text-blue-700">
                      ⊘ Pending: {op.targetCount - op.successCount - op.failureCount}
                    </div>
                    <div className="bg-red-50 p-2 rounded text-red-700">
                      ✗ Failed: {op.failureCount}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="flex gap-2 text-xs text-gray-600">
                    {op.startedAt && <span>Started: {formatDistanceToNow(new Date(op.startedAt), { addSuffix: true })}</span>}
                    {op.completedAt && <span>Completed: {formatDistanceToNow(new Date(op.completedAt), { addSuffix: true })}</span>}
                  </div>
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
            <span className="px-4 py-2 text-sm">Page {page}</span>
            <Button
              onClick={() => setPage(page + 1)}
              disabled={operations.length < 20 || loading}
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
