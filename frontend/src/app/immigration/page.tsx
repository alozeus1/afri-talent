"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  immigration,
  ImmigrationProcess,
  ImmigrationStep,
  VisaTemplate,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const VISA_INFO: Record<
  string,
  { emoji: string; description: string }
> = {
  "UK Skilled Worker": {
    emoji: "🇬🇧",
    description:
      "Work in the UK with a licensed employer sponsor. Requires a job offer and minimum salary threshold.",
  },
  "Canada Express Entry": {
    emoji: "🇨🇦",
    description:
      "Points-based immigration system for skilled workers. Includes Federal Skilled Worker, CEC, and FST programs.",
  },
  "Germany Blue Card": {
    emoji: "🇩🇪",
    description:
      "EU Blue Card for highly qualified professionals. Requires a university degree and job offer above salary threshold.",
  },
  "USA H-1B": {
    emoji: "🇺🇸",
    description:
      "Specialty occupation visa for workers in fields requiring a bachelor's degree or higher. Subject to annual lottery.",
  },
  "Australia Skilled Worker": {
    emoji: "🇦🇺",
    description:
      "Subclass 189/190 visas for skilled workers on the occupation list. Points-tested permanent residency pathway.",
  },
  "Netherlands HSM": {
    emoji: "🇳🇱",
    description:
      "Highly Skilled Migrant visa. Fast-track work permit for professionals with salary above Dutch threshold.",
  },
};

function statusBadge(status: string) {
  switch (status.toUpperCase()) {
    case "IN_PROGRESS":
      return <Badge variant="info">In Progress</Badge>;
    case "APPROVED":
    case "COMPLETED":
      return <Badge variant="success">Completed</Badge>;
    case "PENDING":
      return <Badge variant="warning">Pending</Badge>;
    case "REJECTED":
    case "DENIED":
      return <Badge variant="danger">Denied</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function ImmigrationPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Templates
  const [templates, setTemplates] = useState<VisaTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // Processes
  const [processes, setProcesses] = useState<ImmigrationProcess[]>([]);
  const [processesLoading, setProcessesLoading] = useState(true);
  const [processesError, setProcessesError] = useState<string | null>(null);

  // Expanded process
  const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);

  // Create process dialog
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createData, setCreateData] = useState({
    visaType: "",
    targetCountry: "",
    notes: "",
    startDate: "",
    expectedEndDate: "",
  });

  // Add step dialog
  const [addStepProcessId, setAddStepProcessId] = useState<string | null>(null);
  const [stepData, setStepData] = useState({
    name: "",
    description: "",
    dueDate: "",
    documents: "",
  });
  const [addStepLoading, setAddStepLoading] = useState(false);

  // Redirect non-candidates
  useEffect(() => {
    if (!authLoading && user && user.role !== "CANDIDATE" && user.role !== "ADMIN") {
      router.push("/");
    }
  }, [authLoading, user, router]);

  // Load templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await immigration.templates();
        setTemplates(data);
      } catch (err) {
        setTemplatesError(err instanceof Error ? err.message : "Failed to load templates");
      } finally {
        setTemplatesLoading(false);
      }
    };
    loadTemplates();
  }, []);

  // Load processes
  const loadProcesses = useCallback(async () => {
    if (!user) return;
    setProcessesLoading(true);
    setProcessesError(null);
    try {
      const data = await immigration.processes();
      setProcesses(data);
    } catch (err) {
      setProcessesError(err instanceof Error ? err.message : "Failed to load processes");
    } finally {
      setProcessesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadProcesses();
    } else if (!authLoading) {
      setProcessesLoading(false);
    }
  }, [user, authLoading, loadProcesses]);

  // Start from template
  const startFromTemplate = async (template: VisaTemplate) => {
    if (!user) {
      alert("Please log in to start tracking.");
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      await immigration.createProcess({
        visaType: template.visaType,
        targetCountry: template.country,
      });
      await loadProcesses();
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create process");
    } finally {
      setCreateLoading(false);
    }
  };

  // Create custom process
  const handleCreateProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      await immigration.createProcess({
        visaType: createData.visaType,
        targetCountry: createData.targetCountry,
        notes: createData.notes || undefined,
        startDate: createData.startDate || undefined,
        expectedEndDate: createData.expectedEndDate || undefined,
      });
      await loadProcesses();
      setShowCreateForm(false);
      setCreateData({
        visaType: "",
        targetCountry: "",
        notes: "",
        startDate: "",
        expectedEndDate: "",
      });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create process");
    } finally {
      setCreateLoading(false);
    }
  };

  // Delete process
  const handleDeleteProcess = async (id: string) => {
    if (!confirm("Are you sure you want to delete this immigration process?")) return;
    try {
      await immigration.deleteProcess(id);
      setProcesses((prev) => prev.filter((p) => p.id !== id));
      if (expandedProcessId === id) setExpandedProcessId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete process");
    }
  };

  // Update step status
  const handleToggleStep = async (
    processId: string,
    step: ImmigrationStep
  ) => {
    const newStatus = step.status === "APPROVED" ? "PENDING" : "APPROVED";
    const completedAt =
      newStatus === "APPROVED" ? new Date().toISOString() : undefined;
    try {
      await immigration.updateStep(processId, step.id, {
        status: newStatus,
        completedAt,
      });
      // Optimistic update
      setProcesses((prev) =>
        prev.map((p) => {
          if (p.id !== processId) return p;
          return {
            ...p,
            steps: p.steps.map((s) =>
              s.id === step.id
                ? { ...s, status: newStatus, completedAt: completedAt || null }
                : s
            ),
          };
        })
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update step");
    }
  };

  // Add custom step
  const handleAddStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addStepProcessId) return;
    setAddStepLoading(true);
    try {
      const newStep = await immigration.addStep(addStepProcessId, {
        name: stepData.name,
        description: stepData.description || undefined,
        dueDate: stepData.dueDate || undefined,
        documents: stepData.documents
          ? stepData.documents.split(",").map((d) => d.trim())
          : undefined,
      });
      setProcesses((prev) =>
        prev.map((p) => {
          if (p.id !== addStepProcessId) return p;
          return { ...p, steps: [...p.steps, newStep] };
        })
      );
      setAddStepProcessId(null);
      setStepData({ name: "", description: "", dueDate: "", documents: "" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add step");
    } finally {
      setAddStepLoading(false);
    }
  };

  // Auth loading
  if (authLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  // Redirect if not candidate
  if (!user || (user.role !== "CANDIDATE" && user.role !== "ADMIN")) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <p className="text-gray-600">
          This page is available for candidates only. Please log in with a
          candidate account.
        </p>
        <Button className="mt-4" onClick={() => router.push("/login")}>
          Log In
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Immigration Visa Tracker
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Track your visa application journey step by step. Start from a
          template or create a custom process.
        </p>
      </div>

      {/* Visa Templates */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Visa Templates
        </h2>

        {templatesLoading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        )}

        {templatesError && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
            {templatesError}
          </div>
        )}

        {!templatesLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Show API templates first, then fill with defaults */}
            {(templates.length > 0
              ? templates
              : Object.entries(VISA_INFO).map(([key, info]) => ({
                  visaType: key,
                  country: key.split(" ")[0],
                  description: info.description,
                  steps: [],
                }))
            ).map((template) => {
              const info =
                VISA_INFO[template.visaType] || { emoji: "🌍", description: template.description };
              return (
                <Card
                  key={template.visaType}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-6">
                    <span className="text-4xl mb-3 block">{info.emoji}</span>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">
                      {template.visaType}
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {info.description}
                    </p>
                    {template.steps.length > 0 && (
                      <p className="text-xs text-gray-400 mb-3">
                        {template.steps.length} steps included
                      </p>
                    )}
                    <Button
                      size="sm"
                      onClick={() => startFromTemplate(template)}
                      disabled={createLoading}
                    >
                      Start Tracking
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* My Immigration Processes */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            My Immigration Processes
          </h2>
          <Button onClick={() => setShowCreateForm(true)}>
            + Start New Process
          </Button>
        </div>

        {processesLoading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        )}

        {processesError && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
            {processesError}
          </div>
        )}

        {!processesLoading && processes.length === 0 && !processesError && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-4xl mb-4">🌍</p>
              <p className="text-gray-600 mb-2">
                Start tracking your visa application journey
              </p>
              <p className="text-sm text-gray-400 mb-6">
                Pick a template above or create a custom process
              </p>
              <Button onClick={() => setShowCreateForm(true)}>
                Start New Process
              </Button>
            </CardContent>
          </Card>
        )}

        {!processesLoading && processes.length > 0 && (
          <div className="space-y-4">
            {processes.map((process) => {
              const isExpanded = expandedProcessId === process.id;
              const completedSteps = process.steps.filter(
                (s) => s.status === "APPROVED" || s.status === "COMPLETED"
              ).length;
              const totalSteps = process.steps.length;
              const progressPercent =
                totalSteps > 0
                  ? Math.round((completedSteps / totalSteps) * 100)
                  : 0;

              return (
                <Card key={process.id}>
                  <CardContent className="p-6">
                    {/* Process Header */}
                    <div
                      className="flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer"
                      onClick={() =>
                        setExpandedProcessId(isExpanded ? null : process.id)
                      }
                    >
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {process.visaType}
                          </h3>
                          {statusBadge(process.status)}
                        </div>
                        <p className="text-sm text-gray-500">
                          Target: {process.targetCountry}
                          {process.startDate &&
                            ` · Started ${new Date(process.startDate).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-48">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-500">Progress</span>
                            <span className="font-medium text-gray-900">
                              {completedSteps}/{totalSteps}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-gray-400 text-xl">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {/* Expanded Steps */}
                    {isExpanded && (
                      <div className="mt-6 pt-4 border-t border-gray-100">
                        {process.notes && (
                          <p className="text-sm text-gray-500 mb-4 italic">
                            {process.notes}
                          </p>
                        )}

                        {process.steps.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">
                            No steps yet. Add your first step below.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {process.steps
                              .sort((a, b) => a.sortOrder - b.sortOrder)
                              .map((step) => (
                                <StepRow
                                  key={step.id}
                                  step={step}
                                  onToggle={() =>
                                    handleToggleStep(process.id, step)
                                  }
                                />
                              ))}
                          </div>
                        )}

                        {/* Add Step */}
                        {addStepProcessId === process.id ? (
                          <form
                            onSubmit={handleAddStep}
                            className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3"
                          >
                            <Input
                              label="Step Name"
                              id={`step-name-${process.id}`}
                              placeholder="e.g. Submit biometrics"
                              value={stepData.name}
                              onChange={(e) =>
                                setStepData({
                                  ...stepData,
                                  name: e.target.value,
                                })
                              }
                              required
                            />
                            <Input
                              label="Description (optional)"
                              id={`step-desc-${process.id}`}
                              placeholder="Additional details"
                              value={stepData.description}
                              onChange={(e) =>
                                setStepData({
                                  ...stepData,
                                  description: e.target.value,
                                })
                              }
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Input
                                label="Due Date (optional)"
                                id={`step-due-${process.id}`}
                                type="date"
                                value={stepData.dueDate}
                                onChange={(e) =>
                                  setStepData({
                                    ...stepData,
                                    dueDate: e.target.value,
                                  })
                                }
                              />
                              <Input
                                label="Documents (comma-separated)"
                                id={`step-docs-${process.id}`}
                                placeholder="e.g. Passport, Photo, Letter"
                                value={stepData.documents}
                                onChange={(e) =>
                                  setStepData({
                                    ...stepData,
                                    documents: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="submit"
                                size="sm"
                                disabled={addStepLoading}
                              >
                                {addStepLoading ? "Adding..." : "Add Step"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setAddStepProcessId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <div className="mt-4 flex gap-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setAddStepProcessId(process.id)}
                            >
                              + Add Custom Step
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteProcess(process.id)}
                            >
                              Delete Process
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Create Process Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <Card className="w-full max-w-lg mb-10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Start New Process
                </h2>
                <button
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateError(null);
                  }}
                >
                  ×
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {createError && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
                  {createError}
                </div>
              )}
              <form onSubmit={handleCreateProcess} className="space-y-4">
                <Input
                  label="Visa Type"
                  id="create-visaType"
                  placeholder="e.g. UK Skilled Worker"
                  value={createData.visaType}
                  onChange={(e) =>
                    setCreateData({ ...createData, visaType: e.target.value })
                  }
                  required
                />
                <Input
                  label="Target Country"
                  id="create-country"
                  placeholder="e.g. United Kingdom"
                  value={createData.targetCountry}
                  onChange={(e) =>
                    setCreateData({
                      ...createData,
                      targetCountry: e.target.value,
                    })
                  }
                  required
                />
                <div className="w-full">
                  <label
                    htmlFor="create-notes"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Notes (optional)
                  </label>
                  <textarea
                    id="create-notes"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
                    placeholder="Any notes about your process..."
                    value={createData.notes}
                    onChange={(e) =>
                      setCreateData({ ...createData, notes: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Start Date"
                    id="create-startDate"
                    type="date"
                    value={createData.startDate}
                    onChange={(e) =>
                      setCreateData({
                        ...createData,
                        startDate: e.target.value,
                      })
                    }
                  />
                  <Input
                    label="Expected End Date"
                    id="create-endDate"
                    type="date"
                    value={createData.expectedEndDate}
                    onChange={(e) =>
                      setCreateData({
                        ...createData,
                        expectedEndDate: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateForm(false);
                      setCreateError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createLoading}>
                    {createLoading ? "Creating..." : "Create Process"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StepRow({
  step,
  onToggle,
}: {
  step: ImmigrationStep;
  onToggle: () => void;
}) {
  const isCompleted =
    step.status === "APPROVED" || step.status === "COMPLETED";

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg ${
        isCompleted ? "bg-emerald-50" : "bg-gray-50"
      }`}
    >
      <button
        onClick={onToggle}
        className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
          isCompleted
            ? "bg-emerald-600 border-emerald-600 text-white"
            : "border-gray-300 hover:border-emerald-500"
        }`}
      >
        {isCompleted && (
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`font-medium text-sm ${
              isCompleted ? "text-emerald-800 line-through" : "text-gray-900"
            }`}
          >
            {step.name}
          </span>
          {!isCompleted && step.status !== "PENDING" && (
            <Badge variant="info">{step.status}</Badge>
          )}
        </div>
        {step.description && (
          <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-1">
          {step.dueDate && (
            <span className="text-xs text-gray-400">
              Due: {new Date(step.dueDate).toLocaleDateString()}
            </span>
          )}
          {step.completedAt && (
            <span className="text-xs text-emerald-600">
              ✓ {new Date(step.completedAt).toLocaleDateString()}
            </span>
          )}
          {step.documents.length > 0 && (
            <span className="text-xs text-gray-400">
              📄 {step.documents.join(", ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
