/**
 * Machine-to-machine dump of Circuvent.com admin commerce data for CV-365 CRM.
 * Auth: CROSS_APP_SYNC_TOKEN / CRM_SYNC_SECRET.
 *
 * Covers the admin categories CRM needs most:
 * Orders & Inventory (orders, inventory, returns) +
 * Customers & Support (customers, tickets, warranty/RMA).
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  listCustomers,
  listOrders,
  listReturns,
  listTickets,
} from "@/lib/store";
import {
  listProductRows,
  listSuppliers,
  listLocations,
  listPurchaseOrders,
} from "@/lib/inventory";
import { listZones } from "@/lib/admin-shipping";
import { listBundles } from "@/lib/admin-bundles";
import {
  listRegistrations,
  listRmas,
  findRegistration,
  revalidateWarranty,
} from "@/lib/admin-warranty";
import { listRules, listHistory, pricingStats } from "@/lib/admin-pricing";
import { listVendors, listQuoteRequests, vendorStats } from "@/lib/admin-vendors";
import { computeForecast } from "@/lib/admin-forecasting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const expected = (process.env.CROSS_APP_SYNC_TOKEN || process.env.CRM_SYNC_SECRET || "").trim();
  if (!expected) {
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  const supplied =
    request.headers.get("x-service-token")?.trim() ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    "";
  if (!supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await revalidateWarranty();

  // Shop customers = registered accounts (circuvent.com/shop logins) plus any
  // checkout emails that never created an account.
  const byEmail = new Map<string, Record<string, unknown>>();
  for (const c of listCustomers()) {
    const email = (c.email || "").toLowerCase();
    if (!email) continue;
    byEmail.set(email, {
      email,
      name: c.name,
      totalSpend: c.spend,
      orderCount: c.orders,
      wallet: c.wallet,
      blocked: c.blocked,
      createdAt: c.createdAt,
      source: "shop-account",
      tags: ["shop", "shop-login"],
    });
  }
  for (const o of listOrders()) {
    const email = (o.customer?.email || "").toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    if (!prev) {
      byEmail.set(email, {
        email,
        name: o.customer?.name || email.split("@")[0],
        phone: o.customer?.phone || "",
        totalSpend: o.paymentStatus === "paid" ? o.total : 0,
        orderCount: 1,
        wallet: 0,
        blocked: false,
        createdAt: o.placedAt,
        source: "shop-order",
        tags: ["shop", "shop-checkout"],
      });
    } else {
      prev.orderCount = Number(prev.orderCount || 0) + 1;
      if (o.paymentStatus === "paid") prev.totalSpend = Number(prev.totalSpend || 0) + (Number(o.total) || 0);
      if (!prev.phone && o.customer?.phone) prev.phone = o.customer.phone;
    }
  }
  const customers = Array.from(byEmail.values());

  const orders = listOrders().map((o) => ({
    orderNo: o.orderNo,
    placedAt: o.placedAt,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    total: o.total,
    subtotal: o.subtotal,
    shipping: o.shipping,
    discount: o.discount || 0,
    currency: "INR",
    customer: {
      name: o.customer?.name || "",
      email: (o.customer?.email || "").toLowerCase(),
      phone: o.customer?.phone || "",
      address: o.customer?.address || "",
      city: o.customer?.city || "",
      state: o.customer?.state || "",
      pincode: o.customer?.pincode || "",
    },
    items: (o.items || []).map((it) => ({
      name: it.name,
      quantity: it.qty,
      unitPrice: it.price,
      lineTotal: it.lineTotal,
      slug: it.slug,
    })),
    trackingNumber: o.trackingNumber || "",
    carrier: o.carrier || "",
    updatedAt: o.updatedAt,
  }));

  const returns = listReturns();
  const tickets = listTickets().map((t) => ({
    id: t.id,
    email: t.email,
    name: t.name,
    subject: t.subject,
    orderNo: t.orderNo || "",
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messageCount: t.messages?.length || 0,
  }));

  const warranties = listRegistrations();
  const rmas = listRmas().map((r) => {
    const reg = findRegistration(r.registrationId);
    return {
      ...r,
      customerEmail: reg?.customerEmail,
      productName: reg?.productName,
      deviceOrSerial: reg?.deviceOrSerial,
      orderNo: reg?.orderNo,
    };
  });

  const products = listProductRows();

  const pricingRules = listRules();
  const vendors = listVendors();
  const vendorQuotes = listQuoteRequests();
  const forecast = computeForecast();

  return NextResponse.json({
    success: true,
    source: "shop-admin",
    customers,
    orders,
    returns,
    tickets,
    products,
    suppliers: listSuppliers(),
    locations: listLocations(),
    purchaseOrders: listPurchaseOrders(),
    shippingZones: listZones(),
    bundles: listBundles(),
    pricingRules,
    pricingHistory: listHistory(50),
    pricingStats: pricingStats(),
    vendors,
    vendorQuotes,
    vendorStats: vendorStats(),
    forecast,
    warranties,
    rmas,
    summary: {
      orders: orders.length,
      paidRevenue: orders
        .filter((o) => o.paymentStatus === "paid")
        .reduce((s, o) => s + (Number(o.total) || 0), 0),
      delivered: orders.filter((o) => o.status === "delivered").length,
      customers: customers.length,
      products: products.length,
      openTickets: tickets.filter((t) => t.status === "open").length,
      pendingReturns: returns.filter((r) => r.status === "requested").length,
      shippingZones: listZones().length,
      bundles: listBundles().length,
      pricingRules: pricingRules.length,
      vendors: vendors.length,
      forecastCritical: forecast.filter((f) => f.urgency === "critical").length,
    },
    exportedAt: new Date().toISOString(),
  });
}
