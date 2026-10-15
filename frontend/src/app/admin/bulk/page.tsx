"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAdminEnum, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import {
  EmptyState,
  ErrorState,
  Field,
  Notice,
  PageHeader,
  Panel,
  Pill,
  SkeletonList,
  fieldClass,
  muted,
  statusTone,
  strong,
} from "@/components/admin/console-ui";

// Mirrors the BulkOperationType enum accepted by POST /api/admin/bulk.
const OPERATION_TYPES = [
  "DATA_EXPORT",
  "CUSTOM_QUERY",
  "USER_RESTRICTION",
  "PASSWORD_RESET",
  "JOB_BATCH_REVIEW",
  "VERIFICATION_BATCH_PROCESS",
] as const;
type OperationType = (typeof OPERATION_TYPES)[number];

// Code sample shown as the filters placeholder (not user-facing copy).
const FILTER_EXAMPLE = '{ "users": { "role": "CANDIDATE" } }';

interface BulkOperation {
  id: string;
  operationType: string;
  status: string;
  targetCount: number;
  successCount: number;
  failureCount: number;
  createdAt: string;
  completedAt?: string | null;
  errorLog?: string | null;
}

export default function BulkPage() {
  const t = useAdminT();
  const label = useAdminEnum();
  const fmt = useAdminFormatters();
  const [operations, setOperations] = useState<BulkOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [operationType, setOperationType] = useState<OperationType>("DATA_EXPORT");
  const [filters, setFilters] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAPI<{ operations: BulkOperation[] }>("/api/admin/bulk?limit=50");
      setOperations(data.operations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    let parsed: unknown = {};
    if (filters.trim()) {
      try {
        parsed = JSON.parse(filters);
      } catch {
        setFormError(t("bulk.invalidJson"));
        return;
      }
    }
    setSubmitting(true);
    try {
      const result = await fetchAPI<{ status: string }>("/api/admin/bulk", {
        method: "POST",
        body: JSON.stringify({ operationType, filters: parsed, reason: reason.trim() || undefined }),
      });
      setNotice(t("bulk.created", { status: label("bulkStatus", result.status) }));
      setFilters("");
      setReason("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title={t("bulk.title")} subtitle={t("bulk.subtitle")} />

      {notice && <Notice tone="success" onDismiss={() => setNotice(null)}>{notice}</Notice>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title={t("bulk.createTitle")} description={t("bulk.createHelp")} className="xl:self-start">
          <form onSubmit={submit} className="space-y-4">
            <Field label={t("bulk.type")} help={t(`bulkTypeHelp.${operationType}`)}>
              {(id) => (
                <select id={id} value={operationType} onChange={(e) => setOperationType(e.target.value as OperationType)} className={fieldClass}>
                  {OPERATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`bulkType.${type}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("bulk.filters")} help={t("bulk.filtersHelp")}>
              {(id) => (
                <textarea
                  id={id}
                  value={filters}
                  onChange={(e) => setFilters(e.target.value)}
                  placeholder={FILTER_EXAMPLE}
                  rows={5}
                  spellCheck={false}
                  className={`${fieldClass} font-mono text-xs`}
                />
              )}
            </Field>
            <Field label={t("common.reason")} help={t("common.reasonHelp")}>
              {(id) => <input id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={fieldClass} />}
            </Field>
            {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
            <Button type="submit" isLoading={submitting}>
              {t("bulk.create")}
            </Button>
          </form>
        </Panel>

        <section aria-labelledby="bulk-recent">
          <h2 id="bulk-recent" className={`mb-3 text-base font-semibold ${strong}`}>{t("bulk.recent")}</h2>
          {loading ? (
            <SkeletonList />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : operations.length === 0 ? (
            <EmptyState title={t("bulk.empty")} description={t("bulk.emptyHelp")} />
          ) : (
            <ul className="space-y-3">
              {operations.map((op) => (
                <li key={op.id} className="surface-panel rounded-2xl p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold ${strong}`}>{label("bulkType", op.operationType)}</span>
                    <Pill tone={statusTone(op.status)}>{label("bulkStatus", op.status)}</Pill>
                  </div>
                  <p className="mt-2 text-sm text-fg-secondary">
                    {t("bulk.counts", {
                      targets: fmt.number(op.targetCount),
                      success: fmt.number(op.successCount),
                      failed: fmt.number(op.failureCount),
                    })}
                  </p>
                  <p className={`mt-1 text-xs ${muted}`}>
                    {t("bulk.createdAt", { time: fmt.relative(op.createdAt) })}
                    {op.completedAt ? ` · ${t("bulk.completedAt", { time: fmt.relative(op.completedAt) })}` : ""}
                  </p>
                  {op.errorLog && <p className="mt-2 text-xs text-danger">{op.errorLog}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
