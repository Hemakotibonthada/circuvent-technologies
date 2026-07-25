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
  images?: string[]; // optional gallery (admin-added products)
  accent: string; // hex for gradient fallback + accents
  icon: string; // emoji for gradient fallback
  specs: string[];
  stock: number;
  available?: boolean;
  featured?: boolean;
  badge?: string; // e.g. "New", "Best seller" — shown as an offer/label chip
  rating: number;
  reviewCount?: number;
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
  {
    id: "smart-switch",
    slug: "circuvent-smart-switch",
    name: "Circuvent Smart Switch",
    tagline: "Retrofit Wi-Fi touch switch — control lights & fans from anywhere",
    description:
      "A modular Wi-Fi touch switch that fits behind your existing switchboard and makes up to 4 lights/fans smart — control from the app or voice, set schedules, and keep the physical touch buttons for local control. No visible wiring changes.",
    price: 1499,
    compareAt: 1999,
    category: "Home Automation",
    accent: "#22d3ee",
    icon: "🔘",
    specs: [
      "Fits existing switchboard",
      "Up to 4 gangs",
      "App + voice control",
      "Physical touch buttons",
      "Schedules & scenes",
      "Neutral-wire design",
    ],
    stock: 30,
    rating: 4.6,
  },
  {
    id: "motion-sensor",
    slug: "circuvent-motion-sensor",
    name: "Circuvent Motion Sensor",
    tagline: "PIR motion sensor — automate lights & get intrusion alerts",
    description:
      "A battery-powered PIR motion sensor that triggers your Circuvent lights and sends instant intrusion alerts to your phone. Ideal for staircases, entryways, garages and store rooms. Peel-and-stick install in seconds.",
    price: 799,
    compareAt: 999,
    category: "Safety",
    accent: "#a78bfa",
    icon: "🚶",
    specs: [
      "Wide-angle PIR sensing",
      "Instant phone alerts",
      "Triggers Circuvent lights",
      "6-month battery life",
      "Adhesive mount",
      "Adjustable sensitivity",
    ],
    stock: 40,
    rating: 4.5,
  },
  {
    id: "agri-starter",
    slug: "circuvent-agri-starter",
    name: "Circuvent Agri GSM Starter",
    tagline: "Start / stop your farm pump by a call or SMS — no smartphone needed",
    description:
      "A rugged GSM pump starter for farmers: switch your agricultural motor ON/OFF with a missed call or SMS from any phone, get power-availability and dry-run alerts, and protect the pump from voltage faults. Built for the field.",
    price: 2999,
    compareAt: 3499,
    category: "Water Management",
    accent: "#34d399",
    icon: "🌾",
    specs: [
      "Call / SMS ON-OFF (any phone)",
      "Power-availability alerts",
      "Dry-run & voltage protection",
      "Single & 3-phase (via contactor)",
      "Works without internet",
      "Weather-resistant enclosure",
    ],
    stock: 12,
    rating: 4.7,
  },
  {
    id: "smart-light",
    slug: "circuvent-smart-light",
    name: "Circuvent Smart Light",
    tagline: "Dimmable, colour-tunable Wi-Fi light — moods, schedules & voice",
    description:
      "A Wi-Fi smart light with smooth brightness dimming and full-colour control from the Circuvent app or your voice. Set scenes, schedules and wake-up fades, and it remembers its last state after a power cut. Works with Alexa & Google Home.",
    price: 899,
    compareAt: 1299,
    category: "Home Automation",
    image: "/img/product-smart-light.svg",
    accent: "#f59e0b",
    icon: "💡",
    specs: [
      "Brightness dimming (0–100%)",
      "16M colours + warm/cool white",
      "Works with Alexa & Google Home",
      "Scenes, schedules & fades",
      "Remembers last state on power-up",
      "Manual switch + app control",
    ],
    stock: 30,
    featured: true,
    badge: "New",
    rating: 4.7,
  },
  {
    id: "smart-fan",
    slug: "circuvent-smart-fan",
    name: "Circuvent Smart Fan Controller",
    tagline: "Turn any ceiling fan into a smart, speed-controlled fan",
    description:
      "A retrofit controller that adds app + voice control and multi-speed regulation to your existing ceiling fan. Set speeds, schedules and scenes, and control it hands-free with Alexa or Google Home. Keeps your wall regulator working too.",
    price: 1099,
    compareAt: 1499,
    category: "Home Automation",
    image: "/img/product-smart-fan.svg",
    accent: "#22d3ee",
    icon: "🌀",
    specs: [
      "3-speed smart regulation",
      "App + voice control",
      "Works with Alexa & Google Home",
      "Schedules & scenes",
      "Remembers last state on power-up",
      "Fits standard ceiling fans",
    ],
    stock: 28,
    badge: "New",
    rating: 4.6,
  },
  {
    id: "smart-lock",
    slug: "circuvent-smart-lock",
    name: "Circuvent Smart Lock",
    tagline: "Lock & unlock your door from anywhere — with auto-relock",
    description:
      "A motorised smart deadbolt you can lock or unlock from the Circuvent app or your voice, with optional auto-relock and a fail-safe locked state after any power interruption. Physical key/knob still works. Ideal for homes, offices and rentals.",
    price: 4999,
    compareAt: 6499,
    category: "Safety",
    image: "/img/product-smart-lock.svg",
    accent: "#ef4444",
    icon: "🔒",
    specs: [
      "App + voice lock / unlock",
      "Auto-relock timer",
      "Fail-safe locked on power loss",
      "Tamper & activity alerts",
      "Physical override retained",
      "Works with Alexa & Google Home",
    ],
    stock: 10,
    featured: true,
    badge: "New",
    rating: 4.8,
  },
  {
    id: "curtain",
    slug: "circuvent-curtain",
    name: "Circuvent Smart Curtain",
    tagline: "Open & close your curtains on schedule, tap or voice",
    description:
      "A motorised curtain controller that opens and closes to any position from the Circuvent app or your voice. Wake to natural light with sunrise schedules, set scenes, and control it with Alexa or Google Home. Quiet motor, easy retrofit.",
    price: 3499,
    compareAt: 4499,
    category: "Home Automation",
    image: "/img/product-smart-curtain.svg",
    accent: "#8b5cf6",
    icon: "🪟",
    specs: [
      "Open / close to any position",
      "Sunrise / sunset schedules",
      "App + voice control",
      "Works with Alexa & Google Home",
      "Scenes & routines",
      "Quiet retrofit motor",
    ],
    stock: 14,
    badge: "New",
    rating: 4.6,
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
