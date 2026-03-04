"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { referrals, ReferralItem, ReferralStats } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  ACCEPTED: "success",
  HIRED: "success",
  EXPIRED: "default",
};

const statusLabels: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  HIRED: "Hired",
  EXPIRED: "Expired",
};

export default function ReferralsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [myReferrals, setMyReferrals] = useState<ReferralItem[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [refereeEmail, setRefereeEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  // Status update
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [referralList, referralStats] = await Promise.all([
        referrals.list(),
        referrals.stats(),
      ]);
      setMyReferrals(referralList);
      setStats(referralStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load referrals");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refereeEmail.trim()) {
      setFormError("Email is required");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(false);
    try {
      const newReferral = await referrals.create({
        refereeEmail: refereeEmail.trim(),
        companyName: companyName.trim() || undefined,
        message: message.trim() || undefined,
      });
      setMyReferrals((prev) => [newReferral, ...prev]);
      if (stats) {
        setStats({ ...stats, totalMade: stats.totalMade + 1 });
      }
      setRefereeEmail("");
      setCompanyName("");
      setJobLink("");
      setMessage("");
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 3000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create referral");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    setUpdating(id);
    try {
      const updated = await referrals.updateStatus(id, status);
      setMyReferrals((prev) => prev.map((r) => (r.id === id ? updated : r)));
      // Refresh stats
      const newStats = await referrals.stats();
      setStats(newStats);
    } catch (err) {
      console.error("Failed to update referral status:", err);
    } finally {
      setUpdating(null);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Referrals</h1>
        <p className="text-gray-600">Refer talented professionals and help them find opportunities</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-emerald-600 mb-1">
              {loading ? "–" : stats?.totalMade ?? 0}
            </div>
            <div className="text-gray-600">Referrals Made</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {loading ? "–" : stats?.totalAccepted ?? 0}
            </div>
            <div className="text-gray-600">Accepted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {loading ? "–" : stats?.totalHired ?? 0}
            </div>
            <div className="text-gray-600">Hired</div>
          </CardContent>
        </Card>
      </div>

      {/* Refer a Friend Form */}
      <Card className="mb-8">
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Refer a Friend</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address *"
              type="email"
              placeholder="friend@example.com"
              value={refereeEmail}
              onChange={(e) => setRefereeEmail(e.target.value)}
              required
            />
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Company Name (optional)"
                type="text"
                placeholder="Target company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              <Input
                label="Job Link (optional)"
                type="url"
                placeholder="https://..."
                value={jobLink}
                onChange={(e) => setJobLink(e.target.value)}
              />
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Personal Message (optional)
              </label>
              <textarea
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors resize-none"
                rows={3}
                placeholder="Add a personal note about why you're referring them..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}
            {formSuccess && (
              <p className="text-sm text-emerald-600">Referral sent successfully!</p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send Referral"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* My Referrals */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">My Referrals</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
            </div>
          ) : myReferrals.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🤝</span>
              </div>
              <p className="text-gray-600 mb-2">No referrals yet</p>
              <p className="text-sm text-gray-500">
                Refer talented professionals and help them find opportunities
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {myReferrals.map((referral) => (
                <div key={referral.id} className="py-4">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">{referral.refereeEmail}</span>
                        <Badge variant={statusVariants[referral.status] || "default"}>
                          {statusLabels[referral.status] || referral.status}
                        </Badge>
                      </div>
                      {referral.companyName && (
                        <p className="text-sm text-gray-600">{referral.companyName}</p>
                      )}
                      {referral.message && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{referral.message}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(referral.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4 flex-shrink-0">
                      {referral.status === "PENDING" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusUpdate(referral.id, "ACCEPTED")}
                          disabled={updating === referral.id}
                        >
                          {updating === referral.id ? "..." : "Mark Accepted"}
                        </Button>
                      )}
                      {(referral.status === "PENDING" || referral.status === "ACCEPTED") && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusUpdate(referral.id, "HIRED")}
                          disabled={updating === referral.id}
                        >
                          {updating === referral.id ? "..." : "Mark Hired"}
                        </Button>
                      )}
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
