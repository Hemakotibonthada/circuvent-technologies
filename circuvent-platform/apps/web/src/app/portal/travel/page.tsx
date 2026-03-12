"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

interface TravelRequest {
  id: string;
  requestCode: string;
  purpose: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  status: string;
  estimatedCost: number;
  actualCost?: number;
  itinerary: ItineraryItem[];
  approvedBy?: string;
  createdAt: string;
  timeline: TimelineEvent[];
}

interface ItineraryItem {
  date: string;
  from: string;
  to: string;
  mode: string;
  accommodation?: string;
  notes?: string;
}

interface TimelineEvent {
  date: string;
  action: string;
  actor: string;
  notes?: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
  SUBMITTED: "bg-blue-900/50 text-blue-400",
  APPROVED: "bg-emerald-900/50 text-emerald-400",
  REJECTED: "bg-red-900/50 text-red-400",
  IN_PROGRESS: "bg-amber-900/50 text-amber-400",
  COMPLETED: "bg-cyan-900/50 text-cyan-400",
  CANCELLED: "bg-slate-100 dark:bg-slate-700 text-slate-400",
};

const TRAVEL_MODES = ["Flight", "Train", "Bus", "Cab", "Self-Drive", "Other"];

export default function PortalTravelPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [requests, setRequests] = useState<TravelRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<TravelRequest | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    purpose: "",
    destination: "",
    departureDate: "",
    returnDate: "",
    estimatedCost: "",
    notes: "",
    itinerary: [{ date: "", from: "", to: "", mode: "Flight", accommodation: "", notes: "" }] as ItineraryItem[],
  });

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadRequests(); }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
  };

  const loadRequests = async () => {
    if (!employee) return;
    setLoading(true);
    const res = await api.get<TravelRequest[]>(`/hr/travel-requests?employeeId=${employee.id}`, token!);
    if (res.success) setRequests(res.data || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!employee || !form.purpose || !form.destination || !form.departureDate || !form.returnDate) return;
    setSubmitting(true);
    await api.post("/hr/travel-requests", {
      employeeId: employee.id,
      purpose: form.purpose,
      destination: form.destination,
      departureDate: form.departureDate,
      returnDate: form.returnDate,
      estimatedCost: Number(form.estimatedCost) || 0,
      notes: form.notes,
      itinerary: form.itinerary.filter(i => i.date && i.from && i.to),
    }, token!);
    setShowCreate(false);
    resetForm();
    setSubmitting(false);
    loadRequests();
  };

  const resetForm = () => {
    setForm({
      purpose: "", destination: "", departureDate: "", returnDate: "",
      estimatedCost: "", notes: "",
      itinerary: [{ date: "", from: "", to: "", mode: "Flight", accommodation: "", notes: "" }],
    });
  };

  const addItineraryItem = () => {
    setForm({
      ...form,
      itinerary: [...form.itinerary, { date: "", from: "", to: "", mode: "Flight", accommodation: "", notes: "" }],
    });
  };

  const updateItinerary = (index: number, field: keyof ItineraryItem, value: string) => {
    const updated = [...form.itinerary];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, itinerary: updated });
  };

  const removeItinerary = (index: number) => {
    if (form.itinerary.length <= 1) return;
    setForm({ ...form, itinerary: form.itinerary.filter((_, i) => i !== index) });
  };

  const totalEstimated = requests.reduce((s, r) => s + (r.estimatedCost || 0), 0);
  const approvedCount = requests.filter(r => r.status === "APPROVED" || r.status === "COMPLETED").length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">✈️ My Travel Requests</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm">+ New Request</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-slate-900 dark:text-white">{requests.length}</p>
          <p className="text-xs text-slate-500">Total Requests</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-emerald-400">{approvedCount}</p>
          <p className="text-xs text-slate-500">Approved</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-blue-400">₹{totalEstimated.toLocaleString("en-IN")}</p>
          <p className="text-xs text-slate-500">Est. Total Cost</p>
        </div>
      </div>

      {/* Request List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading travel requests...</div>
        ) : requests.length === 0 ? (
          <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
            No travel requests yet. Create your first request above.
          </div>
        ) : (
          requests.map(req => (
            <div key={req.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 cursor-pointer hover:border-slate-700 transition-colors" onClick={() => setSelectedRequest(req)}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 font-mono">{req.requestCode}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[req.status] || STATUS_COLORS.DRAFT}`}>{req.status}</span>
                  </div>
                  <h3 className="text-sm font-medium text-white">{req.purpose}</h3>
                  <p className="text-xs text-slate-400 mt-1">📍 {req.destination}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(req.departureDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — {new Date(req.returnDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <p className="text-lg font-bold text-white">₹{(req.estimatedCost || 0).toLocaleString("en-IN")}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* View Request Detail with Timeline */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedRequest.purpose}</h2>
              <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[selectedRequest.status]}`}>{selectedRequest.status}</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-slate-500 text-xs">Destination</p><p className="text-slate-900 dark:text-white">{selectedRequest.destination}</p></div>
                <div><p className="text-slate-500 text-xs">Request Code</p><p className="text-white font-mono">{selectedRequest.requestCode}</p></div>
                <div><p className="text-slate-500 text-xs">Departure</p><p className="text-slate-900 dark:text-white">{new Date(selectedRequest.departureDate).toLocaleDateString("en-IN")}</p></div>
                <div><p className="text-slate-500 text-xs">Return</p><p className="text-slate-900 dark:text-white">{new Date(selectedRequest.returnDate).toLocaleDateString("en-IN")}</p></div>
                <div><p className="text-slate-500 text-xs">Estimated Cost</p><p className="text-slate-900 dark:text-white">₹{(selectedRequest.estimatedCost || 0).toLocaleString("en-IN")}</p></div>
                {selectedRequest.actualCost != null && (
                  <div><p className="text-slate-500 text-xs">Actual Cost</p><p className="text-slate-900 dark:text-white">₹{selectedRequest.actualCost.toLocaleString("en-IN")}</p></div>
                )}
              </div>

              {/* Itinerary */}
              {selectedRequest.itinerary?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-2 mt-3 uppercase tracking-wider">Itinerary</p>
                  <div className="space-y-2">
                    {selectedRequest.itinerary.map((item, i) => (
                      <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-400">{item.date ? new Date(item.date).toLocaleDateString("en-IN") : "—"}</span>
                          <span className="text-brand-400">{item.mode}</span>
                        </div>
                        <p className="text-slate-900 dark:text-white">{item.from} → {item.to}</p>
                        {item.accommodation && <p className="text-slate-400 mt-1">🏨 {item.accommodation}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              {selectedRequest.timeline?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-2 mt-3 uppercase tracking-wider">Timeline</p>
                  <div className="border-l-2 border-slate-200 dark:border-slate-700 ml-2 space-y-3">
                    {selectedRequest.timeline.map((event, i) => (
                      <div key={i} className="ml-4 relative">
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-brand-500 border-2 border-slate-900" />
                        <p className="text-xs text-slate-500">{new Date(event.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                        <p className="text-sm text-slate-900 dark:text-white">{event.action}</p>
                        <p className="text-xs text-slate-400">by {event.actor}</p>
                        {event.notes && <p className="text-xs text-slate-500 italic mt-0.5">{event.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={() => setSelectedRequest(null)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Travel Request Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">New Travel Request</h2>
            <div className="space-y-3">
              <input placeholder="Purpose of travel *" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <input placeholder="Destination *" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Departure Date *</label>
                  <input type="date" value={form.departureDate} onChange={e => setForm({ ...form, departureDate: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Return Date *</label>
                  <input type="date" value={form.returnDate} onChange={e => setForm({ ...form, returnDate: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                </div>
              </div>
              <input placeholder="Estimated Cost (₹)" type="number" value={form.estimatedCost} onChange={e => setForm({ ...form, estimatedCost: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              <textarea placeholder="Additional notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={2} />

              {/* Itinerary */}
              <div>
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Itinerary</p>
                <div className="space-y-3">
                  {form.itinerary.map((item, i) => (
                    <div key={i} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Leg {i + 1}</span>
                        {form.itinerary.length > 1 && (
                          <button onClick={() => removeItinerary(i)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" placeholder="Date" value={item.date} onChange={e => updateItinerary(i, "date", e.target.value)}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white text-xs" />
                        <select value={item.mode} onChange={e => updateItinerary(i, "mode", e.target.value)}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white text-xs">
                          {TRAVEL_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input placeholder="From" value={item.from} onChange={e => updateItinerary(i, "from", e.target.value)}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white text-xs" />
                        <input placeholder="To" value={item.to} onChange={e => updateItinerary(i, "to", e.target.value)}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white text-xs" />
                      </div>
                      <input placeholder="Accommodation (optional)" value={item.accommodation} onChange={e => updateItinerary(i, "accommodation", e.target.value)}
                        className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white text-xs" />
                    </div>
                  ))}
                </div>
                <button onClick={addItineraryItem} className="text-xs text-brand-400 hover:text-brand-300 mt-2">+ Add Leg</button>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={submitting || !form.purpose || !form.destination || !form.departureDate || !form.returnDate}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
