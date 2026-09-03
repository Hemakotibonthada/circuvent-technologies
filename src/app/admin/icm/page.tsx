"use client";

import AdminProductShell from "../AdminProductShell";
import IcmPanel from "../IcmPanel";

export default function IcmProductPage() {
  return (
    <AdminProductShell
      product="icm"
      title="Incident Management"
      subtitle="Severity-ordered queue with acknowledge and mitigate clocks"
    >
      <IcmPanel />
    </AdminProductShell>
  );
}
