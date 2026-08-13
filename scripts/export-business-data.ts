/**
 * Export the facts business documents are built from.
 *
 * Business documents quote prices. Prices live in `src/lib/shop-data.ts` and
 * change. A deck, a catalogue PDF and a price list that each carry their own
 * typed copy of ₹999 will disagree with the shop within a quarter, and the one
 * that disagrees is usually the one a customer is holding — nobody re-opens a
 * PowerPoint to check it against the website.
 *
 * So no document contains a typed price. They are generated from this export,
 * which reads the same module the shop renders from. Changing a price in the
 * catalogue and re-running `npm run docs:business` moves every figure in every
 * document at once.
 *
 * Counts (devices, hardware projects) are derived by looking at the directories
 * rather than being maintained by hand here, for the same reason.
 *
 * Writes `Docs/business/_data/business-data.json`.
 */

import { mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { products, SHIPPING, formatINR } from "../src/lib/shop-data";
import { BRAND } from "../src/lib/brand";
import { RETURN_DAYS } from "../src/lib/shop-policy";
import { WARRANTY_MONTHS } from "../src/lib/warranty";

const root = join(__dirname, "..");

/** Directories that are a device, excluding the shared library and build output. */
function countDeviceFirmware(): string[] {
  const dir = join(root, "firmware");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "CircuventDevice")
    .map((e) => e.name)
    .sort();
}

function countHardwareProjects(): string[] {
  const dir = join(root, "hardware");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "lib")
    .map((e) => e.name)
    .sort();
}

const orderable = products.filter((p) => !p.discontinued);
const rated = orderable.filter((p) => (p.reviewCount ?? 0) > 0 || p.rating > 0);

const byCategory: Record<string, typeof products> = {};
for (const p of orderable) (byCategory[p.category] ||= []).push(p);

const firmware = countDeviceFirmware();
const hardware = countHardwareProjects();

const data = {
  /* Stamped so a printed document can be matched to the catalogue it came from.
     A PDF with no date is impossible to audit against a price that has moved. */
  generatedAt: new Date().toISOString(),
  generatedDate: new Date().toISOString().slice(0, 10),

  company: {
    name: BRAND.name,
    site: BRAND.site,
    supportEmail: BRAND.supportEmail,
    salesEmail: "contact@circuvent.com",
    phone: "+91 765 999 333 1",
    location: "Hyderabad, India",
    warrantyUrl: BRAND.warrantyUrl,
  },

  commercial: {
    currency: SHIPPING.currency,
    symbol: SHIPPING.symbol,
    freeShippingOver: SHIPPING.freeOver,
    flatShipping: SHIPPING.flat,
    returnDays: RETURN_DAYS,
    warrantyMonths: WARRANTY_MONTHS,
  },

  catalogue: {
    total: orderable.length,
    categories: Object.keys(byCategory).sort(),
    categoryCounts: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, v.length]),
    ),
    priceMin: Math.min(...orderable.map((p) => p.price)),
    priceMax: Math.max(...orderable.map((p) => p.price)),
    averageRating:
      rated.length > 0
        ? Number((rated.reduce((s, p) => s + p.rating, 0) / rated.length).toFixed(2))
        : null,
    products: orderable.map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      category: p.category,
      price: p.price,
      priceFormatted: formatINR(p.price),
      compareAt: p.compareAt ?? null,
      compareAtFormatted: p.compareAt ? formatINR(p.compareAt) : null,
      discountPct: p.compareAt
        ? Math.round(((p.compareAt - p.price) / p.compareAt) * 100)
        : null,
      specs: p.specs,
      stock: p.stock,
      rating: p.rating,
      badge: p.badge ?? null,
      featured: !!p.featured,
      warrantyMonths: p.warrantyMonths ?? WARRANTY_MONTHS,
    })),
  },

  engineering: {
    deployables: 4,
    firmwareDeviceTypes: firmware.length,
    firmwareList: firmware,
    hardwareProjects: hardware.length,
    hardwareList: hardware,
  },
};

const outDir = join(root, "Docs", "business", "_data");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "business-data.json");
writeFileSync(outFile, JSON.stringify(data, null, 2), "utf8");

console.log(`Wrote ${outFile}`);
console.log(
  `  ${data.catalogue.total} products · ${data.catalogue.categories.length} categories · ` +
    `${data.engineering.firmwareDeviceTypes} firmware types · ${data.engineering.hardwareProjects} hardware projects`,
);
