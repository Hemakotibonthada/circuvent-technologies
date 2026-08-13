// Circuvent — admin Reports engine (server-only).
//
// Turns the store's real order/customer/inventory/tax data into structured
// `ReportTable`s: a summary strip, a chartable series, a data table with a
// totals row and provenance notes. Every figure is a sum or ratio of a stored
// field. Where a figure genuinely has no source (operating expenses, a cost
// price nobody entered) it is omitted and called out in `notes` rather than
// defaulted to a plausible-looking zero — that honesty is the whole point of
// this rebuild.
//
// Tables carry RAW numbers; formatting lives in reports-format.ts so the UI,
// the CSV and the PDF all render the same values identically. Totals are summed
// from the same rounded rows they head, so "the total equals the sum of the
// rows" holds exactly.
//
// SERVER ONLY — pulls in store.ts (node:fs). Never import from a client file;
// import reports-format.ts for the shared model/formatters instead.

import {
  dailySeries, kpis, topProducts, topCustomers, categorySales, couponUsage,
  ordersInRange, paymentReconciliation, discountEffectiveness, customerRetention,
  acquisitionCohorts, fulfilmentSla, refundsReport, newVsReturning,
} from "./insights";
import { listProductRows, valuation, reorderSuggestions, deadStock } from "./inventory";
import { listHsnMappings } from "./admin-tax";
import { siteConfig } from "./config";
import type { StoredOrder } from "./store";
import {
  type ReportTable, type ReportColumn, type ReportSection, type Cell,
  type ChartSpec, type SummaryStat, type CompanyInfo,
  sumColumn,
} from "./reports-format";

// --------------------------------------------------------------- company ----

export type { CompanyInfo } from "./reports-format";

/**
 * Company identity for report/invoice headers.
 *
 * This is configuration, not a computed metric, so reading it from env with
 * branding defaults is legitimate. What is NOT done is inventing a GSTIN: if
 * REPORT_COMPANY_GSTIN is unset the header says "not configured" and the GST
 * report notes that its output cannot be filed until a real GSTIN is set.
 */
export function companyInfo(): CompanyInfo {
  const gstin = (process.env.REPORT_COMPANY_GSTIN || "").trim() || null;
  const address = (process.env.REPORT_COMPANY_ADDRESS || "").trim();
  return {
    name: process.env.REPORT_COMPANY_NAME || siteConfig.name,
    addressLines: address ? address.split("|").map((s) => s.trim()).filter(Boolean) : ["Registered office address not configured"],
    gstin,
    state: process.env.REPORT_COMPANY_STATE || "Telangana",
    stateCode: gstin && gstin.length >= 2 ? gstin.slice(0, 2) : (process.env.REPORT_COMPANY_STATE_CODE || null),
    email: siteConfig.contact.email,
  };
}

// ------------------------------------------------------- product resolution -

interface CatalogRow {
  productId: string;
  name: string;
  slug: string;
  category: string;
  costPrice: number;
  gstPct: number;
  hsn: string;
  price: number;
  stock: number;
}

interface CatalogIndex {
  byId: Map<string, CatalogRow>;
  bySlug: Map<string, CatalogRow>;
  byName: Map<string, CatalogRow>;
  rows: CatalogRow[];
}

/**
 * One join of the shop catalogue with its inventory metadata (cost price, GST
 * rate, HSN), indexed by id / slug / name so an order line — which may carry
 * any of the three — can be matched back to its cost and tax rate.
 */
function catalogIndex(): CatalogIndex {
  const rows: CatalogRow[] = listProductRows().map((r) => ({
    productId: r.productId,
    name: r.name,
    slug: r.slug,
    category: r.category,
    costPrice: r.costPrice,
    gstPct: r.gstPct,
    hsn: r.hsn,
    price: r.price,
    stock: r.stock,
  }));
  const byId = new Map<string, CatalogRow>();
  const bySlug = new Map<string, CatalogRow>();
  const byName = new Map<string, CatalogRow>();
  for (const r of rows) {
    byId.set(r.productId, r);
    if (r.slug) bySlug.set(r.slug.toLowerCase(), r);
    if (r.name) byName.set(r.name.toLowerCase(), r);
  }
  return { byId, bySlug, byName, rows };
}

function resolveRow(idx: CatalogIndex, item: { id?: string; slug?: string; name?: string }): CatalogRow | null {
  if (item.id && idx.byId.has(item.id)) return idx.byId.get(item.id)!;
  if (item.slug && idx.bySlug.has(item.slug.toLowerCase())) return idx.bySlug.get(item.slug.toLowerCase())!;
  if (item.name && idx.byName.has(item.name.toLowerCase())) return idx.byName.get(item.name.toLowerCase())!;
  return null;
}

interface TaxRate { hsn: string; ratePct: number; source: "mapping" | "inventory" | "none"; }

/**
 * Resolves the GST rate + HSN for a line.
 *
 * Priority is the Tax Center's admin-configured HSN mappings (by product, then
 * by category), then the product's own inventory metadata. Both are stored,
 * editable data — the old report hard-coded a flat 18% divisor on gross
 * revenue; this reads the actual rate each product carries. When neither source
 * knows the product, the rate is reported as unknown (source "none") and the
 * line is surfaced separately rather than silently taxed at a guessed rate.
 */
function taxRateFor(row: CatalogRow | null, category: string | undefined): TaxRate {
  const mappings = listHsnMappings();
  if (row) {
    const byProduct = mappings.find((m) => m.matchType === "productId" && m.matchValue === row.productId);
    if (byProduct) return { hsn: byProduct.hsnCode, ratePct: byProduct.gstRatePct, source: "mapping" };
  }
  const cat = row?.category || category;
  if (cat) {
    const byCat = mappings.find((m) => m.matchType === "category" && m.matchValue.toLowerCase() === cat.toLowerCase());
    if (byCat) return { hsn: byCat.hsnCode, ratePct: byCat.gstRatePct, source: "mapping" };
  }
  if (row && row.gstPct > 0) return { hsn: row.hsn || "—", ratePct: row.gstPct, source: "inventory" };
  return { hsn: row?.hsn || "—", ratePct: 0, source: "none" };
}

const money = (n: number) => Math.round(n);
const paidOrdersInRange = (days: number): StoredOrder[] => ordersInRange(days).filter((o) => o.paymentStatus === "paid");

// --------------------------------------------------------- totals helpers ---

/**
 * Builds a totals row aligned to `columns`. Numeric columns flagged `total` are
 * summed straight from `rows` (so the total provably equals the sum of the
 * rows). `overrides` supply non-additive totals (a weighted AOV, a recomputed
 * margin %). The first plain text column is labelled "Total".
 */
function buildTotals(columns: ReportColumn[], rows: Cell[][], overrides: Record<string, Cell> = {}): Cell[] {
  const totals: Cell[] = columns.map(() => null);
  let labelled = false;
  columns.forEach((col, i) => {
    if (Object.prototype.hasOwnProperty.call(overrides, col.key)) {
      totals[i] = overrides[col.key];
      return;
    }
    if (col.total && (col.type === "money" || col.type === "int" || col.type === "number")) {
      totals[i] = col.type === "money" || col.type === "int" ? Math.round(sumColumn(rows, i)) : Math.round(sumColumn(rows, i) * 100) / 100;
      return;
    }
    if (!labelled && (col.type === "text" || col.type === "date") && !col.total) {
      totals[i] = "Total";
      labelled = true;
    }
  });
  return totals;
}

function stat(label: string, value: string, extra: Partial<SummaryStat> = {}): SummaryStat {
  return { label, value, ...extra };
}

function base(id: string, title: string, subtitle: string, group: string, days: number, snapshot = false): Omit<ReportTable, "columns" | "rows" | "totals" | "summary" | "notes"> {
  return { id, title, subtitle, group, rangeDays: days, snapshot, generatedAt: new Date().toISOString(), currency: "INR" };
}

// display helpers for summary strings (₹ for on-screen/HTML summaries)
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const pct = (n: number | null) => (n === null ? "—" : n.toFixed(1) + "%");

// =============================================================== reports ====

/** Sales report — daily orders, revenue, AOV, units and new customers. */
function salesReport(days: number): ReportTable {
  const s = dailySeries(days);
  const k = kpis(days);
  const columns: ReportColumn[] = [
    { key: "date", label: "Date", type: "date" },
    { key: "orders", label: "Orders", type: "int", total: true },
    { key: "paidOrders", label: "Paid", type: "int", total: true },
    { key: "revenue", label: "Revenue", type: "money", total: true },
    { key: "gmv", label: "GMV", type: "money", total: true },
    { key: "aov", label: "AOV", type: "money" },
    { key: "units", label: "Units", type: "int", total: true },
    { key: "newCustomers", label: "New cust.", type: "int", total: true },
  ];
  const rows: Cell[][] = s.map((p) => [p.date, p.orders, p.paidOrders, money(p.revenue), money(p.gmv), money(p.aov), p.units, p.newCustomers]);
  const paid = s.reduce((a, p) => a + p.paidOrders, 0);
  const rev = s.reduce((a, p) => a + p.revenue, 0);
  const totals = buildTotals(columns, rows, { aov: paid ? Math.round(rev / paid) : 0 });
  return {
    ...base("sales", "Sales report", `Daily performance over the last ${days} days`, "Sales", days),
    summary: [
      stat("Revenue", inr(k.revenue.value), { deltaPct: round1(k.revenue.delta) }),
      stat("Orders", String(k.orders.value), { deltaPct: round1(k.orders.delta) }),
      stat("Avg order value", inr(k.aov.value), { deltaPct: round1(k.aov.delta) }),
      stat("New customers", String(k.newCustomers.value), { deltaPct: round1(k.newCustomers.delta) }),
      stat("Units sold", String(k.units.value), { deltaPct: round1(k.units.delta) }),
    ],
    columns, rows, totals,
    chart: { kind: "combo", labelKey: "date", valueKeys: ["revenue", "orders"], currency: true, title: "Revenue and orders" },
    notes: ["Revenue counts paid orders only; GMV counts all placed orders including unpaid/COD.", "Deltas compare against the immediately preceding window of equal length."],
  };
}

/** Product performance — units, orders, revenue and gross margin per product. */
function productsReport(days: number): ReportTable {
  const idx = catalogIndex();
  const prods = topProducts(1000, days);
  let unknownCost = 0;
  const columns: ReportColumn[] = [
    { key: "name", label: "Product", type: "text" },
    { key: "orders", label: "Orders", type: "int", total: true },
    { key: "units", label: "Units", type: "int", total: true },
    { key: "revenue", label: "Revenue", type: "money", total: true },
    { key: "cost", label: "Est. COGS", type: "money", total: true },
    { key: "margin", label: "Gross margin", type: "money", total: true },
    { key: "marginPct", label: "Margin %", type: "percent" },
  ];
  const rows: Cell[][] = prods.map((p) => {
    const row = idx.byName.get(p.name.toLowerCase()) || null;
    const cost = row ? row.costPrice : 0;
    if (!row || cost <= 0) unknownCost++;
    const cogs = money(cost * p.qty);
    const revenue = money(p.revenue);
    const margin = revenue - cogs;
    const marginPct = revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : 0;
    return [p.name, p.orders, p.qty, revenue, cogs, margin, marginPct];
  });
  const totRev = sumColumn(rows, 3), totMargin = sumColumn(rows, 5);
  const totals = buildTotals(columns, rows, { marginPct: totRev > 0 ? Math.round((totMargin / totRev) * 1000) / 10 : 0 });
  const notes = ["Ranked by revenue over the window.", "Est. COGS uses each product's cost price from Inventory (which defaults to 60% of selling price until a real cost is entered)."];
  if (unknownCost > 0) notes.push(`${unknownCost} product(s) had no cost price on record; their COGS and margin are shown as ₹0 and understate true cost.`);
  return {
    ...base("products", "Product performance", `Top products over the last ${days} days`, "Sales", days),
    summary: [
      stat("Products sold", String(prods.length)),
      stat("Revenue", inr(totRev)),
      stat("Gross margin", inr(totMargin)),
      stat("Margin %", pct(totRev > 0 ? Math.round((totMargin / totRev) * 1000) / 10 : null)),
    ],
    columns, rows, totals,
    chart: { kind: "hbar", labelKey: "name", valueKeys: ["revenue"], currency: true, limit: 12, title: "Revenue by product" },
    notes,
  };
}

/** Customer report — top customers by spend within the window. */
function customersReport(days: number): ReportTable {
  const custs = topCustomers(1000, days);
  const columns: ReportColumn[] = [
    { key: "name", label: "Customer", type: "text" },
    { key: "email", label: "Email", type: "text" },
    { key: "orders", label: "Orders", type: "int", total: true },
    { key: "spend", label: "Spend", type: "money", total: true },
    { key: "aov", label: "Avg order", type: "money" },
  ];
  const rows: Cell[][] = custs.map((c) => [c.name, c.email, c.orders, money(c.spend), c.orders ? money(c.spend / c.orders) : 0]);
  const spend = sumColumn(rows, 3), orders = sumColumn(rows, 2);
  const totals = buildTotals(columns, rows, { aov: orders ? Math.round(spend / orders) : 0 });
  const nvr = newVsReturning(days);
  return {
    ...base("customers", "Customer report", `Top customers by spend over the last ${days} days`, "Sales", days),
    summary: [
      stat("Paying customers", String(custs.length)),
      stat("Total spend", inr(spend)),
      stat("New buyers", String(nvr.new)),
      stat("Returning buyers", String(nvr.returning)),
    ],
    columns, rows, totals,
    chart: { kind: "hbar", labelKey: "name", valueKeys: ["spend"], currency: true, limit: 12, title: "Spend by customer" },
    notes: ["Spend is recomputed from paid orders inside the window — not the customer's lifetime total."],
  };
}

/** Category report — revenue and units by product category. */
function categoriesReport(days: number): ReportTable {
  const cats = categorySales(days);
  const columns: ReportColumn[] = [
    { key: "name", label: "Category", type: "text" },
    { key: "units", label: "Units", type: "int", total: true },
    { key: "revenue", label: "Revenue", type: "money", total: true },
    { key: "sharePct", label: "Share", type: "percent" },
  ];
  const total = cats.reduce((s, c) => s + c.revenue, 0) || 1;
  const rows: Cell[][] = cats.map((c) => [c.name, c.units, money(c.revenue), Math.round((c.revenue / total) * 1000) / 10]);
  const totals = buildTotals(columns, rows, { sharePct: 100 });
  return {
    ...base("categories", "Category report", `Revenue by category over the last ${days} days`, "Sales", days),
    summary: [
      stat("Categories", String(cats.length)),
      stat("Revenue", inr(cats.reduce((s, c) => s + c.revenue, 0))),
      stat("Top category", cats[0]?.name || "—"),
    ],
    columns, rows, totals,
    chart: { kind: "donut", labelKey: "name", valueKeys: ["revenue"], currency: true, title: "Revenue share" },
    notes: ["Line revenue is attributed to the category recorded on each product at sale time."],
  };
}

/** Coupon report — usage and discount given per coupon. */
function couponsReport(days: number): ReportTable {
  const coupons = couponUsage(days);
  const eff = discountEffectiveness(days);
  const columns: ReportColumn[] = [
    { key: "code", label: "Coupon", type: "text" },
    { key: "uses", label: "Uses", type: "int", total: true },
    { key: "discount", label: "Discount given", type: "money", total: true },
    { key: "avgDiscount", label: "Avg / use", type: "money" },
  ];
  const rows: Cell[][] = coupons.map((c) => [c.code, c.uses, money(c.discount), c.uses ? money(c.discount / c.uses) : 0]);
  const uses = sumColumn(rows, 1), disc = sumColumn(rows, 2);
  const totals = buildTotals(columns, rows, { avgDiscount: uses ? Math.round(disc / uses) : 0 });
  return {
    ...base("coupons", "Coupon report", `Coupon usage over the last ${days} days`, "Marketing", days),
    summary: [
      stat("Coupons used", String(coupons.length)),
      stat("Redemptions", String(uses)),
      stat("Discount given", inr(disc)),
      stat("AOV with coupon", inr(eff.withCoupon.aov)),
    ],
    columns, rows, totals,
    chart: { kind: "bar", labelKey: "code", valueKeys: ["discount"], currency: true, title: "Discount by coupon" },
    notes: ["Discount given is the rupee value deducted by each coupon on the orders that used it."],
  };
}

/**
 * GST / tax report — a GSTR-1-style HSN summary computed from each product's
 * actual GST rate, with CGST/SGST split and a grand total.
 *
 * The gross value of each paid order is allocated across its lines in
 * proportion to line value, so the total invoice value equals the revenue
 * actually collected (including any order-level discount and shipping). Each
 * line's slice is treated as GST-inclusive at that product's rate; tax is
 * backed out and split equally into CGST and SGST for an intra-state supply.
 */
function taxReport(days: number): ReportTable {
  const idx = catalogIndex();
  const co = companyInfo();
  interface Slab { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; tax: number; invoice: number; units: number; }
  const slabs = new Map<string, Slab>();
  let unmappedInvoice = 0, unmappedUnits = 0;
  for (const o of paidOrdersInRange(days)) {
    const lineSum = o.items.reduce((s, it) => s + it.lineTotal, 0);
    o.items.forEach((it, i) => {
      const share = lineSum > 0 ? it.lineTotal / lineSum : 1 / o.items.length;
      const inclusive = o.total * share;
      const row = resolveRow(idx, it);
      const rate = taxRateFor(row, undefined);
      if (rate.source === "none") { unmappedInvoice += inclusive; unmappedUnits += it.qty; }
      const key = `${rate.hsn}|${rate.ratePct}`;
      const slab = slabs.get(key) || { hsn: rate.hsn, rate: rate.ratePct, taxable: 0, cgst: 0, sgst: 0, tax: 0, invoice: 0, units: 0 };
      const invoice = inclusive;
      const taxable = rate.ratePct > 0 ? invoice / (1 + rate.ratePct / 100) : invoice;
      const tax = invoice - taxable;
      slab.invoice += invoice;
      slab.taxable += taxable;
      slab.tax += tax;
      slab.units += it.qty;
      slabs.set(key, slab);
      void i;
    });
  }
  const columns: ReportColumn[] = [
    { key: "hsn", label: "HSN", type: "text" },
    { key: "rate", label: "Rate", type: "percent" },
    { key: "units", label: "Qty", type: "int", total: true },
    { key: "taxable", label: "Taxable value", type: "money", total: true },
    { key: "cgst", label: "CGST", type: "money", total: true },
    { key: "sgst", label: "SGST", type: "money", total: true },
    { key: "tax", label: "Total GST", type: "money", total: true },
    { key: "invoice", label: "Invoice value", type: "money", total: true },
  ];
  const rows: Cell[][] = [...slabs.values()]
    .sort((a, b) => b.invoice - a.invoice)
    .map((s) => {
      const invoice = money(s.invoice);
      const taxable = money(s.taxable);
      const tax = invoice - taxable;
      const cgst = Math.floor(tax / 2);
      const sgst = tax - cgst;
      return [s.hsn, s.rate, s.units, taxable, cgst, sgst, tax, invoice];
    });
  const totals = buildTotals(columns, rows);
  const totalTax = sumColumn(rows, 6), totalTaxable = sumColumn(rows, 3), totalInvoice = sumColumn(rows, 7);

  const notes = [
    "Computed from paid orders in the window; each order's gross value is allocated across its lines and treated as GST-inclusive at that product's stored rate.",
    "CGST and SGST assume an intra-state supply (place of supply = seller's state). For inter-state sales the same total would be IGST.",
  ];
  if (!co.gstin) notes.push("Company GSTIN is not configured (REPORT_COMPANY_GSTIN) — this summary cannot be filed as-is.");
  if (unmappedUnits > 0) notes.push(`${unmappedUnits} unit(s) worth ${inr(unmappedInvoice)} had no HSN/GST rate on record and are grouped under HSN "—" at 0% — map them in the Tax Center to tax them correctly.`);

  return {
    ...base("tax", "GST / tax report", `HSN-wise GST summary over the last ${days} days`, "Finance", days),
    summary: [
      stat("Taxable value", inr(totalTaxable)),
      stat("Total GST", inr(totalTax)),
      stat("CGST + SGST", inr(sumColumn(rows, 4)) + " + " + inr(sumColumn(rows, 5))),
      stat("Invoice value", inr(totalInvoice)),
    ],
    columns, rows, totals,
    chart: { kind: "stacked", labelKey: "hsn", valueKeys: ["cgst", "sgst"], currency: true, title: "GST by HSN (CGST / SGST)" },
    notes,
  };
}

/**
 * Profit & Loss — a real trading statement from paid orders and stored costs.
 *
 * Stops at gross profit after returns: operating expenses (salaries, rent,
 * marketing spend, logistics) are not held anywhere in this store, so a "net
 * profit" line would be fabricated. That line is deliberately omitted and the
 * omission is stated, per the no-invention rule.
 */
function pnlReport(days: number): ReportTable {
  const idx = catalogIndex();
  const paid = paidOrdersInRange(days);
  let subtotal = 0, discount = 0, shipping = 0, gross = 0;
  let cogs = 0, unitsWithCost = 0, unitsTotal = 0, unitsNoCost = 0;
  let outputGst = 0;
  for (const o of paid) {
    subtotal += o.subtotal;
    discount += o.discount || 0;
    shipping += o.shipping;
    gross += o.total;
    const lineSum = o.items.reduce((s, it) => s + it.lineTotal, 0);
    for (const it of o.items) {
      unitsTotal += it.qty;
      const row = resolveRow(idx, it);
      if (row && row.costPrice > 0) { cogs += row.costPrice * it.qty; unitsWithCost += it.qty; }
      else unitsNoCost += it.qty;
      const share = lineSum > 0 ? it.lineTotal / lineSum : 1 / o.items.length;
      const inclusive = o.total * share;
      const rate = taxRateFor(row, undefined);
      if (rate.ratePct > 0) outputGst += inclusive - inclusive / (1 + rate.ratePct / 100);
    }
  }
  const refunds = refundsReport(days);
  const netRevenue = gross - outputGst;
  const grossProfit = netRevenue - cogs;
  const afterReturns = grossProfit - refunds.refundValue;

  const columns: ReportColumn[] = [
    { key: "line", label: "Line item", type: "text" },
    { key: "amount", label: "Amount", type: "money", align: "right" },
  ];
  const rows: Cell[][] = [
    ["Gross merchandise value (subtotal)", money(subtotal)],
    ["Less: discounts", -money(discount)],
    ["Add: shipping charged", money(shipping)],
    ["Gross revenue (GST inclusive)", money(gross)],
    ["Less: GST output tax", -money(outputGst)],
    ["Net revenue (ex-GST)", money(netRevenue)],
    ["Less: cost of goods sold", -money(cogs)],
    ["Gross profit", money(grossProfit)],
    ["Less: refunds on returns", -money(refunds.refundValue)],
    ["Gross profit after returns", money(afterReturns)],
  ];
  const marginPct = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : null;
  const notes = [
    "Trading account from paid orders in the window. GST output tax is backed out per product rate so net revenue is ex-GST.",
    "COGS uses each product's Inventory cost price (which defaults to 60% of price until a real cost is entered).",
    "Operating expenses (salaries, rent, marketing, logistics) are not recorded in this store, so no net-profit line is shown — it would be fabricated.",
  ];
  if (unitsNoCost > 0) notes.push(`${unitsNoCost} of ${unitsTotal} units sold have no cost price on record; COGS and gross profit cover the remaining ${unitsWithCost} units and overstate profit for the rest.`);
  return {
    ...base("pnl", "Profit & Loss", `Trading statement over the last ${days} days`, "Finance", days),
    summary: [
      stat("Net revenue", inr(netRevenue)),
      stat("COGS", inr(cogs)),
      stat("Gross profit", inr(grossProfit)),
      stat("Gross margin", pct(marginPct)),
    ],
    columns, rows, totals: [],
    chart: { kind: "waterfall", labelKey: "line", valueKeys: ["amount"], currency: true, title: "Revenue to gross profit" },
    notes,
  };
}

/** Inventory valuation — stock value at cost and retail, by category. */
function inventoryReport(days: number): ReportTable {
  const val = valuation();
  const columns: ReportColumn[] = [
    { key: "name", label: "Category", type: "text" },
    { key: "units", label: "Units", type: "int", total: true },
    { key: "cost", label: "Value at cost", type: "money", total: true },
    { key: "retail", label: "Value at retail", type: "money", total: true },
    { key: "potential", label: "Potential margin", type: "money", total: true },
  ];
  const rows: Cell[][] = val.byCategory.map((c) => [c.name, c.units, money(c.cost), money(c.retail), money(c.retail - c.cost)]);
  const totals = buildTotals(columns, rows);
  return {
    ...base("inventory", "Inventory valuation", "Current stock value by category", "Operations", days, true),
    summary: [
      stat("SKUs", String(val.skuCount)),
      stat("Units in stock", String(val.units)),
      stat("Value at cost", inr(val.cost)),
      stat("Value at retail", inr(val.retail)),
      stat("Potential margin", inr(val.potentialProfit)),
    ],
    columns, rows, totals,
    chart: { kind: "donut", labelKey: "name", valueKeys: ["retail"], currency: true, title: "Retail value share" },
    notes: ["A point-in-time snapshot of live stock — not affected by the date range.", "Cost value uses Inventory cost price; retail value uses the current selling price."],
  };
}

/** Low-stock / reorder report — what to buy, how much, at what cost. */
function reorderReport(days: number): ReportTable {
  const rows0 = reorderSuggestions();
  const dead = deadStock();
  const columns: ReportColumn[] = [
    { key: "name", label: "Product", type: "text" },
    { key: "sku", label: "SKU", type: "text" },
    { key: "stock", label: "In stock", type: "int", total: true },
    { key: "reorderPoint", label: "Reorder point", type: "int" },
    { key: "suggestedQty", label: "Suggested qty", type: "int", total: true },
    { key: "estCost", label: "Est. cost", type: "money", total: true },
  ];
  const rows: Cell[][] = rows0.map((r) => [r.name, r.sku, r.stock, r.reorderPoint, r.suggestedQty, money(r.estCost)]);
  const totals = buildTotals(columns, rows);
  const notes = ["Products at or below their reorder point. Suggested quantity is the larger of the reorder quantity and the shortfall to the reorder point.", "Est. cost uses the Inventory cost price."];
  if (dead.length) notes.push(`${dead.length} SKU(s) have stock but no recent sales (dead stock) — review separately before reordering.`);
  return {
    ...base("reorder", "Low-stock / reorder", "Products at or below reorder point", "Operations", days, true),
    summary: [
      stat("Needing reorder", String(rows0.length)),
      stat("Units to order", String(rows0.reduce((s, r) => s + r.suggestedQty, 0))),
      stat("Est. purchase cost", inr(rows0.reduce((s, r) => s + r.estCost, 0))),
      stat("Dead stock SKUs", String(dead.length)),
    ],
    columns, rows, totals,
    chart: { kind: "hbar", labelKey: "name", valueKeys: ["estCost"], currency: true, limit: 12, title: "Reorder cost" },
    notes,
  };
}

/** Refunds & returns report. */
function refundsReportTable(days: number): ReportTable {
  const r = refundsReport(days);
  const columns: ReportColumn[] = [
    { key: "reason", label: "Reason", type: "text" },
    { key: "count", label: "Returns", type: "int", total: true },
    { key: "refundValue", label: "Refunded", type: "money", total: true },
  ];
  const rows: Cell[][] = r.byReason.map((x) => [x.reason, x.count, money(x.refundValue)]);
  const totals = buildTotals(columns, rows);
  const statusRows: Cell[][] = Object.entries(r.byStatus).map(([s, n]) => [s, n]);
  const sections: ReportSection[] = statusRows.length
    ? [{ title: "By status", columns: [{ key: "status", label: "Status", type: "text" }, { key: "count", label: "Count", type: "int", total: true }], rows: statusRows, totals: buildTotals([{ key: "status", label: "Status", type: "text" }, { key: "count", label: "Count", type: "int", total: true }], statusRows) }]
    : [];
  const notes = ["Returns are dated by request time. Return rate is returns ÷ orders in the same window."];
  if (r.total > r.refundAmountKnown) notes.push(`${r.total - r.refundAmountKnown} return(s) have no refund amount recorded yet; the refunded total covers only the ${r.refundAmountKnown} with a keyed-in amount.`);
  return {
    ...base("refunds", "Refunds & returns", `Returns over the last ${days} days`, "Finance", days),
    summary: [
      stat("Returns", String(r.total)),
      stat("Refunded", String(r.refundedCount)),
      stat("Refund value", inr(r.refundValue)),
      stat("Return rate", pct(r.returnRatePct)),
    ],
    columns, rows, totals, sections,
    chart: { kind: "bar", labelKey: "reason", valueKeys: ["count"], title: "Returns by reason" },
    notes,
  };
}

/** Payment reconciliation — captured vs pending vs failed, by method. */
function paymentsReport(days: number): ReportTable {
  const recon = paymentReconciliation(days);
  const columns: ReportColumn[] = [
    { key: "method", label: "Method", type: "text" },
    { key: "orders", label: "Orders", type: "int", total: true },
    { key: "capturedOrders", label: "Captured", type: "int", total: true },
    { key: "captured", label: "Captured value", type: "money", total: true },
    { key: "pendingOrders", label: "Pending", type: "int", total: true },
    { key: "pendingValue", label: "Pending value", type: "money", total: true },
    { key: "failedOrders", label: "Failed", type: "int", total: true },
  ];
  const rows: Cell[][] = recon.map((m) => [m.method, m.orders, m.capturedOrders, money(m.captured), m.pendingOrders, money(m.pendingValue), m.failedOrders]);
  const totals = buildTotals(columns, rows);
  return {
    ...base("payments", "Payment reconciliation", `Settlement status over the last ${days} days`, "Finance", days),
    summary: [
      stat("Captured", inr(sumColumn(rows, 3))),
      stat("Pending", inr(sumColumn(rows, 5))),
      stat("Failed orders", String(sumColumn(rows, 6))),
      stat("Methods", String(recon.length)),
    ],
    columns, rows, totals,
    chart: { kind: "donut", labelKey: "method", valueKeys: ["captured"], currency: true, title: "Captured by method" },
    notes: ["Captured = paid; pending = awaiting capture (typically COD before delivery); failed = every other status.", "Pending value is exposure still owed, not recognised revenue."],
  };
}

/** Discount effectiveness — coupon orders vs the rest. */
function discountsReport(days: number): ReportTable {
  const eff = discountEffectiveness(days);
  const columns: ReportColumn[] = [
    { key: "segment", label: "Segment", type: "text" },
    { key: "orders", label: "Orders", type: "int", total: true },
    { key: "paidOrders", label: "Paid", type: "int", total: true },
    { key: "units", label: "Units", type: "int", total: true },
    { key: "revenue", label: "Paid revenue", type: "money", total: true },
    { key: "aov", label: "AOV", type: "money" },
    { key: "discount", label: "Discount", type: "money", total: true },
  ];
  const rows: Cell[][] = [
    ["With coupon", eff.withCoupon.orders, eff.withCoupon.paidOrders, eff.withCoupon.units, money(eff.withCoupon.revenue), money(eff.withCoupon.aov), money(eff.withCoupon.discount)],
    ["Without coupon", eff.withoutCoupon.orders, eff.withoutCoupon.paidOrders, eff.withoutCoupon.units, money(eff.withoutCoupon.revenue), money(eff.withoutCoupon.aov), money(eff.withoutCoupon.discount)],
  ];
  const paidAll = eff.withCoupon.paidOrders + eff.withoutCoupon.paidOrders;
  const revAll = eff.withCoupon.revenue + eff.withoutCoupon.revenue;
  const totals = buildTotals(columns, rows, { aov: paidAll ? Math.round(revAll / paidAll) : 0 });
  const perCoupon = couponUsage(days);
  const sections: ReportSection[] = perCoupon.length
    ? [{
        title: "Per coupon",
        columns: [
          { key: "code", label: "Coupon", type: "text" },
          { key: "uses", label: "Uses", type: "int", total: true },
          { key: "discount", label: "Discount", type: "money", total: true },
        ],
        rows: perCoupon.map((c) => [c.code, c.uses, money(c.discount)]),
        totals: buildTotals(
          [{ key: "code", label: "Coupon", type: "text" }, { key: "uses", label: "Uses", type: "int", total: true }, { key: "discount", label: "Discount", type: "money", total: true }],
          perCoupon.map((c) => [c.code, c.uses, money(c.discount)]),
        ),
      }]
    : [];
  return {
    ...base("discounts", "Discount effectiveness", `Coupon vs non-coupon orders over the last ${days} days`, "Marketing", days),
    summary: [
      stat("AOV lift with coupon", inr(eff.aovLift)),
      stat("Discount given", inr(eff.totalDiscount)),
      stat("Revenue / ₹ discount", eff.roi === null ? "—" : "₹" + eff.roi.toFixed(2)),
      stat("Coupon orders", String(eff.withCoupon.orders)),
    ],
    columns, rows, totals, sections,
    chart: { kind: "bar", labelKey: "segment", valueKeys: ["revenue"], currency: true, title: "Revenue by segment" },
    notes: ["AOV lift is the average paid order value with a coupon minus without.", "Revenue per ₹ of discount is paid revenue on coupon orders ÷ discount given; shown as — when no discount was given."],
  };
}

/** Customer cohort / retention — monthly acquisition cohorts and forward retention. */
function retentionReport(days: number): ReportTable {
  const months = Math.max(3, Math.min(12, Math.round(days / 30) + 1));
  const cohorts = acquisitionCohorts(months);
  const ret = customerRetention(days);
  const maxOffsets = Math.min(months - 1, 6);
  const columns: ReportColumn[] = [
    { key: "cohort", label: "Cohort (first order)", type: "text" },
    { key: "size", label: "New customers", type: "int", total: true },
  ];
  for (let i = 1; i <= maxOffsets; i++) columns.push({ key: `m${i}`, label: `M+${i}`, type: "percent" });
  const rows: Cell[][] = cohorts.map((c) => {
    const row: Cell[] = [c.cohort, c.size];
    for (let i = 0; i < maxOffsets; i++) row.push(c.size ? c.retainedPct[i] : null);
    return row;
  });
  const totals = buildTotals(columns, rows);
  const sections: ReportSection[] = [{
    title: "This window",
    columns: [
      { key: "metric", label: "Metric", type: "text" },
      { key: "value", label: "Value", type: "int" },
    ],
    rows: [
      ["Customers who ordered", ret.customers],
      ["New (first ever order)", ret.newCustomers],
      ["Returning", ret.returningCustomers],
      ["Repeat buyers (2+ lifetime orders)", ret.repeatCustomers],
      ["One-time buyers", ret.oneTimeCustomers],
    ],
  }];
  return {
    ...base("retention", "Customer cohort / retention", `Acquisition cohorts and retention (${months} months)`, "Marketing", days),
    summary: [
      stat("Window customers", String(ret.customers)),
      stat("Repeat rate", pct(ret.repeatRatePct)),
      stat("Returning rate", pct(ret.returningRatePct)),
      stat("Avg orders / customer", ret.avgOrdersPerCustomer === null ? "—" : ret.avgOrdersPerCustomer.toFixed(2)),
    ],
    columns, rows, totals, sections,
    /*
     * The matrix columns are generated above from `maxOffsets`, which varies
     * with the window, so the spec is built from them rather than hardcoded.
     * A spec naming m4 in a three-month window resolves to nothing and the
     * chart silently disappears — which is how it was written the first time.
     */
    chart: {
      kind: "heatmap",
      labelKey: "cohort",
      valueKeys: Array.from({ length: maxOffsets }, (_, i) => `m${i + 1}`),
      title: "Retention by cohort",
    },
    notes: ["Each customer belongs to the month of their first-ever order. M+n is the share of that cohort who ordered again n months later.", "Retention is a lifetime measure computed from full order history, so it is independent of the selected range."],
  };
}

/** Order fulfilment SLA — how long orders take between stages. */
function fulfilmentReport(days: number): ReportTable {
  const sla = fulfilmentSla(days);
  const columns: ReportColumn[] = [
    { key: "stage", label: "Transition", type: "text" },
    { key: "avgHours", label: "Avg hours", type: "number" },
    { key: "count", label: "Orders measured", type: "int", total: true },
  ];
  const rows: Cell[][] = sla.stages.map((s) => [s.label, s.avgHours, s.count]);
  const totals = buildTotals(columns, rows);
  return {
    ...base("fulfilment", "Order fulfilment SLA", `Fulfilment timings over the last ${days} days`, "Operations", days),
    summary: [
      stat("Orders", String(sla.orders)),
      stat("Delivered", pct(sla.deliveredRatePct)),
      stat("Cancelled", pct(sla.cancelRatePct)),
      stat("Avg placed→delivered", sla.avgFulfilmentHours === null ? "—" : sla.avgFulfilmentHours.toFixed(1) + " h"),
    ],
    columns, rows, totals,
    chart: { kind: "funnel", labelKey: "stage", valueKeys: ["count"], title: "Orders reaching each stage" },
    notes: ["Timings use each order's status-history timestamps. An order only counts toward a transition when both endpoints carry a real timestamp — missing stages are excluded, never counted as 0h."],
  };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

// =============================================================== catalog ====

type Builder = (days: number) => ReportTable;

const BUILDERS: Record<string, Builder> = {
  sales: salesReport,
  products: productsReport,
  customers: customersReport,
  categories: categoriesReport,
  coupons: couponsReport,
  tax: taxReport,
  pnl: pnlReport,
  inventory: inventoryReport,
  reorder: reorderReport,
  refunds: refundsReportTable,
  payments: paymentsReport,
  discounts: discountsReport,
  retention: retentionReport,
  fulfilment: fulfilmentReport,
};

export { REPORT_CATALOG, REPORT_IDS, REPORT_GROUPS } from "./reports-format";

export function isReportType(x: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILDERS, x);
}

/** Builds one report of the given type over the given window. */
export function buildReport(type: string, days = 30): ReportTable {
  const clamped = Math.min(365, Math.max(1, Math.round(days) || 30));
  const builder = BUILDERS[type] || BUILDERS.sales;
  return builder(clamped);
}

export type { ReportTable } from "./reports-format";
export { reportToCsv } from "./reports-format";
