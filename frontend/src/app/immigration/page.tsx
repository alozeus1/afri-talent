"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, FileText, Globe2, Plus, X } from "lucide-react";
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
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey, type PublicT } from "@/lib/i18n/public-messages";

// Visa routes shown before the API templates load (or when it returns none).
// Descriptions are translated; the route names are official programme names.
const VISA_INFO: Record<string, { emoji: string; description: PublicMessageKey }> = {
  "UK Skilled Worker": { emoji: "🇬🇧", description: "guides.visa.ukSkilled" },
  "Canada Express Entry": { emoji: "🇨🇦", description: "guides.visa.canadaExpress" },
  "Germany Blue Card": { emoji: "🇩🇪", description: "guides.visa.germanyBlue" },
  "USA H-1B": { emoji: "🇺🇸", description: "guides.visa.usaH1b" },
  "Australia Skilled Worker": { emoji: "🇦🇺", description: "guides.visa.australiaSkilled" },
  "Netherlands HSM": { emoji: "🇳🇱", description: "guides.visa.netherlandsHsm" },
};

const HOW_IT_WORKS: Array<{ title: PublicMessageKey; body: PublicMessageKey }> = [
  { title: "guides.visa.how1Title", body: "guides.visa.how1Body" },
  { title: "guides.visa.how2Title", body: "guides.visa.how2Body" },
  { title: "guides.visa.how3Title", body: "guides.visa.how3Body" },
];

const FIELD_CLASS =
  "w-full rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-fg placeholder:text-fg-muted shadow-xs focus:outline-none focus:ring-2 focus:ring-focus";

function StatusBadge({ status, tp }: { status: string; tp: PublicT }) {
  switch (status.toUpperCase()) {
    case "IN_PROGRESS":
      return <Badge variant="info">{tp("guides.visa.status.inProgress")}</Badge>;
    case "APPROVED":
    case "COMPLETED":
      return <Badge variant="success">{tp("guides.visa.status.completed")}</Badge>;
    case "PENDING":
      return <Badge variant="warning">{tp("guides.visa.status.pending")}</Badge>;
    case "REJECTED":
    case "DENIED":
      return <Badge variant="danger">{tp("guides.visa.status.denied")}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-8" role="status" aria-label={label}>
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
    </div>
  );
}

export default function ImmigrationPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const tp = usePublicT();
  const locale = useLocale();

  // Templates
  const [templates, setTemplates] = useState<VisaTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // Processes
  const [processes, setProcesses] = useState<ImmigrationProcess[]>([]);
  const [processesLoading, setProcessesLoading] = useState(true);
  const [processesError, setProcessesError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Expanded process / pending delete confirmation
  const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
      router.push(localizePath("/", locale));
    }
  }, [authLoading, user, router, locale]);

  // Load templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await immigration.templates();
        setTemplates(data);
      } catch (err) {
        setTemplatesError(err instanceof Error ? err.message : tp("guides.visa.errTemplates"));
      } finally {
        setTemplatesLoading(false);
      }
    };
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once; tp only formats fallback copy
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
      setProcessesError(err instanceof Error ? err.message : tp("guides.visa.errProcesses"));
    } finally {
      setProcessesLoading(false);
    }
  }, [user, tp]);

  useEffect(() => {
    if (user) {
      loadProcesses();
    } else if (!authLoading) {
      setProcessesLoading(false);
    }
  }, [user, authLoading, loadProcesses]);

  // Escape closes the create dialog.
  useEffect(() => {
    if (!showCreateForm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCreateForm(false);
        setCreateError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCreateForm]);

  // Start from template
  const startFromTemplate = async (template: VisaTemplate) => {
    if (!user) return;
    setCreateLoading(true);
    setCreateError(null);
    setActionError(null);
    try {
      await immigration.createProcess({
        visaType: template.visaType,
        targetCountry: template.country,
      });
      await loadProcesses();
      setShowCreateForm(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : tp("guides.visa.errCreate"));
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
      setCreateError(err instanceof Error ? err.message : tp("guides.visa.errCreate"));
    } finally {
      setCreateLoading(false);
    }
  };

  // Delete process (two-step confirmation inline, no browser dialog)
  const handleDeleteProcess = async (id: string) => {
    setActionError(null);
    try {
      await immigration.deleteProcess(id);
      setProcesses((prev) => prev.filter((p) => p.id !== id));
      if (expandedProcessId === id) setExpandedProcessId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : tp("guides.visa.errDelete"));
    } finally {
      setConfirmDeleteId(null);
    }
  };

  // Update step status
  const handleToggleStep = async (processId: string, step: ImmigrationStep) => {
    const newStatus = step.status === "APPROVED" ? "PENDING" : "APPROVED";
    const completedAt = newStatus === "APPROVED" ? new Date().toISOString() : undefined;
    setActionError(null);
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
              s.id === step.id ? { ...s, status: newStatus, completedAt: completedAt || null } : s,
            ),
          };
        }),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : tp("guides.visa.errStep"));
    }
  };

  // Add custom step
  const handleAddStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addStepProcessId) return;
    setAddStepLoading(true);
    setActionError(null);
    try {
      const newStep = await immigration.addStep(addStepProcessId, {
        name: stepData.name,
        description: stepData.description || undefined,
        dueDate: stepData.dueDate || undefined,
        documents: stepData.documents ? stepData.documents.split(",").map((d) => d.trim()) : undefined,
      });
      setProcesses((prev) =>
        prev.map((p) => {
          if (p.id !== addStepProcessId) return p;
          return { ...p, steps: [...p.steps, newStep] };
        }),
      );
      setAddStepProcessId(null);
      setStepData({ name: "", description: "", dueDate: "", documents: "" });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : tp("guides.visa.errAddStep"));
    } finally {
      setAddStepLoading(false);
    }
  };

  // Auth loading
  if (authLoading) {
    return (
      <div className="py-24">
        <Spinner label={tp("guides.visa.loading")} />
      </div>
    );
  }

  // Candidates only
  if (!user || (user.role !== "CANDIDATE" && user.role !== "ADMIN")) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <Globe2 className="mx-auto mb-4 h-10 w-10 text-primary-text" aria-hidden="true" />
        <h1 className="font-display mb-3 text-2xl font-bold text-fg">{tp("guides.visa.title")}</h1>
        <p className="text-fg-secondary">{tp("guides.visa.candidatesOnly")}</p>
        <Link href={`${localizePath("/login", locale)}?redirect=${encodeURIComponent(localizePath("/immigration", locale))}`}>
          <Button className="mt-6">{tp("guides.visa.logIn")}</Button>
        </Link>
      </div>
    );
  }

  const templateCards: VisaTemplate[] =
    templates.length > 0
      ? templates
      : Object.keys(VISA_INFO).map((key) => ({
          visaType: key,
          country: key.split(" ")[0],
          description: "",
          steps: [],
        })) as VisaTemplate[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header: what this page is for and how to use it */}
      <div className="mb-8 text-center">
        <h1 className="font-display mb-4 text-4xl font-bold tracking-tight text-fg">{tp("guides.visa.title")}</h1>
        <p className="mx-auto max-w-2xl text-lg text-fg-secondary">{tp("guides.visa.subtitle")}</p>
        <ol className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-3 text-start sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-line bg-surface p-4 shadow-xs">
              <span
                aria-hidden="true"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-fg"
              >
                {index + 1}
              </span>
              <p className="mt-2 text-sm font-semibold text-fg">{tp(step.title)}</p>
              <p className="mt-0.5 text-xs text-fg-muted">{tp(step.body)}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Not legal advice: required framing */}
      <div className="mb-12 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-fg-secondary" role="note">
        <strong className="text-fg">{tp("guides.visa.disclaimerTitle")}</strong> {tp("guides.visa.disclaimerBody")}
      </div>

      {actionError && (
        <div role="alert" className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label={tp("site.trust.close")}
            className="rounded p-1 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Visa templates */}
      <section className="mb-12" aria-labelledby="visa-templates">
        <h2 id="visa-templates" className="mb-6 text-2xl font-bold text-fg">
          {tp("guides.visa.templates")}
        </h2>

        {templatesLoading && <Spinner label={tp("guides.visa.loading")} />}

        {templatesError && (
          <div role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">
            {templatesError}
          </div>
        )}

        {!templatesLoading && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {templateCards.map((template) => {
              const info = VISA_INFO[template.visaType];
              return (
                <Card key={template.visaType} className="transition-shadow hover:shadow-raised">
                  <CardContent className="flex h-full flex-col p-6">
                    <span className="mb-3 block text-4xl" aria-hidden="true">
                      {info?.emoji ?? "🌍"}
                    </span>
                    <h3 className="mb-2 text-lg font-bold text-fg">{template.visaType}</h3>
                    <p className="mb-4 text-sm text-fg-secondary">{info ? tp(info.description) : template.description}</p>
                    {template.steps.length > 0 && (
                      <p className="mb-3 text-xs text-fg-muted">{tp("guides.visa.stepsIncluded", { count: template.steps.length })}</p>
                    )}
                    <div className="mt-auto">
                      <Button size="sm" onClick={() => startFromTemplate(template)} disabled={createLoading}>
                        {tp("guides.visa.startTracking")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* My immigration processes */}
      <section className="mb-12" aria-labelledby="my-processes">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 id="my-processes" className="text-2xl font-bold text-fg">
            {tp("guides.visa.myProcesses")}
          </h2>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="me-1 h-4 w-4" aria-hidden="true" />
            {tp("guides.visa.startNew")}
          </Button>
        </div>

        {processesLoading && <Spinner label={tp("guides.visa.loading")} />}

        {processesError && (
          <div role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">
            {processesError}
          </div>
        )}

        {!processesLoading && processes.length === 0 && !processesError && (
          <Card>
            <CardContent className="p-12 text-center">
              <Globe2 className="mx-auto mb-4 h-10 w-10 text-primary-text" aria-hidden="true" />
              <p className="mb-2 font-medium text-fg">{tp("guides.visa.emptyTitle")}</p>
              <p className="mb-6 text-sm text-fg-muted">{tp("guides.visa.emptyBody")}</p>
              <Button onClick={() => setShowCreateForm(true)}>{tp("guides.visa.startNew")}</Button>
            </CardContent>
          </Card>
        )}

        {!processesLoading && processes.length > 0 && (
          <div className="space-y-4">
            {processes.map((process) => {
              const isExpanded = expandedProcessId === process.id;
              const completedSteps = process.steps.filter((s) => s.status === "APPROVED" || s.status === "COMPLETED").length;
              const totalSteps = process.steps.length;
              const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
              const panelId = `process-panel-${process.id}`;

              return (
                <Card key={process.id}>
                  <CardContent className="p-6">
                    {/* Process header (disclosure button) */}
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      onClick={() => setExpandedProcessId(isExpanded ? null : process.id)}
                      className="flex w-full flex-col justify-between gap-3 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:flex-row md:items-center"
                    >
                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-semibold text-fg">{process.visaType}</h3>
                          <StatusBadge status={process.status} tp={tp} />
                        </div>
                        <p className="text-sm text-fg-muted">
                          {tp("guides.visa.target", { country: process.targetCountry })}
                          {process.startDate &&
                            ` · ${tp("guides.visa.started", { date: new Date(process.startDate).toLocaleDateString(locale) })}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-48">
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="text-fg-muted">{tp("guides.visa.progress")}</span>
                            <span className="font-medium text-fg">
                              {completedSteps}/{totalSteps}
                            </span>
                          </div>
                          <div
                            className="h-2 w-full rounded-full bg-surface-muted"
                            role="progressbar"
                            aria-valuenow={progressPercent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={tp("guides.visa.progress")}
                          >
                            <div className="h-2 rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                          </div>
                        </div>
                        <ChevronDown
                          className={`h-5 w-5 text-fg-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        />
                      </div>
                    </button>

                    {/* Expanded steps */}
                    {isExpanded && (
                      <div id={panelId} className="mt-6 border-t border-line pt-4">
                        {process.notes && <p className="mb-4 text-sm italic text-fg-muted">{process.notes}</p>}

                        {process.steps.length === 0 ? (
                          <p className="py-4 text-center text-sm text-fg-muted">{tp("guides.visa.noSteps")}</p>
                        ) : (
                          <ul className="space-y-3">
                            {[...process.steps]
                              .sort((a, b) => a.sortOrder - b.sortOrder)
                              .map((step) => (
                                <StepRow key={step.id} step={step} onToggle={() => handleToggleStep(process.id, step)} />
                              ))}
                          </ul>
                        )}

                        {/* Add step */}
                        {addStepProcessId === process.id ? (
                          <form onSubmit={handleAddStep} className="mt-4 space-y-3 rounded-lg bg-surface-sunken p-4">
                            <Input
                              label={tp("guides.visa.stepName")}
                              id={`step-name-${process.id}`}
                              placeholder={tp("guides.visa.stepNamePlaceholder")}
                              value={stepData.name}
                              onChange={(e) => setStepData({ ...stepData, name: e.target.value })}
                              required
                            />
                            <Input
                              label={tp("guides.visa.stepDescription")}
                              id={`step-desc-${process.id}`}
                              placeholder={tp("guides.visa.stepDescriptionPlaceholder")}
                              value={stepData.description}
                              onChange={(e) => setStepData({ ...stepData, description: e.target.value })}
                            />
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <Input
                                label={tp("guides.visa.stepDue")}
                                id={`step-due-${process.id}`}
                                type="date"
                                value={stepData.dueDate}
                                onChange={(e) => setStepData({ ...stepData, dueDate: e.target.value })}
                              />
                              <Input
                                label={tp("guides.visa.stepDocuments")}
                                id={`step-docs-${process.id}`}
                                placeholder={tp("guides.visa.stepDocumentsPlaceholder")}
                                value={stepData.documents}
                                onChange={(e) => setStepData({ ...stepData, documents: e.target.value })}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button type="submit" size="sm" disabled={addStepLoading}>
                                {addStepLoading ? tp("guides.visa.adding") : tp("guides.visa.addStep")}
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => setAddStepProcessId(null)}>
                                {tp("site.common.cancel")}
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <div className="mt-4 flex flex-wrap gap-3">
                            <Button variant="outline" size="sm" onClick={() => setAddStepProcessId(process.id)}>
                              <Plus className="me-1 h-4 w-4" aria-hidden="true" />
                              {tp("guides.visa.addCustomStep")}
                            </Button>
                            {confirmDeleteId === process.id ? (
                              <>
                                <Button variant="danger" size="sm" onClick={() => handleDeleteProcess(process.id)}>
                                  {tp("guides.visa.confirmDelete")}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                                  {tp("site.common.cancel")}
                                </Button>
                              </>
                            ) : (
                              <Button variant="danger" size="sm" onClick={() => setConfirmDeleteId(process.id)}>
                                {tp("guides.visa.deleteProcess")}
                              </Button>
                            )}
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

      {/* Create process dialog */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 pt-10">
          <button
            type="button"
            tabIndex={-1}
            aria-label={tp("site.trust.close")}
            className="fixed inset-0 cursor-default bg-black/50"
            onClick={() => {
              setShowCreateForm(false);
              setCreateError(null);
            }}
          />
          <Card className="relative mb-10 w-full max-w-lg" role="dialog" aria-modal="true" aria-labelledby="create-process-title">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 id="create-process-title" className="text-xl font-bold text-fg">
                  {tp("guides.visa.startNew")}
                </h2>
                <button
                  type="button"
                  aria-label={tp("site.trust.close")}
                  className="rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateError(null);
                  }}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {createError && (
                <div role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">
                  {createError}
                </div>
              )}
              <form onSubmit={handleCreateProcess} className="space-y-4">
                <Input
                  label={tp("guides.visa.visaType")}
                  id="create-visaType"
                  placeholder={tp("guides.visa.visaTypePlaceholder")}
                  value={createData.visaType}
                  onChange={(e) => setCreateData({ ...createData, visaType: e.target.value })}
                  required
                />
                <Input
                  label={tp("guides.visa.targetCountry")}
                  id="create-country"
                  placeholder={tp("guides.visa.targetCountryPlaceholder")}
                  value={createData.targetCountry}
                  onChange={(e) => setCreateData({ ...createData, targetCountry: e.target.value })}
                  required
                />
                <div className="w-full">
                  <label htmlFor="create-notes" className="mb-1 block text-sm font-medium text-fg-secondary">
                    {tp("guides.visa.notes")}
                  </label>
                  <textarea
                    id="create-notes"
                    className={`${FIELD_CLASS} min-h-[80px]`}
                    placeholder={tp("guides.visa.notesPlaceholder")}
                    value={createData.notes}
                    onChange={(e) => setCreateData({ ...createData, notes: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label={tp("guides.visa.startDate")}
                    id="create-startDate"
                    type="date"
                    value={createData.startDate}
                    onChange={(e) => setCreateData({ ...createData, startDate: e.target.value })}
                  />
                  <Input
                    label={tp("guides.visa.endDate")}
                    id="create-endDate"
                    type="date"
                    value={createData.expectedEndDate}
                    onChange={(e) => setCreateData({ ...createData, expectedEndDate: e.target.value })}
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
                    {tp("site.common.cancel")}
                  </Button>
                  <Button type="submit" disabled={createLoading}>
                    {createLoading ? tp("guides.visa.creating") : tp("guides.visa.create")}
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

function StepRow({ step, onToggle }: { step: ImmigrationStep; onToggle: () => void }) {
  const tp = usePublicT();
  const locale = useLocale();
  const isCompleted = step.status === "APPROVED" || step.status === "COMPLETED";

  return (
    <li className={`flex items-start gap-3 rounded-lg p-3 ${isCompleted ? "border border-success-line bg-success-soft" : "bg-surface-sunken"}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={isCompleted}
        aria-label={tp(isCompleted ? "guides.visa.markIncomplete" : "guides.visa.markComplete", { step: step.name })}
        onClick={onToggle}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
          isCompleted ? "border-primary bg-primary text-primary-fg" : "border-line-strong hover:border-primary"
        }`}
      >
        {isCompleted && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${isCompleted ? "text-fg-secondary line-through" : "text-fg"}`}>{step.name}</span>
          {!isCompleted && step.status !== "PENDING" && <StatusBadge status={step.status} tp={tp} />}
        </div>
        {step.description && <p className="mt-0.5 text-xs text-fg-muted">{step.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {step.dueDate && (
            <span className="text-xs text-fg-muted">{tp("guides.visa.due", { date: new Date(step.dueDate).toLocaleDateString(locale) })}</span>
          )}
          {step.completedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-primary-text">
              <Check className="h-3 w-3" aria-hidden="true" />
              {new Date(step.completedAt).toLocaleDateString(locale)}
            </span>
          )}
          {step.documents.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
              <FileText className="h-3 w-3" aria-hidden="true" />
              {step.documents.join(", ")}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
