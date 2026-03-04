"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { calendar, CalendarEventItem } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const eventTypeColors: Record<string, { bg: string; text: string; dot: string; variant: "info" | "warning" | "danger" | "default" }> = {
  INTERVIEW: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", variant: "info" },
  FOLLOW_UP: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-500", variant: "warning" },
  DEADLINE: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", variant: "danger" },
  CUSTOM: { bg: "bg-gray-50", text: "text-gray-700", dot: "bg-gray-500", variant: "default" },
};

function getEventColor(type: string) {
  return eventTypeColors[type] || eventTypeColors.CUSTOM;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const { user, isLoading } = useAuth();
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [form, setForm] = useState<EventFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, monthStr]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventList, upcomingList] = await Promise.all([
        calendar.list({ month: monthStr }),
        calendar.upcoming(),
      ]);
      setEvents(eventList);
      setUpcoming(upcomingList.slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  };

  // Build calendar grid
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid: (number | null)[] = [];

    for (let i = 0; i < firstDay; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(d);
    while (grid.length % 7 !== 0) grid.push(null);

    return grid;
  }, [year, month]);

  // Events by day
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
    setForm(emptyForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (ev: CalendarEventItem) => {
    setEditingEvent(ev);
    setForm({
      title: ev.title,
      description: ev.description || "",
      eventType: ev.eventType,
      startTime: ev.startTime ? ev.startTime.slice(0, 16) : "",
      endTime: ev.endTime ? ev.endTime.slice(0, 16) : "",
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
      setFormError("Title and start time are required");
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
      reminderMinutes: form.reminderMinutes ? parseInt(form.reminderMinutes) : null,
    };

    try {
      if (editingEvent) {
        await calendar.update(editingEvent.id, payload);
      } else {
        await calendar.create(payload);
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await calendar.delete(id);
      await loadData();
      if (selectedDay) {
        // Keep selected day but refresh
      }
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  const updateField = (field: keyof EventFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Calendar</h1>
          <p className="text-gray-600">Manage your interviews and scheduling</p>
        </div>
        <Button onClick={openAddModal}>Add Event</Button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Calendar Grid */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <Button variant="ghost" size="sm" onClick={prevMonth}>← Prev</Button>
                  <h2 className="text-lg font-semibold text-gray-900">{monthName}</h2>
                  <Button variant="ghost" size="sm" onClick={nextMonth}>Next →</Button>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-7 gap-1">
                  {DAYS.map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">
                      {d}
                    </div>
                  ))}
                  {calendarGrid.map((day, i) => {
                    const isToday = day !== null && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                    const hasEvents = day !== null && eventsByDay[day]?.length > 0;
                    const isSelected = day !== null && selectedDay === day;

                    return (
                      <button
                        key={i}
                        onClick={() => day !== null && setSelectedDay(day)}
                        disabled={day === null}
                        className={`relative h-12 rounded-lg text-sm transition-colors ${
                          day === null
                            ? ""
                            : isSelected
                            ? "bg-emerald-600 text-white font-bold"
                            : isToday
                            ? "bg-emerald-50 text-emerald-700 font-semibold"
                            : "hover:bg-gray-100 text-gray-700"
                        }`}
                      >
                        {day}
                        {hasEvents && !isSelected && (
                          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                            {eventsByDay[day]!.slice(0, 3).map((ev, idx) => (
                              <span
                                key={idx}
                                className={`w-1.5 h-1.5 rounded-full ${getEventColor(ev.eventType).dot}`}
                              />
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

          {/* Day Events Sidebar */}
          <div>
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-gray-900">
                  {selectedDay
                    ? `${new Date(year, month, selectedDay).toLocaleDateString("default", { weekday: "long", month: "short", day: "numeric" })}`
                    : "Select a day"}
                </h3>
              </CardHeader>
              <CardContent>
                {selectedDay === null ? (
                  <p className="text-sm text-gray-500 py-4">Click a day on the calendar to see events</p>
                ) : selectedDayEvents.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500 mb-3">No events on this day</p>
                    <Button size="sm" variant="outline" onClick={openAddModal}>
                      Add Event
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDayEvents.map((ev) => {
                      const color = getEventColor(ev.eventType);
                      return (
                        <div key={ev.id} className={`p-3 rounded-lg ${color.bg}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={color.variant}>
                              {ev.eventType.replace("_", " ")}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {new Date(ev.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <h4 className={`font-medium text-sm ${color.text}`}>{ev.title}</h4>
                          {ev.description && (
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{ev.description}</p>
                          )}
                          {ev.meetingUrl && (
                            <a
                              href={ev.meetingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-emerald-600 hover:underline mt-1 inline-block"
                            >
                              Join Meeting →
                            </a>
                          )}
                          {ev.location && (
                            <p className="text-xs text-gray-500 mt-1">📍 {ev.location}</p>
                          )}
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => openEditModal(ev)}
                              className="text-xs text-gray-600 hover:text-emerald-600"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(ev.id)}
                              className="text-xs text-gray-600 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Upcoming Events */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Upcoming Events</h2>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">No upcoming events</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcoming.map((ev) => {
                  const color = getEventColor(ev.eventType);
                  const start = new Date(ev.startTime);
                  return (
                    <div key={ev.id} className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
                      <div className="text-center flex-shrink-0 w-14">
                        <div className="text-xs text-gray-500 uppercase">
                          {start.toLocaleDateString("default", { month: "short" })}
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{start.getDate()}</div>
                      </div>
                      <div className={`w-1 self-stretch rounded-full ${color.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900 text-sm">{ev.title}</h3>
                          <Badge variant={color.variant}>
                            {ev.eventType.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {ev.endTime && ` – ${new Date(ev.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                        </p>
                        {ev.location && (
                          <p className="text-xs text-gray-500 mt-1">📍 {ev.location}</p>
                        )}
                        {ev.meetingUrl && (
                          <a
                            href={ev.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-600 hover:underline mt-1 inline-block"
                          >
                            Join Meeting →
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => openEditModal(ev)}
                          className="text-xs text-gray-500 hover:text-emerald-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(ev.id)}
                          className="text-xs text-gray-500 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Event Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingEvent ? "Edit Event" : "Add Event"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Input
                label="Title *"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="Interview with Company X"
                required
              />
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors resize-none"
                  rows={2}
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Add details..."
                />
              </div>
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
                <select
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  value={form.eventType}
                  onChange={(e) => updateField("eventType", e.target.value)}
                >
                  <option value="INTERVIEW">Interview</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="DEADLINE">Deadline</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Start Time *"
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => updateField("startTime", e.target.value)}
                  required
                />
                <Input
                  label="End Time"
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => updateField("endTime", e.target.value)}
                />
              </div>
              <Input
                label="Location"
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
                placeholder="Office address or virtual"
              />
              <Input
                label="Meeting URL"
                type="url"
                value={form.meetingUrl}
                onChange={(e) => updateField("meetingUrl", e.target.value)}
                placeholder="https://zoom.us/..."
              />
              <Input
                label="Reminder (minutes before)"
                type="number"
                value={form.reminderMinutes}
                onChange={(e) => updateField("reminderMinutes", e.target.value)}
                placeholder="30"
              />
              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}
              <div className="flex gap-3 justify-end">
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : editingEvent ? "Update Event" : "Create Event"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
