"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  AccountRestrictionStatus,
  admin,
  AdminPermission,
  AdminUserDetailResponse,
  AdminUserListItem,
  UserListResponse,
} from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const roleVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  ADMIN: "danger",
  EMPLOYER: "info",
  CANDIDATE: "success",
};

const statusVariants: Record<AccountRestrictionStatus, "success" | "warning" | "danger"> = {
  ACTIVE: "success",
  LIMITED: "warning",
  SUSPENDED: "danger",
};

const adminPermissionOptions: AdminPermission[] = [
  "VIEW_USERS",
  "MANAGE_USER_ACCOUNTS",
  "RESTRICT_USER_ACCOUNT",
  "RESET_USER_PASSWORD",
  "VIEW_AUDIT_LOGS",
  "VIEW_HEALTH_STATUS",
  "MANAGE_ALERTS",
  "VIEW_SYSTEMS_METRICS",
  "REVIEW_JOBS",
  "REVIEW_APPLICATIONS",
  "REVIEW_RESOURCES",
  "REVIEW_COMPANY_DATA",
  "VIEW_TRUST_CASES",
  "MANAGE_TRUST_CASES",
  "VIEW_ABUSE_REPORTS",
  "MANAGE_ABUSE_REPORTS",
  "VIEW_VERIFICATION_ARTIFACTS",
  "APPROVE_VERIFICATION",
  "VIEW_BILLING_DATA",
  "MANAGE_BILLING_DISPUTES",
  "VIEW_REVENUE_REPORTS",
  "EXPORT_DATA",
  "RUN_BULK_OPERATIONS",
  "MODIFY_BULK_DATA",
];

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [usersData, setUsersData] = useState<UserListResponse | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminUserDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [roleForm, setRoleForm] = useState<{
    role: AdminUserListItem["role"];
    adminTitle: string;
    adminRoleActive: boolean;
    permissions: AdminPermission[];
    reason: string;
  }>({
    role: "CANDIDATE",
    adminTitle: "Platform Administrator",
    adminRoleActive: true,
    permissions: ["VIEW_USERS"],
    reason: "",
  });
  const [statusForm, setStatusForm] = useState<{ status: AccountRestrictionStatus; reason: string }>({
    status: "ACTIVE",
    reason: "",
  });

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search, roleFilter, statusFilter, page]);

  useEffect(() => {
    if (selectedUserId) {
      loadUserDetail(selectedUserId);
    }
  }, [selectedUserId]);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await admin.users(undefined, {
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
        page,
        limit: 20,
      });
      setUsersData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const loadUserDetail = async (id: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const detail = await admin.user(id);
      setSelectedDetail(detail);
      setRoleForm({
        role: detail.user.role,
        adminTitle: detail.user.adminRole?.title ?? "Platform Administrator",
        adminRoleActive: detail.user.adminRole?.isActive ?? true,
        permissions: detail.user.adminRole?.permissions ?? ["VIEW_USERS"],
        reason: "",
      });
      setStatusForm({
        status: detail.user.accountRestrictionStatus,
        reason: detail.user.accountRestrictionReason ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const selectUser = (selected: AdminUserListItem) => {
    setSelectedUserId(selected.id);
    setSelectedDetail(null);
    setSuccess(null);
  };

  const togglePermission = (permission: AdminPermission) => {
    setRoleForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  };

  const submitRoleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await admin.updateUserRole(selectedUserId, {
        role: roleForm.role,
        adminTitle: roleForm.role === "ADMIN" ? roleForm.adminTitle : undefined,
        adminRoleActive: roleForm.role === "ADMIN" ? roleForm.adminRoleActive : undefined,
        permissions: roleForm.role === "ADMIN" ? roleForm.permissions : undefined,
        reason: roleForm.reason || undefined,
      });
      setSuccess("Role and admin permissions updated.");
      await Promise.all([loadUsers(), loadUserDetail(selectedUserId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSaving(false);
    }
  };

  const submitStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await admin.updateUserStatus(selectedUserId, {
        status: statusForm.status,
        reason: statusForm.reason || undefined,
      });
      setSuccess("Account status updated.");
      await Promise.all([loadUsers(), loadUserDetail(selectedUserId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update account status");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const totalPages = usersData?.pagination.totalPages || 1;
  const selectedUser = selectedDetail?.user;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-600">Search users, inspect account state, and apply audit-logged admin changes.</p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <form onSubmit={handleSearch} className="flex min-w-[240px] flex-1 gap-2">
              <Input
                placeholder="Search name or email"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Button type="submit" variant="outline">Search</Button>
            </form>
            <Select
              aria-label="Role filter"
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="min-w-[140px]"
            >
              <option value="">All roles</option>
              <option value="CANDIDATE">Candidate</option>
              <option value="EMPLOYER">Employer</option>
              <option value="ADMIN">Admin</option>
            </Select>
            <Select
              aria-label="Status filter"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="min-w-[150px]"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="LIMITED">Limited</option>
              <option value="SUSPENDED">Suspended</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Users</h2>
              {usersData && <span className="text-sm text-gray-500">{usersData.pagination.total} total</span>}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
              </div>
            ) : !usersData || usersData.users.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-500">
                  0
                </div>
                <p className="text-gray-600">No users found</p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">User</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Joined</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Activity</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {usersData.users.map((u) => (
                        <tr key={u.id} className={selectedUserId === u.id ? "bg-emerald-50" : "hover:bg-gray-50"}>
                          <td className="px-4 py-3">
                            <span className="font-medium text-gray-900">{u.name}</span>
                            <p className="text-sm text-gray-600">{u.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={roleVariants[u.role] || "default"}>{u.role}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusVariants[u.accountRestrictionStatus]}>{u.accountRestrictionStatus}</Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {u._count.applications} apps · {u._count.sentMessages} msgs
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button type="button" variant="outline" size="sm" onClick={() => selectUser(u)}>
                              Inspect
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-gray-200 md:hidden">
                  {usersData.users.map((u) => (
                    <button key={u.id} type="button" onClick={() => selectUser(u)} className="block w-full py-4 text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-medium text-gray-900">{u.name}</span>
                          <p className="text-sm text-gray-600">{u.email}</p>
                        </div>
                        <Badge variant={statusVariants[u.accountRestrictionStatus]}>{u.accountRestrictionStatus}</Badge>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Badge variant={roleVariants[u.role] || "default"}>{u.role}</Badge>
                        <span className="text-xs text-gray-500">Joined {new Date(u.createdAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="mt-6 flex justify-center gap-2 border-t border-gray-200 pt-4">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <span className="flex items-center px-3 text-sm text-gray-600">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">User Detail</h2>
          </CardHeader>
          <CardContent>
            {!selectedUserId ? (
              <p className="text-sm text-gray-600">Select a user to inspect details and manage access.</p>
            ) : detailLoading || !selectedUser ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedUser.name}</h3>
                  <p className="text-sm text-gray-600">{selectedUser.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant={roleVariants[selectedUser.role] || "default"}>{selectedUser.role}</Badge>
                    <Badge variant={statusVariants[selectedUser.accountRestrictionStatus]}>
                      {selectedUser.accountRestrictionStatus}
                    </Badge>
                    {selectedUser.emailVerified && <Badge variant="success">Email verified</Badge>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm">
                  <div>
                    <p className="text-gray-500">Applications</p>
                    <p className="font-semibold text-gray-900">{selectedUser._count.applications}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Messages</p>
                    <p className="font-semibold text-gray-900">{selectedUser._count.sentMessages}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Reviews</p>
                    <p className="font-semibold text-gray-900">{selectedUser._count.companyReviews}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Saved searches</p>
                    <p className="font-semibold text-gray-900">{selectedUser._count.savedSearches}</p>
                  </div>
                </div>

                {selectedUser.employer && (
                  <div className="rounded-xl border border-gray-200 p-4 text-sm">
                    <p className="font-semibold text-gray-900">{selectedUser.employer.companyName}</p>
                    <p className="text-gray-600">{selectedUser.employer.location}</p>
                  </div>
                )}

                {selectedUser.candidateProfile && (
                  <div className="rounded-xl border border-gray-200 p-4 text-sm">
                    <p className="font-semibold text-gray-900">{selectedUser.candidateProfile.headline || "Candidate profile"}</p>
                    <p className="text-gray-600">
                      {selectedUser.candidateProfile.targetCountries.join(", ") || "No target countries"} · {selectedUser.candidateProfile.yearsExperience ?? 0} yrs
                    </p>
                  </div>
                )}

                <form onSubmit={submitRoleUpdate} className="space-y-4 border-t border-gray-200 pt-6">
                  <h3 className="font-semibold text-gray-900">Role and Permissions</h3>
                  <Select
                    value={roleForm.role}
                    onChange={(e) => setRoleForm((current) => ({ ...current, role: e.target.value as AdminUserListItem["role"] }))}
                    className="w-full"
                  >
                    <option value="CANDIDATE">Candidate</option>
                    <option value="EMPLOYER">Employer</option>
                    <option value="ADMIN">Admin</option>
                  </Select>

                  {roleForm.role === "ADMIN" && (
                    <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                      <Input
                        value={roleForm.adminTitle}
                        onChange={(e) => setRoleForm((current) => ({ ...current, adminTitle: e.target.value }))}
                        placeholder="Admin title"
                      />
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={roleForm.adminRoleActive}
                          onChange={(e) => setRoleForm((current) => ({ ...current, adminRoleActive: e.target.checked }))}
                        />
                        Active admin role
                      </label>
                      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                        {adminPermissionOptions.map((permission) => (
                          <label key={permission} className="flex items-center gap-2 text-xs text-gray-700">
                            <input
                              type="checkbox"
                              checked={roleForm.permissions.includes(permission)}
                              onChange={() => togglePermission(permission)}
                            />
                            {permission}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <Input
                    value={roleForm.reason}
                    onChange={(e) => setRoleForm((current) => ({ ...current, reason: e.target.value }))}
                    placeholder="Audit reason, optional"
                  />
                  <Button
                    type="submit"
                    isLoading={saving}
                    disabled={saving || selectedUser.id === user.id || (roleForm.role === "ADMIN" && roleForm.permissions.length === 0)}
                  >
                    Save role changes
                  </Button>
                  {roleForm.role === "ADMIN" && roleForm.permissions.length === 0 && (
                    <p className="text-xs text-red-600">Select at least one admin permission.</p>
                  )}
                  {selectedUser.id === user.id && <p className="text-xs text-gray-500">You cannot change your own role or admin permissions.</p>}
                </form>

                <form onSubmit={submitStatusUpdate} className="space-y-4 border-t border-gray-200 pt-6">
                  <h3 className="font-semibold text-gray-900">Account Status</h3>
                  <Select
                    value={statusForm.status}
                    onChange={(e) => setStatusForm((current) => ({ ...current, status: e.target.value as AccountRestrictionStatus }))}
                    className="w-full"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="LIMITED">Limited</option>
                    <option value="SUSPENDED">Suspended</option>
                  </Select>
                  <Input
                    value={statusForm.reason}
                    onChange={(e) => setStatusForm((current) => ({ ...current, reason: e.target.value }))}
                    placeholder={statusForm.status === "ACTIVE" ? "Reason, optional" : "Reason required for restriction"}
                  />
                  <Button
                    type="submit"
                    variant={statusForm.status === "SUSPENDED" ? "danger" : "primary"}
                    isLoading={saving}
                    disabled={saving || (selectedUser.id === user.id && statusForm.status !== "ACTIVE")}
                  >
                    Save status
                  </Button>
                </form>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="mb-3 font-semibold text-gray-900">Recent Audit Activity</h3>
                  {selectedDetail.auditLogs.length === 0 ? (
                    <p className="text-sm text-gray-600">No recent user-management audit events.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedDetail.auditLogs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-900">{log.action}</span>
                            <span className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-600">
                            {log.admin?.admin.email || "System"}{log.reason ? ` · ${log.reason}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
