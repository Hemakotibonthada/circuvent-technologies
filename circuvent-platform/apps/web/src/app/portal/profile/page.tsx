"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

const DOC_CATEGORIES = ["IDENTITY", "EDUCATION", "EXPERIENCE", "POLICY", "OFFER_LETTER", "TAX", "CERTIFICATION", "OTHER"];

export default function ProfilePage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [taxDeclarations, setTaxDeclarations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("personal");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit forms
  const [personalForm, setPersonalForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [bankForm, setBankForm] = useState({ bankAccountNo: "", bankIFSC: "", panNumber: "", aadhaarNumber: "", uanNumber: "" });
  const [docForm, setDocForm] = useState({ title: "", category: "IDENTITY", fileName: "", fileUrl: "", notes: "" });
  const [showDocModal, setShowDocModal] = useState(false);
  const [taxForm, setTaxForm] = useState({ financialYear: "2025-26", regime: "NEW", section80C: "", section80D: "", section24: "", hraExemption: "" });
  const [showTaxModal, setShowTaxModal] = useState(false);

  useEffect(() => { if (token) loadData(); }, [token]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    const empRes = await api.get<any[]>("/hr/employees", token);
    if (empRes.success && empRes.data) {
      const emp = empRes.data.find((e: any) => e.user?.email === user?.email) || empRes.data[0];
      setEmployee(emp);
      if (emp) {
        // Load full profile
        const profileRes = await api.get<any>(`/hr/portal/my-profile/${emp.id}`, token);
        if (profileRes.success && profileRes.data) {
          setEmployee(profileRes.data);
          setDocuments(profileRes.data.documents || []);
          setTaxDeclarations(profileRes.data.taxDeclarations || []);
          // Populate edit forms
          setPersonalForm({
            firstName: profileRes.data.user?.firstName || "",
            lastName: profileRes.data.user?.lastName || "",
            phone: profileRes.data.user?.phone || "",
          });
          setBankForm({
            bankAccountNo: profileRes.data.bankAccountNo || "",
            bankIFSC: profileRes.data.bankIFSC || "",
            panNumber: profileRes.data.panNumber || "",
            aadhaarNumber: profileRes.data.aadhaarNumber || "",
            uanNumber: profileRes.data.uanNumber || "",
          });
        }

        const revRes = await api.get<any[]>(`/hr/performance?employeeId=${emp.id}`, token);
        if (revRes.success) setReviews(revRes.data || []);
      }
    }
    setLoading(false);
  };

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const savePersonal = async () => {
    if (!employee) return;
    setSaving(true);
    const res = await api.patch(`/hr/portal/my-profile/${employee.id}/personal`, personalForm, token!);
    setSaving(false);
    if (res.success) { showMsg("success", "Personal details saved!"); loadData(); }
    else showMsg("error", res.error || "Failed to save");
  };

  const saveBank = async () => {
    if (!employee) return;
    setSaving(true);
    const res = await api.patch(`/hr/portal/my-profile/${employee.id}/bank`, bankForm, token!);
    setSaving(false);
    if (res.success) { showMsg("success", "Bank & compliance details saved!"); loadData(); }
    else showMsg("error", res.error || "Failed to save");
  };

  const uploadDocument = async () => {
    if (!employee || !docForm.title || !docForm.fileName || !docForm.fileUrl) return;
    setSaving(true);
    const res = await api.post(`/hr/portal/my-profile/${employee.id}/documents`, docForm, token!);
    setSaving(false);
    if (res.success) {
      showMsg("success", "Document uploaded!");
      setShowDocModal(false);
      setDocForm({ title: "", category: "IDENTITY", fileName: "", fileUrl: "", notes: "" });
      loadData();
    } else showMsg("error", res.error || "Upload failed");
  };

  const deleteDocument = async (docId: string) => {
    if (!employee) return;
    const res = await api.delete(`/hr/portal/my-profile/${employee.id}/documents/${docId}`, token!);
    if (res.success) { showMsg("success", "Document deleted"); loadData(); }
  };

  const saveTaxDeclaration = async () => {
    if (!employee) return;
    setSaving(true);
    const res = await api.post(`/hr/portal/my-profile/${employee.id}/tax-declaration`, {
      ...taxForm,
      section80C: Number(taxForm.section80C) || 0,
      section80D: Number(taxForm.section80D) || 0,
      section24: Number(taxForm.section24) || 0,
      hraExemption: Number(taxForm.hraExemption) || 0,
    }, token!);
    setSaving(false);
    if (res.success) {
      showMsg("success", "Tax declaration saved!");
      setShowTaxModal(false);
      loadData();
    } else showMsg("error", res.error || "Failed to save");
  };

  if (loading) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center"><div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!employee) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center"><p className="text-slate-500">Employee not found</p></div>;

  const e = employee;
  const u = e.user;
  const tabs = [
    { id: "personal", label: "Personal Info", icon: "👤" }, { id: "bank", label: "Bank & Tax", icon: "🏦" }, { id: "documents", label: "Documents", icon: "📁" }, { id: "tax", label: "Tax Declarations", icon: "📋" }, { id: "reviews", label: "Performance", icon: "⭐" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">👤 My Profile</h1>
        <p className="text-slate-400 text-sm">Manage your personal details, documents, and tax declarations</p>
      </div>

      {/* Toast Message */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${message.type === "success" ? "bg-emerald-600 text-slate-900 dark:text-white" : "bg-red-600 text-slate-900 dark:text-white"}`}>
          {message.type === "success" ? "✓" : "✗"} {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Profile Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-brand-500 to-cyan-600 rounded-full flex items-center justify-center text-3xl font-bold text-slate-900 dark:text-white mx-auto mb-3">
              {u?.firstName?.[0]}{u?.lastName?.[0]}
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{u?.firstName} {u?.lastName}</h2>
            <p className="text-slate-400">{e.designation}</p>
            <p className="text-sm text-slate-500">{e.department} · {e.employeeCode}</p>
            <span className={`mt-2 inline-block px-2 py-0.5 text-xs rounded ${u?.status === "ACTIVE" ? "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" : "bg-red-900/50 text-red-600 dark:text-red-400"}`}>{u?.status}</span>
          </div>
          <div className="space-y-2 text-sm border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="text-slate-600 dark:text-slate-300 text-xs">{u?.email}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="text-slate-600 dark:text-slate-300">{u?.phone || "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="text-slate-600 dark:text-slate-300">{e.employmentType}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Joined</span><span className="text-slate-600 dark:text-slate-300">{new Date(e.dateOfJoining).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Pay</span><span className="text-slate-600 dark:text-slate-300">{e.payFrequency} / {e.currency}</span></div>
          </div>
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="text-center bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2">
              <p className="text-lg font-bold text-brand-600 dark:text-brand-400">{documents.length}</p>
              <p className="text-xs text-slate-500">Documents</p>
            </div>
            <div className="text-center bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2">
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{reviews.length}</p>
              <p className="text-xs text-slate-500">Reviews</p>
            </div>
          </div>
        </div>

        {/* Right: Tabbed Content */}
        <div className="lg:col-span-3">
          {/* Tab Navigation */}
          <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap flex items-center gap-1.5 ${activeTab === tab.id ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}>
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>

          {/* ─── Personal Info Tab ─── */}
          {activeTab === "personal" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Personal Information</h2>
              <p className="text-sm text-slate-400 mb-6">Update your name and phone number. Email cannot be changed.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">First Name</label>
                  <input value={personalForm.firstName} onChange={ev => setPersonalForm({ ...personalForm, firstName: ev.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Last Name</label>
                  <input value={personalForm.lastName} onChange={ev => setPersonalForm({ ...personalForm, lastName: ev.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Phone</label>
                  <input value={personalForm.phone} onChange={ev => setPersonalForm({ ...personalForm, phone: ev.target.value })} placeholder="+91-"
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Email (read-only)</label>
                  <input value={u?.email || ""} disabled
                    className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-500 text-sm cursor-not-allowed" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Department (read-only)</label>
                  <input value={e.department} disabled
                    className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-500 text-sm cursor-not-allowed" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Designation (read-only)</label>
                  <input value={e.designation} disabled
                    className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-500 text-sm cursor-not-allowed" />
                </div>
              </div>
              <div className="flex justify-end mt-6">
                <button onClick={savePersonal} disabled={saving}
                  className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {/* ─── Bank & Tax Tab ─── */}
          {activeTab === "bank" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">🏦 Bank & Compliance Details</h2>
              <p className="text-sm text-slate-400 mb-6">Provide your bank account, PAN, Aadhaar, and PF details for payroll processing.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">PAN Number</label>
                  <input value={bankForm.panNumber} onChange={ev => setBankForm({ ...bankForm, panNumber: ev.target.value.toUpperCase() })} placeholder="ABCDE1234F" maxLength={10}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono focus:border-brand-500 outline-none" />
                  <p className="text-xs text-slate-600 mt-1">Format: 5 letters + 4 digits + 1 letter</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Aadhaar Number</label>
                  <input value={bankForm.aadhaarNumber} onChange={ev => setBankForm({ ...bankForm, aadhaarNumber: ev.target.value.replace(/\D/g, "").slice(0, 12) })} placeholder="XXXX XXXX XXXX" maxLength={12}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono focus:border-brand-500 outline-none" />
                  <p className="text-xs text-slate-600 mt-1">12-digit number (encrypted at rest)</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">UAN (PF Number)</label>
                  <input value={bankForm.uanNumber} onChange={ev => setBankForm({ ...bankForm, uanNumber: ev.target.value })} placeholder="100012345678"
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono focus:border-brand-500 outline-none" />
                  <p className="text-xs text-slate-600 mt-1">Universal Account Number for EPF</p>
                </div>
                <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Bank Account Details</h3>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Bank Account Number</label>
                  <input value={bankForm.bankAccountNo} onChange={ev => setBankForm({ ...bankForm, bankAccountNo: ev.target.value })} placeholder="Enter account number"
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono focus:border-brand-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">IFSC Code</label>
                  <input value={bankForm.bankIFSC} onChange={ev => setBankForm({ ...bankForm, bankIFSC: ev.target.value.toUpperCase() })} placeholder="SBIN0001234" maxLength={11}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono focus:border-brand-500 outline-none" />
                  <p className="text-xs text-slate-600 mt-1">11-character alphanumeric code</p>
                </div>
              </div>
              {/* Completion Status */}
              <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">📋 Compliance Completion</h3>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: "PAN", filled: !!bankForm.panNumber },
                    { label: "Aadhaar", filled: !!bankForm.aadhaarNumber },
                    { label: "UAN", filled: !!bankForm.uanNumber },
                    { label: "Account", filled: !!bankForm.bankAccountNo },
                    { label: "IFSC", filled: !!bankForm.bankIFSC },
                  ].map(item => (
                    <div key={item.label} className={`text-center p-2 rounded ${item.filled ? "bg-emerald-900/30 border border-emerald-800/50" : "bg-red-900/20 border border-red-800/50"}`}>
                      <span className="text-sm">{item.filled ? "✓" : "✗"}</span>
                      <p className="text-xs text-slate-400 mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end mt-6">
                <button onClick={saveBank} disabled={saving}
                  className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">
                  {saving ? "Saving..." : "Save Bank Details"}
                </button>
              </div>
            </div>
          )}

          {/* ─── Documents Tab ─── */}
          {activeTab === "documents" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">📁 My Documents</h2>
                  <p className="text-sm text-slate-400">Upload identity, education, experience, and certification documents</p>
                </div>
                <button onClick={() => setShowDocModal(true)} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">+ Upload Document</button>
              </div>
              {/* Document Categories Summary */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {["IDENTITY", "EDUCATION", "EXPERIENCE", "CERTIFICATION"].map(cat => {
                  const count = documents.filter(d => d.category === cat).length;
                  return (
                    <div key={cat} className={`text-center p-2 rounded-lg ${count > 0 ? "bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700" : "bg-red-900/10 border border-red-900/30"}`}>
                      <p className={`text-lg font-bold ${count > 0 ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400"}`}>{count}</p>
                      <p className="text-xs text-slate-500">{cat.slice(0, 4)}.</p>
                    </div>
                  );
                })}
              </div>
              {/* Document List */}
              {documents.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <span className="text-4xl block mb-2">📄</span>
                  <p>No documents uploaded yet</p>
                  <p className="text-xs mt-1">Upload your ID proof, education certificates, and experience letters</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:border-slate-600 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{doc.category === "IDENTITY" ? "🪪" : doc.category === "EDUCATION" ? "🎓" : doc.category === "EXPERIENCE" ? "💼" : doc.category === "CERTIFICATION" ? "🏅" : doc.category === "TAX" ? "📋" : "📄"}</span>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{doc.title}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{doc.category}</span>
                            <span>·</span>
                            <span>{doc.fileName}</span>
                            {doc.fileSize && <span>· {(doc.fileSize / 1024).toFixed(0)} KB</span>}
                          </div>
                          {doc.notes && <p className="text-xs text-slate-400 mt-0.5">{doc.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.isVerified ? (
                          <span className="px-2 py-0.5 text-xs bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded">✓ Verified</span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded">Pending</span>
                        )}
                        <span className="text-xs text-slate-500">{new Date(doc.createdAt).toLocaleDateString()}</span>
                        {!doc.isVerified && (
                          <button onClick={() => deleteDocument(doc.id)} className="text-xs text-red-600 dark:text-red-400 hover:text-red-300 ml-2">Delete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Required Documents Checklist */}
              <div className="mt-6 p-4 bg-white dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">📋 Required Documents Checklist</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { name: "PAN Card Copy", category: "IDENTITY" },
                    { name: "Aadhaar Card Copy", category: "IDENTITY" },
                    { name: "Passport / Voter ID", category: "IDENTITY" },
                    { name: "10th Marksheet", category: "EDUCATION" },
                    { name: "12th Marksheet", category: "EDUCATION" },
                    { name: "Degree Certificate", category: "EDUCATION" },
                    { name: "Previous Company Relieving Letter", category: "EXPERIENCE" },
                    { name: "Last 3 Months Payslips", category: "EXPERIENCE" },
                    { name: "Offer Letter (Circuvent)", category: "OFFER_LETTER" },
                    { name: "Cancelled Cheque / Bank Proof", category: "IDENTITY" },
                  ].map(req => {
                    const hasDoc = documents.some(d => d.title.toLowerCase().includes(req.name.toLowerCase().split(" ")[0].toLowerCase()));
                    return (
                      <div key={req.name} className="flex items-center gap-2">
                        <span className={`text-sm ${hasDoc ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600"}`}>{hasDoc ? "✓" : "○"}</span>
                        <span className={`text-xs ${hasDoc ? "text-slate-600 dark:text-slate-300" : "text-slate-500"}`}>{req.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─── Tax Declarations Tab ─── */}
          {activeTab === "tax" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">📋 Tax Declarations</h2>
                  <p className="text-sm text-slate-400">Submit your investment declarations for optimal TDS deduction</p>
                </div>
                <button onClick={() => setShowTaxModal(true)} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">+ New Declaration</button>
              </div>
              {taxDeclarations.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <span className="text-4xl block mb-2">📋</span>
                  <p>No tax declarations submitted</p>
                  <p className="text-xs mt-1">Submit your investment proofs to optimize TDS deductions</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {taxDeclarations.map((td: any) => (
                    <div key={td.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-slate-900 dark:text-white font-medium">FY {td.financialYear}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded ${td.regime === "NEW" ? "bg-blue-900/50 text-blue-600 dark:text-blue-400" : "bg-amber-900/50 text-amber-600 dark:text-amber-400"}`}>{td.regime} Regime</span>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-brand-600 dark:text-brand-400">₹{Number(td.totalDeclared).toLocaleString("en-IN")}</p>
                          <p className="text-xs text-slate-500">Total Declared</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-sm">
                        <div><p className="text-xs text-slate-500">80C</p><p className="text-slate-600 dark:text-slate-300 font-mono">₹{Number(td.section80C).toLocaleString("en-IN")}</p></div>
                        <div><p className="text-xs text-slate-500">80D</p><p className="text-slate-600 dark:text-slate-300 font-mono">₹{Number(td.section80D).toLocaleString("en-IN")}</p></div>
                        <div><p className="text-xs text-slate-500">Sec 24</p><p className="text-slate-600 dark:text-slate-300 font-mono">₹{Number(td.section24).toLocaleString("en-IN")}</p></div>
                        <div><p className="text-xs text-slate-500">HRA</p><p className="text-slate-600 dark:text-slate-300 font-mono">₹{Number(td.hraExemption).toLocaleString("en-IN")}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Performance Reviews Tab ─── */}
          {activeTab === "reviews" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">⭐ Performance Reviews</h2>
              {reviews.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <span className="text-4xl block mb-2">⭐</span>
                  <p>No performance reviews yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reviews.map((r: any) => (
                    <div key={r.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-900 dark:text-white font-medium">{r.period} — {r.cycle}</p>
                          <span className={`text-xs px-2 py-0.5 rounded ${r.status === "COMPLETED" || r.status === "ACKNOWLEDGED" ? "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" : "bg-amber-900/50 text-amber-600 dark:text-amber-400"}`}>{r.status}</span>
                        </div>
                        <div className="text-right">
                          {r.overallRating && <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{Number(r.overallRating).toFixed(1)}<span className="text-sm text-slate-500">/5</span></p>}
                        </div>
                      </div>
                      {(r.strengths || r.areasOfImprovement) && (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {r.strengths && <div><p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">Strengths</p><p className="text-xs text-slate-400">{r.strengths}</p></div>}
                          {r.areasOfImprovement && <div><p className="text-xs text-amber-600 dark:text-amber-400 mb-1">Areas to Improve</p><p className="text-xs text-slate-400">{r.areasOfImprovement}</p></div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Upload Document Modal ─── */}
      {showDocModal && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">📤 Upload Document</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Document Title *</label>
                <input value={docForm.title} onChange={ev => setDocForm({ ...docForm, title: ev.target.value })} placeholder="e.g., PAN Card, Degree Certificate"
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Category *</label>
                <select value={docForm.category} onChange={ev => setDocForm({ ...docForm, category: ev.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                  {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">File Name *</label>
                <input value={docForm.fileName} onChange={ev => setDocForm({ ...docForm, fileName: ev.target.value })} placeholder="pan_card.pdf"
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">File URL / Path *</label>
                <input value={docForm.fileUrl} onChange={ev => setDocForm({ ...docForm, fileUrl: ev.target.value })} placeholder="https://storage.circuvent.com/docs/..."
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
                <p className="text-xs text-slate-600 mt-1">Enter the URL where the document is hosted or will be uploaded</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Notes (optional)</label>
                <textarea value={docForm.notes} onChange={ev => setDocForm({ ...docForm, notes: ev.target.value })} placeholder="Any additional notes..."
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowDocModal(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button onClick={uploadDocument} disabled={saving || !docForm.title || !docForm.fileName || !docForm.fileUrl}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">{saving ? "Uploading..." : "Upload Document"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tax Declaration Modal ─── */}
      {showTaxModal && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">📋 Tax Declaration</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Financial Year</label>
                  <select value={taxForm.financialYear} onChange={ev => setTaxForm({ ...taxForm, financialYear: ev.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                    <option value="2025-26">2025-26</option><option value="2026-27">2026-27</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Tax Regime</label>
                  <select value={taxForm.regime} onChange={ev => setTaxForm({ ...taxForm, regime: ev.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                    <option value="OLD">Old Regime</option><option value="NEW">New Regime</option>
                  </select>
                </div>
              </div>
              {taxForm.regime === "OLD" && (
                <>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Section 80C (max ₹1,50,000)</label>
                    <input type="number" value={taxForm.section80C} onChange={ev => setTaxForm({ ...taxForm, section80C: ev.target.value })} placeholder="0"
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono" />
                    <p className="text-xs text-slate-600 mt-1">PPF, ELSS, LIC, EPF, NSC, tuition fees, etc.</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Section 80D — Medical Insurance</label>
                    <input type="number" value={taxForm.section80D} onChange={ev => setTaxForm({ ...taxForm, section80D: ev.target.value })} placeholder="0"
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono" />
                    <p className="text-xs text-slate-600 mt-1">Self: ₹25,000 / Parents: ₹25,000 (₹50,000 if senior)</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Section 24 — Home Loan Interest</label>
                    <input type="number" value={taxForm.section24} onChange={ev => setTaxForm({ ...taxForm, section24: ev.target.value })} placeholder="0"
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono" />
                    <p className="text-xs text-slate-600 mt-1">Maximum ₹2,00,000 for self-occupied property</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">HRA Exemption</label>
                    <input type="number" value={taxForm.hraExemption} onChange={ev => setTaxForm({ ...taxForm, hraExemption: ev.target.value })} placeholder="0"
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm font-mono" />
                  </div>
                </>
              )}
              {taxForm.regime === "NEW" && (
                <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 text-sm text-blue-300">
                  <p className="font-medium mb-1">New Tax Regime (FY 2025-26)</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Under the new regime, most deductions under 80C, 80D, and HRA are not available. Standard deduction of ₹75,000 is automatically applied.</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Benefit: Lower slab rates (0% up to ₹3L, 5% for ₹3-7L, 10% for ₹7-10L, etc.)</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowTaxModal(false)} className="px-4 py-2 text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm">Cancel</button>
              <button onClick={saveTaxDeclaration} disabled={saving}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">{saving ? "Saving..." : "Submit Declaration"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
