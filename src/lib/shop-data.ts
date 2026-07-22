// Circuvent shop — product catalog, pricing rules, and helpers.
// Single source of truth for both the UI and the /api/orders route.

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number; // whole INR
  compareAt?: number;
  category: string;
  image?: string; // /img/*.webp — falls back to a gradient panel when absent
  accent: string; // hex for gradient fallback + accents
  icon: string; // emoji for gradient fallback
  specs: string[];
  stock: number;
  featured?: boolean;
  rating: number;
}

export const SHIPPING = { freeOver: 999, flat: 49, currency: "INR", symbol: "₹" };

export function formatINR(n: number): string {
  return SHIPPING.symbol + Math.round(Number(n) || 0).toLocaleString("en-IN");
}

export const products: Product[] = [
  {
    id: "smart-plug",
    slug: "circuvent-smart-plug",
    name: "Circuvent Smart Plug",
    tagline: "Make any appliance smart — Wi-Fi + voice + energy monitoring",
    description:
      "A compact Wi-Fi smart plug that switches any appliance from your phone or voice. Works with Alexa & Google Home, tracks real-time power usage, and keeps a manual button for local control. Flashed with Circuvent firmware and made in India.",
    price: 999,
    compareAt: 1499,
    category: "Home Automation",
    image: "/img/product-smart-plug.webp",
    accent: "#06b6d4",
    icon: "⚡",
    specs: [
      "Wi-Fi + phone app control",
      "Works with Alexa & Google Home",
      "Live energy / power monitoring",
      "Manual button + status LED",
      "Schedules & scenes",
      "16A variant for geysers / ACs",
    ],
    stock: 25,
    featured: true,
    rating: 4.8,
  },
  {
    id: "aquaguard",
    slug: "circuvent-aquaguard",
    name: "Circuvent AquaGuard",
    tagline: "Automatic water-tank controller — never overflow, never burn your pump",
    description:
      "Automatically starts your water motor when the tank is low and stops it when full, with built-in dry-run protection so the pump never runs empty. Check the level and control the motor from your phone. Saves water, electricity and your pump.",
    price: 1999,
    compareAt: 2499,
    category: "Water Management",
    image: "/img/product-aquaguard.webp",
    accent: "#38bdf8",
    icon: "💧",
    specs: [
      "Auto motor ON / OFF",
      "Dry-run pump protection",
      "Reliable float-switch sensing",
      "Wi-Fi status + app",
      "Manual override button",
      "Single & 3-phase (via contactor)",
    ],
    stock: 15,
    featured: true,
    rating: 4.7,
  },
  {
    id: "guardian",
    slug: "circuvent-guardian",
    name: "Circuvent Guardian",
    tagline: "Personal safety SOS beacon — help is one press away",
    description:
      "A pocket-sized battery-powered panic button. One press sends your live GPS location by SMS to trusted contacts and places an emergency call — no smartphone app needed on the receiving side. Ideal for students, women, elderly and field workers.",
    price: 1999,
    compareAt: 2999,
    category: "Safety",
    image: "/img/product-guardian.webp",
    accent: "#8b5cf6",
    icon: "🛡️",
    specs: [
      "One-press SOS",
      "Live GPS location over SMS",
      "Automatic emergency call",
      "Rechargeable battery (USB-C)",
      "Auto-resends while moving",
      "Works with any phone — no app",
    ],
    stock: 20,
    featured: true,
    rating: 4.9,
  },
  {
    id: "energy-monitor",
    slug: "circuvent-energy-monitor",
    name: "Circuvent Energy Monitor",
    tagline: "See exactly where your electricity goes",
    description:
      "A clamp-on whole-home energy monitor that streams live consumption to the Circuvent app — spot hungry appliances, set budgets and cut your bill. Non-invasive CT-clamp install, no rewiring.",
    price: 1299,
    compareAt: 1699,
    category: "Energy",
    accent: "#f59e0b",
    icon: "📊",
    specs: [
      "Whole-home CT-clamp sensing",
      "Live kWh + cost in the app",
      "Per-appliance disaggregation",
      "Budgets & alerts",
      "No rewiring required",
      "Wi-Fi + cloud history",
    ],
    stock: 18,
    rating: 4.6,
  },
  {
    id: "home-hub",
    slug: "circuvent-home-hub",
    name: "Circuvent Home Hub",
    tagline: "The brain that ties your smart home together",
    description:
      "A local-first automation hub that runs your scenes and schedules even when the internet is down. Bridges Wi-Fi, BLE and Zigbee devices, with Matter support and an offline voice option.",
    price: 2499,
    compareAt: 2999,
    category: "Home Automation",
    accent: "#14b8a6",
    icon: "🧩",
    specs: [
      "Local-first automations",
      "Wi-Fi + BLE + Zigbee bridge",
      "Matter compatible",
      "Works offline",
      "Scenes & schedules",
      "Optional offline voice",
    ],
    stock: 10,
    rating: 4.8,
  },
];

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function shopCategories(): string[] {
  return ["All", ...Array.from(new Set(products.map((p) => p.category)))];
}

export function computeTotals(lines: { price: number; qty: number }[]) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const shipping = subtotal === 0 || subtotal >= SHIPPING.freeOver ? 0 : SHIPPING.flat;
  return { subtotal, shipping, total: subtotal + shipping };
}
