"use client";

import React, { useState, useMemo } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, CardHeader, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── colour maps ────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

const eventTypeColors: Record<string, BadgeColor> = {
  MEETING: "blue",
  HOLIDAY: "green",
  BIRTHDAY: "pink",
  TRAINING: "purple",
  DEADLINE: "red",
  TOWN_HALL: "amber",
  SOCIAL: "cyan",
  OTHER: "slate",
};

const rsvpColors: Record<string, BadgeColor> = {
  ACCEPTED: "green",
  DECLINED: "red",
  TENTATIVE: "amber",
  PENDING: "slate",
};

const roomStatusColors: Record<string, BadgeColor> = {
  AVAILABLE: "green",
  BOOKED: "red",
  MAINTENANCE: "amber",
};

/* ── types ──────────────────────────────────────────────── */

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  type: string;
  startTime: string;
  endTime: string;
  location?: string;
  roomId?: string;
  roomName?: string;
  organizer: string;
  organizerName?: string;
  attendees?: string[];
  isAllDay: boolean;
  isRecurring: boolean;
  recurrenceRule?: string;
  myRsvp?: string;
}

interface MeetingRoom {
  id: string;
  name: string;
  capacity: number;
  floor: string;
  facilities: string[];
  status: string;
  currentBooking?: string;
}

interface CalendarStats {
  todayEvents: number;
  thisWeekEvents: number;
  upcomingMeetings: number;
  availableRooms: number;
}

/* ── calendar helpers ───────────────────────────────────── */

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ── component ──────────────────────────────────────────── */

export default function CalendarPage() {
  const { token, user, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState("month");
  const tabs = [
    { id: "month", label: "Month View" },
    { id: "list", label: "Event List" },
    { id: "rooms", label: "Meeting Rooms" },
  ];

  /* ── calendar navigation ──────────────────────────────── */
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const goToday = () => { setCurrentYear(now.getFullYear()); setCurrentMonth(now.getMonth()); };

  /* ── data ─────────────────────────────────────────────── */
  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
  const { data: events, loading, refetch } = useApi<CalendarEvent[]>(`/calendar/events?month=${monthStr}`);
  const { data: rooms, loading: roomsLoading, refetch: refetchRooms } = useApi<MeetingRoom[]>("/calendar/rooms");
  const { data: stats } = useApi<CalendarStats>("/calendar/stats");

  /* ── state ────────────────────────────────────────────── */
  const [showCreate, setShowCreate] = useState(false);
  const [showEventDetail, setShowEventDetail] = useState<CalendarEvent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [form, setForm] = useState({
    title: "", description: "", type: "MEETING",
    startTime: "", endTime: "", location: "",
    roomId: "", isAllDay: "false", attendees: "",
  });

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  /* ── calendar grid ────────────────────────────────────── */
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfWeek(currentYear, currentMonth);
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    (events || []).forEach((ev) => {
      const dateKey = ev.startTime.split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(ev);
    });
    return map;
  }, [events]);

  /* ── actions ──────────────────────────────────────────── */
  const handleCreate = async () => {
    setSubmitting(true);
    const attendeeList = form.attendees.split(",").map((a) => a.trim()).filter(Boolean);
    const res = await api.post("/calendar/events", {
      ...form,
      isAllDay: form.isAllDay === "true",
      attendees: attendeeList,
      roomId: form.roomId || undefined,
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Event created");
      setShowCreate(false);
      setForm({ title: "", description: "", type: "MEETING", startTime: "", endTime: "", location: "", roomId: "", isAllDay: "false", attendees: "" });
      refetch();
    } else flash("error", res.error || "Failed to create event");
  };

  const handleRsvp = async (eventId: string, response: string) => {
    const res = await api.post(`/calendar/events/${eventId}/rsvp`, { response }, token || undefined);
    if (res.success) { flash("success", `RSVP: ${response}`); refetch(); setShowEventDetail(null); }
    else flash("error", res.error || "RSVP failed");
  };

  const handleDeleteEvent = async (id: string) => {
    const res = await api.delete(`/calendar/events/${id}`, token || undefined);
    if (res.success) { flash("success", "Event deleted"); refetch(); setShowEventDetail(null); }
    else flash("error", res.error || "Delete failed");
  };

  const handleBookRoom = async (roomId: string) => {
    setForm({ ...form, roomId });
    setShowCreate(true);
  };

  /* ── columns ──────────────────────────────────────────── */
  const eventListColumns = [
    {
      key: "title", header: "Event",
      render: (e: CalendarEvent) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{e.title}</p>
          {e.location && <p className="text-xs text-slate-500">{e.location}</p>}
        </div>
      ),
    },
    { key: "type", header: "Type", render: (e: CalendarEvent) => <Badge color={eventTypeColors[e.type] || "slate"}>{e.type}</Badge> },
    {
      key: "startTime", header: "When",
      render: (e: CalendarEvent) => (
        <span className="text-xs">
          {e.isAllDay ? formatDate(e.startTime) : formatDateTime(e.startTime)}
          {e.endTime && !e.isAllDay && ` — ${formatDateTime(e.endTime)}`}
        </span>
      ),
    },
    { key: "organizerName", header: "Organizer", render: (e: CalendarEvent) => e.organizerName || e.organizer },
    { key: "roomName", header: "Room", render: (e: CalendarEvent) => e.roomName || "—" },
    {
      key: "myRsvp", header: "RSVP",
      render: (e: CalendarEvent) => e.myRsvp ?
        <Badge color={rsvpColors[e.myRsvp] || "slate"}>{e.myRsvp}</Badge>
        : <span className="text-slate-500">—</span>,
    },
    {
      key: "actions", header: "",
      render: (e: CalendarEvent) => (
        <Button size="sm" variant="ghost" onClick={() => setShowEventDetail(e)}>View</Button>
      ),
    },
  ];

  const roomColumns = [
    { key: "name", header: "Room", render: (r: MeetingRoom) => <span className="font-medium text-slate-900 dark:text-white">{r.name}</span> },
    { key: "floor", header: "Floor" },
    { key: "capacity", header: "Capacity", render: (r: MeetingRoom) => `${r.capacity} people` },
    {
      key: "facilities", header: "Facilities",
      render: (r: MeetingRoom) => (
        <div className="flex flex-wrap gap-1">
          {(r.facilities || []).map((f) => (
            <span key={f} className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">{f}</span>
          ))}
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r: MeetingRoom) => <Badge color={roomStatusColors[r.status] || "slate"}>{r.status}</Badge> },
    { key: "currentBooking", header: "Current", render: (r: MeetingRoom) => r.currentBooking || <span className="text-slate-500">Free</span> },
    {
      key: "actions", header: "",
      render: (r: MeetingRoom) => r.status === "AVAILABLE" ? (
        <Button size="sm" variant="outline" onClick={() => handleBookRoom(r.id)}>Book</Button>
      ) : null,
    },
  ];

  const s = stats || { todayEvents: 0, thisWeekEvents: 0, upcomingMeetings: 0, availableRooms: 0 };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-500/30 bg-green-500/10 text-green-400"
            : "border border-red-500/30 bg-red-500/10 text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Calendar"
        subtitle="Events, meetings, and room bookings"
        breadcrumbs={[{ label: "Calendar" }]}
        actions={<Button onClick={() => setShowCreate(true)}>+ New Event</Button>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Today" value={s.todayEvents} color="blue" />
        <StatCard title="This Week" value={s.thisWeekEvents} color="green" />
        <StatCard title="Upcoming Meetings" value={s.upcomingMeetings} color="purple" />
        <StatCard title="Available Rooms" value={s.availableRooms} color="cyan" />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── month view ──────────────────────────────────── */}
      {activeTab === "month" && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={prevMonth}>← Prev</Button>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{MONTH_NAMES[currentMonth]} {currentYear}</h3>
              <Button size="sm" variant="outline" onClick={goToday}>Today</Button>
            </div>
            <Button size="sm" variant="ghost" onClick={nextMonth}>Next →</Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="h-6 w-6 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (
            <>
              {/* day headers */}
              <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
                {DAY_NAMES.map((d) => (
                  <div key={d} className="px-2 py-2 text-center text-xs font-medium uppercase text-slate-500">{d}</div>
                ))}
              </div>

              {/* day cells */}
              <div className="grid grid-cols-7">
                {/* empty cells before first day */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-slate-200 bg-slate dark:border-slate-800/50-100/50 dark:bg-slate-900/30 p-1" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayEvents = eventsByDate[dateKey] || [];
                  const isToday = dateKey === todayStr;

                  return (
                    <div
                      key={day}
                      className={`min-h-[100px] border-b border-r border-slate-200 dark:border-slate-800/50 p-1 transition-colors hover:bg-white dark:bg-slate-800/30 ${
                        isToday ? "bg-brand-600/5 ring-1 ring-brand-500/30" : ""
                      }`}
                    >
                      <div className={`mb-1 text-right text-xs font-medium ${isToday ? "text-brand-400" : "text-slate-500"}`}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <button
                            key={ev.id}
                            onClick={() => setShowEventDetail(ev)}
                            className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs ${
                              ev.type === "HOLIDAY" ? "bg-green-500/10 text-green-400"
                              : ev.type === "MEETING" ? "bg-blue-500/10 text-blue-400"
                              : ev.type === "BIRTHDAY" ? "bg-pink-500/10 text-pink-400"
                              : ev.type === "DEADLINE" ? "bg-red-500/10 text-red-400"
                              : "bg-slate-500/10 text-slate-400"
                            }`}
                          >
                            {ev.title}
                          </button>
                        ))}
                        {dayEvents.length > 3 && (
                          <p className="text-center text-xs text-slate-500">+{dayEvents.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── list view ───────────────────────────────────── */}
      {activeTab === "list" && (
        <Card>
          <CardHeader title="All Events" subtitle={`${MONTH_NAMES[currentMonth]} ${currentYear}`} />
          <DataTable columns={eventListColumns} data={events || []} keyExtractor={(e) => e.id} loading={loading} emptyMessage="No events this month." />
        </Card>
      )}

      {/* ── rooms ───────────────────────────────────────── */}
      {activeTab === "rooms" && (
        <Card>
          <CardHeader title="Meeting Rooms" subtitle="Available rooms for booking" />
          <DataTable columns={roomColumns} data={rooms || []} keyExtractor={(r) => r.id} loading={roomsLoading} emptyMessage="No meeting rooms configured." />
        </Card>
      )}

      {/* ── create event modal ──────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Event" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Title" placeholder="Team standup" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Select label="Type" options={[
              { value: "MEETING", label: "Meeting" },
              { value: "HOLIDAY", label: "Holiday" },
              { value: "BIRTHDAY", label: "Birthday" },
              { value: "TRAINING", label: "Training" },
              { value: "DEADLINE", label: "Deadline" },
              { value: "TOWN_HALL", label: "Town Hall" },
              { value: "SOCIAL", label: "Social" },
              { value: "OTHER", label: "Other" },
            ]} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Start" type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            <Input label="End" type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            <Select label="All Day?" options={[
              { value: "false", label: "No" }, { value: "true", label: "Yes" },
            ]} value={form.isAllDay} onChange={(e) => setForm({ ...form, isAllDay: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Location" placeholder="Conference Room A / Zoom link" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <Select label="Meeting Room" options={[
              { value: "", label: "No room" },
              ...(rooms || []).filter((r) => r.status === "AVAILABLE").map((r) => ({ value: r.id, label: `${r.name} (${r.capacity}p)` })),
            ]} value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} />
          </div>
          <Textarea label="Description" placeholder="Meeting agenda or details..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Attendees (comma-separated IDs)" placeholder="usr_001, usr_002" value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} />
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={submitting} disabled={!form.title || !form.startTime}>Create Event</Button>
          </div>
        </div>
      </Modal>

      {/* ── event detail modal ──────────────────────────── */}
      <Modal open={!!showEventDetail} onClose={() => setShowEventDetail(null)} title={showEventDetail?.title || "Event Details"} size="lg">
        {showEventDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500">Type</p>
                <Badge color={eventTypeColors[showEventDetail.type] || "slate"}>{showEventDetail.type}</Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500">When</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {showEventDetail.isAllDay ? formatDate(showEventDetail.startTime) : formatDateTime(showEventDetail.startTime)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Organizer</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{showEventDetail.organizerName || showEventDetail.organizer}</p>
              </div>
            </div>

            {showEventDetail.description && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">{showEventDetail.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              {showEventDetail.location && (
                <div>
                  <p className="text-xs text-slate-500">Location</p>
                  <p className="text-slate-600 dark:text-slate-300">{showEventDetail.location}</p>
                </div>
              )}
              {showEventDetail.roomName && (
                <div>
                  <p className="text-xs text-slate-500">Room</p>
                  <p className="text-slate-600 dark:text-slate-300">{showEventDetail.roomName}</p>
                </div>
              )}
            </div>

            {showEventDetail.myRsvp && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Your RSVP</p>
                <Badge color={rsvpColors[showEventDetail.myRsvp] || "slate"}>{showEventDetail.myRsvp}</Badge>
              </div>
            )}

            <div className="flex gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
              <Button size="sm" variant="outline" onClick={() => handleRsvp(showEventDetail.id, "ACCEPTED")}>Accept</Button>
              <Button size="sm" variant="ghost" onClick={() => handleRsvp(showEventDetail.id, "TENTATIVE")}>Tentative</Button>
              <Button size="sm" variant="danger" onClick={() => handleRsvp(showEventDetail.id, "DECLINED")}>Decline</Button>
              <div className="flex-1" />
              {(showEventDetail.organizer === user?.id || isAdmin) && (
                <Button size="sm" variant="danger" onClick={() => handleDeleteEvent(showEventDetail.id)}>Delete</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
