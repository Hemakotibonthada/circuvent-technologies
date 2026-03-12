"use client";

// ══════════════════════════════════════════════════════════════
// Employee Calendar View — Month grid, daily schedule,
// quick event creation, and team events.
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  type: "MEETING" | "HOLIDAY" | "LEAVE" | "BIRTHDAY" | "ANNIVERSARY" | "TRAINING" | "DEADLINE" | "PERSONAL";
  description?: string;
  location?: string;
  isAllDay: boolean;
  attendees?: string[];
}

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  MEETING:     { bg: "bg-blue-900/30 border-blue-800/30", text: "text-blue-400", dot: "bg-blue-500" },
  HOLIDAY:     { bg: "bg-emerald-900/30 border-emerald-800/30", text: "text-emerald-400", dot: "bg-emerald-500" },
  LEAVE:       { bg: "bg-purple-900/30 border-purple-800/30", text: "text-purple-400", dot: "bg-purple-500" },
  BIRTHDAY:    { bg: "bg-pink-900/30 border-pink-800/30", text: "text-pink-400", dot: "bg-pink-500" },
  ANNIVERSARY: { bg: "bg-amber-900/30 border-amber-800/30", text: "text-amber-400", dot: "bg-amber-500" },
  TRAINING:    { bg: "bg-cyan-900/30 border-cyan-800/30", text: "text-cyan-400", dot: "bg-cyan-500" },
  DEADLINE:    { bg: "bg-red-900/30 border-red-800/30", text: "text-red-400", dot: "bg-red-500" },
  PERSONAL:    { bg: "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50", text: "text-slate-600 dark:text-slate-300", dot: "bg-slate-400" },
};

const DAYS_HEADER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarPage() {
  const { token } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeView, setActiveView] = useState<"month" | "list">("month");

  const [newEvent, setNewEvent] = useState({
    title: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    endTime: "10:00",
    type: "MEETING" as CalendarEvent["type"],
    description: "",
    location: "",
    isAllDay: false,
  });

  useEffect(() => {
    if (token) loadEvents();
  }, [token, currentMonth, currentYear]);

  const loadEvents = async () => {
    setLoading(true);
    const [eventsRes, holidaysRes, leavesRes] = await Promise.all([
      api.get<CalendarEvent[]>(`/hr/calendar/events/my?month=${currentMonth + 1}&year=${currentYear}`, token!),
      api.get<any[]>(`/hr/holidays?year=${currentYear}`, token!),
      api.get<any[]>(`/hr/leave?status=APPROVED`, token!),
    ]);

    const allEvents: CalendarEvent[] = [];

    if (eventsRes.success && eventsRes.data) {
      allEvents.push(...eventsRes.data);
    }

    // Convert holidays to calendar events
    if (holidaysRes.success && holidaysRes.data) {
      holidaysRes.data.forEach((h: any) => {
        allEvents.push({
          id: `holiday-${h.id || h.date}`,
          title: h.name || h.title,
          date: h.date,
          type: "HOLIDAY",
          isAllDay: true,
          description: h.type || "Public Holiday",
        });
      });
    }

    // Convert approved leaves
    if (leavesRes.success && leavesRes.data) {
      leavesRes.data.forEach((l: any) => {
        allEvents.push({
          id: `leave-${l.id}`,
          title: `${l.leaveType} Leave`,
          date: l.startDate?.split("T")[0],
          type: "LEAVE",
          isAllDay: true,
          description: l.reason,
        });
      });
    }

    // Add sample events if none exist
    if (allEvents.length === 0) {
      const today = new Date().toISOString().split("T")[0];
      allEvents.push(
        { id: "s1", title: "Team Standup", date: today, startTime: "09:30", endTime: "09:45", type: "MEETING", isAllDay: false, location: "Google Meet" },
        { id: "s2", title: "Sprint Planning", date: today, startTime: "14:00", endTime: "15:30", type: "MEETING", isAllDay: false, location: "Conference Room A" },
        { id: "s3", title: "Holi Festival", date: `${currentYear}-03-14`, type: "HOLIDAY", isAllDay: true },
        { id: "s4", title: "Code Review Training", date: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-20`, startTime: "11:00", endTime: "12:00", type: "TRAINING", isAllDay: false },
      );
    }

    setEvents(allEvents);
    setLoading(false);
  };

  const calendarGrid = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const today = new Date();

    const grid: Array<{ date: Date; day: number; isCurrentMonth: boolean; isToday: boolean; dateStr: string }[]> = [];
    let row: typeof grid[0] = [];

    // Previous month days
    const prevLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1, prevLastDay - i);
      row.push({ date: d, day: prevLastDay - i, isCurrentMonth: false, isToday: false, dateStr: d.toISOString().split("T")[0] });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(currentYear, currentMonth, day);
      const isToday = today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day;
      row.push({ date: d, day, isCurrentMonth: true, isToday, dateStr: d.toISOString().split("T")[0] });
      if (row.length === 7) {
        grid.push(row);
        row = [];
      }
    }

    // Next month days
    if (row.length > 0) {
      let nextDay = 1;
      while (row.length < 7) {
        const d = new Date(currentYear, currentMonth + 1, nextDay);
        row.push({ date: d, day: nextDay, isCurrentMonth: false, isToday: false, dateStr: d.toISOString().split("T")[0] });
        nextDay++;
      }
      grid.push(row);
    }

    return grid;
  }, [currentMonth, currentYear]);

  const getEventsForDate = (dateStr: string) => events.filter((e) => e.date === dateStr);

  const todayEvents = getEventsForDate(selectedDate).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

  const upcomingEvents = events
    .filter((e) => e.date >= new Date().toISOString().split("T")[0])
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const handleCreateEvent = async () => {
    if (!newEvent.title || !newEvent.date) return;
    const event: CalendarEvent = {
      id: `new-${Date.now()}`,
      ...newEvent,
    };

    await api.post("/hr/calendar/events", event, token!);
    setEvents((prev) => [...prev, event]);
    setShowCreate(false);
    setNewEvent({ title: "", date: new Date().toISOString().split("T")[0], startTime: "09:00", endTime: "10:00", type: "MEETING", description: "", location: "", isAllDay: false });
  };

  const navigateMonth = (delta: number) => {
    const newDate = new Date(currentYear, currentMonth + delta, 1);
    setCurrentMonth(newDate.getMonth());
    setCurrentYear(newDate.getFullYear());
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">📅 Calendar</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveView("month")} className={`px-3 py-1.5 rounded-lg text-xs ${activeView === "month" ? "bg-brand-600 text-slate-900 dark:text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}>Month</button>
          <button onClick={() => setActiveView("list")} className={`px-3 py-1.5 rounded-lg text-xs ${activeView === "list" ? "bg-brand-600 text-slate-900 dark:text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400"}`}>List</button>
          <button onClick={() => setShowCreate(true)} className="px-4 py-1.5 bg-brand-600 text-slate-900 dark:text-white rounded-lg text-xs hover:bg-brand-700">+ New Event</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : activeView === "month" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Calendar Grid */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {/* Month Navigation */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <button onClick={() => navigateMonth(-1)} className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-700 text-sm">←</button>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{MONTH_NAMES[currentMonth]} {currentYear}</h2>
              <button onClick={() => navigateMonth(1)} className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-700 text-sm">→</button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
              {DAYS_HEADER.map((day) => (
                <div key={day} className="px-2 py-2 text-center text-xs font-medium text-slate-500">{day}</div>
              ))}
            </div>

            {/* Calendar Cells */}
            {calendarGrid.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
                {week.map((cell) => {
                  const dayEvents = getEventsForDate(cell.dateStr);
                  const isSelected = cell.dateStr === selectedDate;
                  return (
                    <button
                      key={cell.dateStr}
                      onClick={() => setSelectedDate(cell.dateStr)}
                      className={`min-h-[80px] p-1.5 text-left transition-colors ${
                        !cell.isCurrentMonth ? "opacity-30" : ""
                      } ${isSelected ? "bg-brand-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                    >
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        cell.isToday ? "bg-brand-600 text-slate-900 dark:text-white font-bold" : "text-slate-600 dark:text-slate-300"
                      }`}>
                        {cell.day}
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {dayEvents.slice(0, 2).map((ev) => (
                          <div key={ev.id} className={`rounded px-1 py-0.5 text-[9px] truncate border ${EVENT_TYPE_COLORS[ev.type]?.bg}`}>
                            <span className={EVENT_TYPE_COLORS[ev.type]?.text}>{ev.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="text-[9px] text-slate-500">+{dayEvents.length - 2} more</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Selected Day */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                {new Date(selectedDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              {todayEvents.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No events</p>
              ) : (
                <div className="space-y-2">
                  {todayEvents.map((ev) => (
                    <div key={ev.id} className={`rounded-lg p-3 border ${EVENT_TYPE_COLORS[ev.type]?.bg}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`h-2 w-2 rounded-full ${EVENT_TYPE_COLORS[ev.type]?.dot}`} />
                        <span className={`text-sm font-medium ${EVENT_TYPE_COLORS[ev.type]?.text}`}>{ev.title}</span>
                      </div>
                      {!ev.isAllDay && ev.startTime && (
                        <p className="text-xs text-slate-400">{ev.startTime} — {ev.endTime}</p>
                      )}
                      {ev.isAllDay && <p className="text-xs text-slate-400">All day</p>}
                      {ev.location && <p className="text-xs text-slate-500 mt-0.5">📍 {ev.location}</p>}
                      {ev.description && <p className="text-xs text-slate-500 mt-0.5">{ev.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming Events */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Upcoming Events</h3>
              <div className="space-y-2">
                {upcomingEvents.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedDate(ev.date)}
                    className="w-full text-left rounded-lg bg-slate-100 dark:bg-slate-800/50 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${EVENT_TYPE_COLORS[ev.type]?.dot}`} />
                      <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{ev.title}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5 ml-4">
                      {new Date(ev.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {ev.startTime && ` · ${ev.startTime}`}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Legend</h3>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(EVENT_TYPE_COLORS).map(([type, colors]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className={`h-2 w-2 rounded-full ${colors.dot}`} />
                    <span className="text-[10px] text-slate-400">{type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* List View */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">All Events — {MONTH_NAMES[currentMonth]} {currentYear}</h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {events
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((ev) => (
                <div key={ev.id} className="flex items-center gap-4 p-4 hover:bg-white dark:bg-slate-800/30">
                  <div className="w-16 text-center">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{new Date(ev.date).getDate()}</p>
                    <p className="text-xs text-slate-500">{new Date(ev.date).toLocaleDateString("en-IN", { weekday: "short" })}</p>
                  </div>
                  <div className={`h-8 w-1 rounded-full ${EVENT_TYPE_COLORS[ev.type]?.dot}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{ev.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs ${EVENT_TYPE_COLORS[ev.type]?.text}`}>{ev.type}</span>
                      {ev.startTime && <span className="text-xs text-slate-500">{ev.startTime} — {ev.endTime}</span>}
                      {ev.isAllDay && <span className="text-xs text-slate-500">All day</span>}
                      {ev.location && <span className="text-xs text-slate-500">📍 {ev.location}</span>}
                    </div>
                  </div>
                </div>
              ))}
            {events.length === 0 && (
              <div className="py-8 text-center text-slate-500">No events this month</div>
            )}
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Event</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Title *</label>
                <input type="text" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm mt-1" placeholder="Event title" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">Date *</label>
                  <input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Type</label>
                  <select value={newEvent.type} onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value as CalendarEvent["type"] })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm mt-1">
                    {Object.keys(EVENT_TYPE_COLORS).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newEvent.isAllDay} onChange={(e) => setNewEvent({ ...newEvent, isAllDay: e.target.checked })} className="rounded border-slate-600" />
                <span className="text-sm text-slate-600 dark:text-slate-300">All day event</span>
              </label>
              {!newEvent.isAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-500">Start</label><input type="time" value={newEvent.startTime} onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm mt-1" /></div>
                  <div><label className="text-xs text-slate-500">End</label><input type="time" value={newEvent.endTime} onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm mt-1" /></div>
                </div>
              )}
              <div><label className="text-xs text-slate-500">Location</label><input type="text" value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm mt-1" placeholder="e.g., Google Meet, Room A" /></div>
              <div><label className="text-xs text-slate-500">Description</label><textarea value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} rows={2} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm mt-1" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreateEvent} disabled={!newEvent.title || !newEvent.date} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
