"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, Badge, Button, Input, Select, StatCard } from "@/components/ui";
import { api } from "@/lib/api-client";

interface Employee {
  id: string;
  employeeCode: string;
  designation: string;
  department: string;
  dateOfJoining: string;
  panNumber: string | null;
  aadhaarNumber: string | null;
  uanNumber: string | null;
  bankAccountNo: string | null;
  bankIFSC: string | null;
  user: { firstName: string; lastName: string; email: string };
  _analysis?: {
    complianceChecklist: { item: string; status: "OK" | "MISSING" | "WARNING" }[];
    isProbationComplete: boolean;
    yearsOfService: number;
  };
}

const ONBOARDING_STEPS = [
  { id: "profile", label: "Personal Information", description: "Name, email, phone, and address verified", mandatory: true }, { key: "documents", label: "Identity Documents", description: "PAN card, Aadhaar, and photo ID submitted", mandatory: true }, { key: "bank", label: "Bank Account Details", description: "Bank account number and IFSC for salary credit", mandatory: true }, { key: "pf", label: "PF / UAN Registration", description: "Provident Fund UAN number linked", mandatory: true }, { key: "tax", label: "Tax Declaration", description: "Investment declaration for TDS computation", mandatory: false }, { key: "it_setup", label: "IT Equipment Setup", description: "Laptop, email, Slack, GitHub access provisioned", mandatory: true }, { key: "nda", label: "NDA & Policy Acknowledgment", description: "Non-disclosure and company policy signed", mandatory: true }, { key: "buddy", label: "Buddy Assignment", description: "Onboarding buddy assigned for first 30 days", mandatory: false }, { key: "training", label: "Orientation Training", description: "Company overview, tools, and process training completed", mandatory: false }, { key: "probation", label: "Probation Review", description: "6-month probation period review scheduled", mandatory: true },
];

export default function OnboardingPage() {
  const { token } = useAuth();
  const [employeeId, setEmployeeId] = useState("");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const handleFetch = async () => {
    if (!employeeId) return;
    setLoading(true);
    const res = await api.get<Employee>(`/hr/employees/${employeeId}`, token || undefined);
    if (res.success && res.data) {
      setEmployee(res.data);
      // Auto-detect completed steps based on data
      const auto = new Set<string>();
      if (res.data.user?.email) auto.add("profile");
      if (res.data.panNumber && res.data.aadhaarNumber) auto.add("documents");
      if (res.data.bankAccountNo && res.data.bankIFSC) auto.add("bank");
      if (res.data.uanNumber) auto.add("pf");
      if (res.data._analysis?.isProbationComplete) auto.add("probation");
      setCompletedSteps(auto);
    }
    setLoading(false);
  };

  const toggleStep = (stepId: string) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const completionPercent = ONBOARDING_STEPS.length > 0
    ? Math.round((completedSteps.size / ONBOARDING_STEPS.length) * 100)
    : 0;

  const mandatoryComplete = ONBOARDING_STEPS
    .filter((s) => s.mandatory)
    .every((s) => completedSteps.has(s.id));

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Employee Onboarding"
        subtitle="Track onboarding progress and compliance checklist"
        breadcrumbs={[{ label: "HR & Payroll", href: "/hr" }, { label: "Onboarding" }]}
      />

      {/* Employee Lookup */}
      <Card>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <Input label="Employee ID" placeholder="Enter employee ID..." value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
          </div>
          <Button onClick={handleFetch} loading={loading} disabled={!employeeId}>Load Employee</Button>
        </div>
      </Card>

      {employee && (
        <>
          {/* Employee Info Card */}
          <Card>
            <div className="flex items-center gap-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-slate-900 dark:text-white">
                {employee.user.firstName[0]}{employee.user.lastName[0]}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{employee.user.firstName} {employee.user.lastName}</h3>
                <p className="text-sm text-slate-400">{employee.designation} — {employee.department}</p>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-xs text-slate-500">{employee.employeeCode}</span>
                  <span className="text-xs text-slate-500">Joined: {new Date(employee.dateOfJoining).toLocaleDateString("en-IN")}</span>
                  <Badge color={employee._analysis?.isProbationComplete ? "green" : "amber"}>
                    {employee._analysis?.isProbationComplete ? "Confirmed" : "Probation"}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{completionPercent}%</p>
                <p className="text-xs text-slate-500">Onboarding</p>
              </div>
            </div>
          </Card>

          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Onboarding Progress</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{completedSteps.size}/{ONBOARDING_STEPS.length} completed</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${completionPercent === 100 ? "bg-green-500" : completionPercent >= 70 ? "bg-brand-500" : "bg-amber-500"}`}
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            {!mandatoryComplete && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">⚠ Some mandatory steps are incomplete</p>
            )}
            {mandatoryComplete && completionPercent < 100 && (
              <p className="mt-2 text-xs text-green-600 dark:text-green-400">✓ All mandatory steps complete. Optional steps remaining.</p>
            )}
            {completionPercent === 100 && (
              <p className="mt-2 text-xs text-green-600 dark:text-green-400">✓ Onboarding fully complete!</p>
            )}
          </div>

          {/* Checklist */}
          <div className="space-y-3">
            {ONBOARDING_STEPS.map((step, index) => {
              const isComplete = completedSteps.has(step.id);
              return (
                <div
                  key={step.id}
                  onClick={() => toggleStep(step.id)}
                  className={`flex items-center gap-4 rounded-xl border p-4 cursor-pointer transition-all ${
                    isComplete
                      ? "border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/5"
                      : "border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50 hover:border-slate-700"
                  }`}
                >
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isComplete ? "border-green-500 bg-green-200 dark:bg-green-500/20" : "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                  }`}>
                    {isComplete ? (
                      <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-xs text-slate-500">{index + 1}</span>
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${isComplete ? "text-green-600 dark:text-green-400 line-through" : "text-slate-900 dark:text-white"}`}>{step.label}</p>
                      {step.mandatory && <Badge color={isComplete ? "green" : "red"}>Required</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{step.description}</p>
                  </div>

                  <Badge color={isComplete ? "green" : "slate"}>{isComplete ? "Done" : "Pending"}</Badge>
                </div>
              );
            })}
          </div>

          {/* Compliance Status from API */}
          {employee._analysis?.complianceChecklist && (
            <Card>
              <CardHeader title="System Compliance Check" subtitle="Auto-detected from employee records" />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {employee._analysis.complianceChecklist.map((check) => (
                  <div key={check.item} className={`flex items-center gap-2 rounded-lg p-3 ${
                    check.status === "OK" ? "bg-green-50 dark:bg-green-500/5 border border-green-200 dark:border-green-500/20" :
                    check.status === "MISSING" ? "bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20" :
                    "bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20"
                  }`}>
                    <span className={`h-2 w-2 rounded-full ${
                      check.status === "OK" ? "bg-green-500" : check.status === "MISSING" ? "bg-red-500" : "bg-amber-500"
                    }`} />
                    <span className="text-xs text-slate-600 dark:text-slate-300">{check.item}</span>
                    <Badge color={check.status === "OK" ? "green" : check.status === "MISSING" ? "red" : "amber"} className="ml-auto">
                      {check.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
