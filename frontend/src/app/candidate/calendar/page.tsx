"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, Video, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { calendar, CalendarEventItem } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
  URL_PLACEHOLDERS,
  candidateFieldClass,
  candidateLabelClass,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import {
  enumLabel,
  useCandidateFormatters,
  useCandidateT,
  type CandidateMessageKey,
} from "@/lib/i18n/candidate-messages";

const eventTypeStyles: Record<
  string,
  { tile: string; dot: string; variant: "info" | "warning" | "danger" | "default" }
> = {
  INTERVIEW: { tile: "border-info-line bg-info-soft", dot: "bg-info", variant: "info" },
  FOLLOW_UP: { tile: "border-warning-line bg-warning-soft", dot: "bg-warning", variant: "warning" },
  DEADLINE: { tile: "border-danger-line bg-danger-soft", dot: "bg-danger", variant: "danger" },
  CUSTOM: { tile: "border-line bg-surface-sunken", dot: "bg-fg-muted", variant: "default" },
};
const EVENT_TYPES = ["INTERVIEW", "FOLLOW_UP", "DEADLINE", "CUSTOM"];

function getEventStyle(type: string) {
  return eventTypeStyles[type] || eventTypeStyles.CUSTOM;
}

/** ISO timestamp -> value for <input type="datetime-local"> in the viewer's timezone. */
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface EventFormData {
  title: string;
  description: string;
  eventType: string;
  startTime: string;
  endTime: string;
  location: string;
  meetingUrl: string;
  reminderMinutes: string;
}

const emptyForm: EventFormData = {
  title: "",
  description: "",
  eventType: "INTERVIEW",
  startTime: "",
  endTime: "",
  location: "",
  meetingUrl: "",
  reminderMinutes: "30",
};

export default function CalendarPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const { user, isLoading } = useAuth();
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [form, setForm] = useState<EventFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<CandidateMessageKey | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventList, upcomingList] = await Promise.all([calendar.list({ month: monthStr }), calendar.upcoming()]);
      setEvents(eventList);
      setUpcoming(upcomingList.slice(0, 5));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      loadData();
    }
  }, [user, loadData]);

  useEffect(() => {
    if (!showModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showModal]);

  const weekdayLabels = useMemo(
    // 7 Jan 2024 was a Sunday; the grid starts on Sunday.
    () => Array.from({ length: 7 }, (_, i) => fmt.date(new Date(2024, 0, 7 + i), { weekday: "short" })),
    [fmt],
  );

  const calendarGrid = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(d);
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [year, month]);

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEventItem[]> = {};
    events.forEach((ev) => {
      const d = new Date(ev.startTime).getDate();
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    });
    return map;
  }, [events]);

  const selectedDayEvents = selectedDay ? eventsByDay[selectedDay] || [] : [];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  };

  const openAddModal = () => {
    setEditingEvent(null);
    setForm(
      selectedDay
        ? { ...emptyForm, startTime: toLocalInputValue(new Date(year, month, selectedDay, 9, 0).toISOString()) }
        : emptyForm,
    );
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (ev: CalendarEventItem) => {
    setEditingEvent(ev);
    setForm({
      title: ev.title,
      description: ev.description || "",
      eventType: ev.eventType,
      startTime: toLocalInputValue(ev.startTime),
      endTime: toLocalInputValue(ev.endTime),
      location: ev.location || "",
      meetingUrl: ev.meetingUrl || "",
      reminderMinutes: ev.reminderMinutes?.toString() || "30",
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.startTime) {
      setFormError("cal.form.required");
      return;
    }
    setSubmitting(true);
    setFormError(null);

    const payload: Partial<CalendarEventItem> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      eventType: form.eventType,
      startTime: new Date(form.startTime).toISOString(),
      endTime: form.endTime ? new Date(form.endTime).toISOString() : null,
      location: form.location.trim() || null,
      meetingUrl: form.meetingUrl.trim() || null,
      reminderMinutes: form.reminderMinutes ? parseInt(form.reminderMinutes, 10) : null,
    };

    try {
      if (editingEvent) {
        await calendar.update(editingEvent.id, payload);
      } else {
        await calendar.create(payload);
      }
      setShowModal(false);
      await loadData();
    } catch {
      setFormError("cal.form.saveFailed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ev: CalendarEventItem) => {
    if (!window.confirm(t("cal.confirmDelete", { title: ev.title }))) return;
    setDeleteFailed(false);
    try {
      await calendar.delete(ev.id);
      await loadData();
    } catch (err) {
      console.error("Failed to delete event:", err);
      setDeleteFailed(true);
    }
  };

  const updateField = (field: keyof EventFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  const monthName = fmt.date(currentDate, { month: "long", year: "numeric" });
  const now = new Date();

  const eventActions = (ev: CalendarEventItem) => (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" className="px-2 py-1 text-xs" onClick={() => openEditModal(ev)} aria-label={t("cal.editNamed", { title: ev.title })}>
        {t("ui.edit")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 text-xs text-danger hover:text-danger"
        onClick={() => handleDelete(ev)}
        aria-label={t("cal.deleteNamed", { title: ev.title })}
      >
        {t("ui.delete")}
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("cal.title")}
        description={t("cal.subtitle")}
        actions={
          <Button onClick={openAddModal}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("cal.addEvent")}
          </Button>
        }
      />

      {deleteFailed ? <CandidateNotice className="mb-6">{t("cal.deleteFailed")}</CandidateNotice> : null}

      {error ? (
        <CandidateLoadError className="mb-6" error={error} subject={t("ui.subject.events")} onRetry={loadData} />
      ) : null}

      {loading ? (
        <CandidateSpinner />
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={prevMonth} aria-label={t("cal.prev")}>
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  </Button>
                  <h2 className="text-lg font-semibold capitalize text-fg" aria-live="polite">
                    {monthName}
                  </h2>
                  <Button variant="ghost" size="sm" onClick={nextMonth} aria-label={t("cal.next")}>
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                <div className="grid grid-cols-7 gap-1">
                  {weekdayLabels.map((d) => (
                    <div key={d} className="py-2 text-center text-xs font-medium text-fg-muted">
                      {d}
                    </div>
                  ))}
                  {calendarGrid.map((day, i) => {
                    if (day === null) return <div key={i} aria-hidden="true" className="h-11 sm:h-12" />;
                    const isToday = now.getDate() === day && now.getMonth() === month && now.getFullYear() === year;
                    const dayEvents = eventsByDay[day] ?? [];
                    const isSelected = selectedDay === day;
                    const dateLabel = fmt.date(new Date(year, month, day), { dateStyle: "full" });
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        aria-pressed={isSelected}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={dayEvents.length ? t("cal.dayEvents", { date: dateLabel, count: dayEvents.length }) : dateLabel}
                        className={`relative h-11 rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:h-12 ${
                          isSelected
                            ? "bg-primary font-semibold text-primary-fg"
                            : isToday
                              ? "bg-primary-soft font-semibold text-primary-text"
                              : "text-fg-secondary hover:bg-surface-muted"
                        }`}
                      >
                        {day}
                        {dayEvents.length > 0 && !isSelected && (
                          <span aria-hidden="true" className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                            {dayEvents.slice(0, 3).map((ev, idx) => (
                              <span key={idx} className={`h-1.5 w-1.5 rounded-full ${getEventStyle(ev.eventType).dot}`} />
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-fg">
                  {selectedDay
                    ? fmt.date(new Date(year, month, selectedDay), { weekday: "long", month: "short", day: "numeric" })
                    : t("cal.selectDay")}
                </h3>
              </CardHeader>
              <CardContent>
                {selectedDay === null ? (
                  <p className="py-4 text-sm text-fg-muted">{t("cal.selectDayHint")}</p>
                ) : selectedDayEvents.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="mb-3 text-sm text-fg-muted">{t("cal.noEventsDay")}</p>
                    <Button size="sm" variant="outline" onClick={openAddModal}>
                      {t("cal.addEvent")}
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {selectedDayEvents.map((ev) => {
                      const style = getEventStyle(ev.eventType);
                      return (
                        <li key={ev.id} className={`rounded-xl border p-3 ${style.tile}`}>
                          <div className="mb-1 flex items-center gap-2">
                            <Badge variant={style.variant}>{enumLabel(t, "cal.type", ev.eventType)}</Badge>
                            <span className="text-xs text-fg-muted">{fmt.time(ev.startTime)}</span>
                          </div>
                          <h4 className="text-sm font-medium text-fg">{ev.title}</h4>
                          {ev.description && <p className="mt-1 line-clamp-2 text-xs text-fg-secondary">{ev.description}</p>}
                          {ev.meetingUrl && (
                            <a
                              href={ev.meetingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline"
                            >
                              <Video className="h-3.5 w-3.5" aria-hidden="true" />
                              {t("cal.joinMeeting")}
                            </a>
                          )}
                          {ev.location && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
                              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                              {ev.location}
                            </p>
                          )}
                          <div className="mt-2">{eventActions(ev)}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="mt-8">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("cal.upcoming")}</h2>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="py-8 text-center">
                <CalendarDays className="mx-auto mb-3 h-8 w-8 text-fg-muted" aria-hidden="true" />
                <p className="font-medium text-fg">{t("cal.noUpcoming")}</p>
                <p className="mt-1 text-sm text-fg-muted">{t("cal.noUpcomingHint")}</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((ev) => {
                  const style = getEventStyle(ev.eventType);
                  const start = new Date(ev.startTime);
                  return (
                    <li key={ev.id} className="flex items-start gap-4 py-3">
                      <div className="w-14 shrink-0 text-center">
                        <div className="text-xs uppercase text-fg-muted">{fmt.date(start, { month: "short" })}</div>
                        <div className="text-2xl font-semibold tabular-nums text-fg">{fmt.date(start, { day: "numeric" })}</div>
                      </div>
                      <div aria-hidden="true" className={`w-1 self-stretch rounded-full ${style.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-medium text-fg">{ev.title}</h3>
                          <Badge variant={style.variant}>{enumLabel(t, "cal.type", ev.eventType)}</Badge>
                        </div>
                        <p className="text-xs text-fg-muted">
                          {fmt.time(ev.startTime)}
                          {ev.endTime && ` – ${fmt.time(ev.endTime)}`}
                        </p>
                        {ev.location && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {ev.location}
                          </p>
                        )}
                        {ev.meetingUrl && (
                          <a
                            href={ev.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline"
                          >
                            <Video className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("cal.joinMeeting")}
                          </a>
                        )}
                      </div>
                      <div className="shrink-0">{eventActions(ev)}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-dialog-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface shadow-overlay"
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 id="calendar-event-dialog-title" className="text-lg font-semibold text-fg">
                {editingEvent ? t("cal.editEvent") : t("cal.addEvent")}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label={t("ui.close")}
                className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              <Input
                id="event-title"
                label={`${t("cal.form.title")} *`}
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder={t("cal.form.titlePlaceholder")}
                required
              />
              <div>
                <label htmlFor="event-description" className={candidateLabelClass}>
                  {t("cal.form.description")}
                </label>
                <textarea
                  id="event-description"
                  className={`${candidateFieldClass} resize-none`}
                  rows={2}
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder={t("cal.form.descriptionPlaceholder")}
                />
              </div>
              <div>
                <label htmlFor="event-type" className={candidateLabelClass}>
                  {t("cal.form.type")}
                </label>
                <select
                  id="event-type"
                  className={candidateFieldClass}
                  value={form.eventType}
                  onChange={(e) => updateField("eventType", e.target.value)}
                >
                  {EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {enumLabel(t, "cal.type", type)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="event-start"
                  label={`${t("cal.form.start")} *`}
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => updateField("startTime", e.target.value)}
                  required
                />
                <Input
                  id="event-end"
                  label={t("cal.form.end")}
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => updateField("endTime", e.target.value)}
                />
              </div>
              <Input
                id="event-location"
                label={t("cal.form.location")}
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
                placeholder={t("cal.form.locationPlaceholder")}
              />
              <Input
                id="event-url"
                label={t("cal.form.meetingUrl")}
                type="url"
                value={form.meetingUrl}
                onChange={(e) => updateField("meetingUrl", e.target.value)}
                placeholder={URL_PLACEHOLDERS.meeting}
              />
              <Input
                id="event-reminder"
                label={t("cal.form.reminder")}
                type="number"
                min={0}
                value={form.reminderMinutes}
                onChange={(e) => updateField("reminderMinutes", e.target.value)}
                placeholder="30"
              />
              {formError && <CandidateNotice>{t(formError)}</CandidateNotice>}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                  {t("ui.cancel")}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t("ui.saving") : editingEvent ? t("cal.form.update") : t("cal.form.create")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
