"use client";

import AdminProductShell from "../AdminProductShell";
import InventoryPanel from "../InventoryPanel";

export default function AssetsProductPage() {
  return (
    <AdminProductShell
      product="assets"
      title="Assets & Inventory"
      subtitle="Enterprise assets, hardware stock ledger, purchase orders and suppliers"
    >
      <InventoryPanel />
    </AdminProductShell>
  );
}
