"use client";

import { useState } from "react";
import {
  LayoutDashboard, Boxes, ArrowLeftRight, ShoppingCart, Truck, MapPin,
  Tags, ClipboardCheck, Send, CalendarClock, BarChart3, Settings,
} from "lucide-react";
import OverviewTab from "./inventory/OverviewTab";
import ProductsTab from "./inventory/ProductsTab";
import StockTab from "./inventory/StockTab";
import PurchaseOrdersTab from "./inventory/PurchaseOrdersTab";
import SuppliersTab from "./inventory/SuppliersTab";
import LocationsTab from "./inventory/LocationsTab";
import TaxonomyTab from "./inventory/TaxonomyTab";
import CountsTab from "./inventory/CountsTab";
import TransfersTab from "./inventory/TransfersTab";
import BatchesTab from "./inventory/BatchesTab";
import ReportsTab from "./inventory/ReportsTab";
import SettingsTab from "./inventory/SettingsTab";

type Tab =
  | "overview" | "products" | "stock" | "purchase" | "suppliers" | "locations"
  | "taxonomy" | "counts" | "transfers" | "batches" | "reports" | "settings";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "products", label: "Products", icon: <Boxes className="h-4 w-4" /> },
  { id: "stock", label: "Stock Ledger", icon: <ArrowLeftRight className="h-4 w-4" /> },
  { id: "purchase", label: "Purchase Orders", icon: <ShoppingCart className="h-4 w-4" /> },
  { id: "suppliers", label: "Suppliers", icon: <Truck className="h-4 w-4" /> },
  { id: "locations", label: "Locations", icon: <MapPin className="h-4 w-4" /> },
  { id: "taxonomy", label: "Categories", icon: <Tags className="h-4 w-4" /> },
  { id: "counts", label: "Stock Counts", icon: <ClipboardCheck className="h-4 w-4" /> },
  { id: "transfers", label: "Transfers", icon: <Send className="h-4 w-4" /> },
  { id: "batches", label: "Batches", icon: <CalendarClock className="h-4 w-4" /> },
  { id: "reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
];

export default function InventoryPanel() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5 rounded-xl p-1" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", width: "fit-content", maxWidth: "100%" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={tab === t.id ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" } : { color: "var(--text-tertiary)" }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab onGoto={(t) => setTab(t as Tab)} />}
      {tab === "products" && <ProductsTab />}
      {tab === "stock" && <StockTab />}
      {tab === "purchase" && <PurchaseOrdersTab />}
      {tab === "suppliers" && <SuppliersTab />}
      {tab === "locations" && <LocationsTab />}
      {tab === "taxonomy" && <TaxonomyTab />}
      {tab === "counts" && <CountsTab />}
      {tab === "transfers" && <TransfersTab />}
      {tab === "batches" && <BatchesTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}
