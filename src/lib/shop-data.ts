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
  /**
   * ISO date this goes on sale. Before it the product is "coming soon": shown
   * in the catalogue, not orderable. Expressed as a date rather than a flag so
   * it turns itself off on launch day instead of waiting for somebody to
   * remember.
   */
  releaseAt?: string | null;
  /** Permanently withdrawn — distinct from out of stock, it is not returning. */
  discontinued?: boolean;
  /**
   * Months of warranty for this product.
   *
   * Absent means the published default at /warranty. A longer term on a
   * particular product is a promise made per product, so it belongs on the
   * product rather than in a constant every device is measured against.
   */
  warrantyMonths?: number;
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
    image: "/img/product-energy-monitor.svg",
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
    image: "/img/product-home-hub.svg",
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
    image: "/img/product-smart-switch.svg",
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
    image: "/img/product-motion-sensor.svg",
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
    image: "/img/product-agri-starter.svg",
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
  {
    id: "watertank",
    slug: "circuvent-watertank-duo",
    name: "Circuvent WaterTank Duo",
    tagline: "Sump to overhead, filled automatically — with dry-run protection",
    description:
      "Manages a two-tank system: an underground sump and an overhead tank, each measured by a waterproof ultrasonic sensor. It starts the pump when the overhead tank runs low, stops it once full, and refuses to run when the sump is empty. If the pump draws current but the level does not rise, it cuts the motor before the pump is damaged. Live fill percentage and litres for both tanks in the app.",
    price: 3999,
    compareAt: 4999,
    category: "Water Management",
    image: "/img/product-watertank.svg",
    accent: "#0ea5e9",
    icon: "🛢️",
    specs: [
      "Two tanks — sump + overhead",
      "Waterproof ultrasonic sensing",
      "Auto-fill between set levels",
      "Dry-run trip protects the pump",
      "Overflow float backup",
      "Live fill % and litres",
    ],
    stock: 10,
    badge: "New",
    rating: 4.7,
  },
  {
    id: "sentinel",
    slug: "circuvent-sentinel",
    name: "Circuvent Sentinel",
    tagline: "Gas and climate safety panel that acts, not just alarms",
    description:
      "A wall panel that watches a room and does something about what it finds. A combustible-gas and smoke sensor drives a latching alarm, and on detection the panel cuts the appliances you nominate and starts an exhaust fan — detection without action is only a noise-maker. It also reports temperature and humidity, and its four relays can be driven by the capacitive pads on the front, by a schedule, or from the app. A tap on the panel shows up in the app immediately rather than on the next poll.",
    price: 3499,
    compareAt: 4299,
    category: "Safety",
    image: "/img/product-sentinel.svg",
    accent: "#ef4444",
    icon: "🧯",
    specs: [
      "Combustible gas & smoke detection",
      "90-second sensor warm-up before arming",
      "Latching alarm with sustained-reading check",
      "Cuts nominated appliances, drives an exhaust fan",
      "Temperature & humidity reporting",
      "4 relays with 4 capacitive touch pads",
      "Local touch works with no network",
      "Schedules, auto-off timers & away mode",
      "Expandable to 16 relays",
    ],
    stock: 8,
    rating: 4.8,
  },
  {
    id: "touchboard",
    slug: "circuvent-touch-switchboard",
    name: "Circuvent Touch Switchboard",
    tagline: "Three capacitive gangs with per-board energy metering",
    description:
      "A wall switchboard with three capacitive touch pads driving three relays, so it works by touch even when the network is down. A dimmable LED backlight makes it easy to find at night, and built-in metering reports voltage, current, power, power factor and cumulative units for the whole board.",
    price: 2999,
    compareAt: 3799,
    category: "Home Automation",
    image: "/img/product-touchboard.svg",
    accent: "#2dd4bf",
    icon: "🎛️",
    specs: [
      "3 capacitive touch gangs",
      "Dimmable LED backlight",
      "Voltage, current & power metering",
      "Power factor + kWh totals",
      "Local touch works offline",
      "App, scenes & schedules",
    ],
    stock: 12,
    rating: 4.6,
  },
  {
    id: "facedoor",
    slug: "circuvent-facedoor",
    name: "Circuvent FaceDoor",
    tagline: "PIN, fingerprint or face — with a calling bell built in",
    description:
      "A front-door controller that opens an electric strike or deadbolt on a PIN, a verified fingerprint, or a face match from your hub. It boots locked and re-locks itself after a set delay. The calling-bell button raises an event so the hub can capture a snapshot, and every recognised entry can trigger a greeting, the lights or the AC.",
    price: 6999,
    compareAt: 8499,
    category: "Safety",
    image: "/img/product-facedoor.svg",
    accent: "#f43f5e",
    icon: "🚪",
    specs: [
      "PIN keypad + fingerprint",
      "Face unlock via the hub",
      "Fail-secure: locked on boot",
      "Automatic re-lock",
      "Calling bell event",
      "Greeting & scene triggers",
    ],
    stock: 8,
    badge: "New",
    rating: 4.8,
  },
  {
    id: "rfid-gate",
    slug: "circuvent-rfid-gate",
    name: "Circuvent RFID Gate",
    tagline: "Your gate opens as you drive up — no app, no remote",
    description:
      "A long-range UHF reader on the driveway recognises the tag on your windshield and opens the barrier as you approach. Authorised tags are stored on the device, so it keeps working if the internet drops. Guests can be let in with a QR or PIN pass from the hub, and the gate closes itself once the vehicle is clear.",
    price: 12999,
    compareAt: 15999,
    category: "Safety",
    image: "/img/product-rfid-gate.svg",
    accent: "#f59e0b",
    icon: "🛻",
    specs: [
      "Long-range UHF windshield tags",
      "Allowlist stored on the device",
      "Guest QR / PIN passes",
      "Auto-close after passage",
      "Loop detector holds it open",
      "Every entry logged",
    ],
    stock: 5,
    rating: 4.7,
  },
  {
    id: "camera",
    slug: "circuvent-camera",
    name: "Circuvent Camera",
    tagline: "Live view and motion alerts, without a subscription",
    description:
      "A compact Wi-Fi camera that streams live to the app on demand and takes snapshots on request. Motion is detected by comparing frames, so it needs no extra sensor, and a dimmable illuminator LED covers low light. Video is relayed straight to whoever is watching and never stored on our servers, so there is no cloud plan to pay for.",
    price: 2499,
    compareAt: 3199,
    category: "Safety",
    image: "/img/product-camera.svg",
    accent: "#a855f7",
    icon: "📷",
    specs: [
      "Live view on demand",
      "Snapshot on request",
      "Motion detection, no extra sensor",
      "Dimmable illuminator LED",
      "Adjustable resolution & frame rate",
      "No cloud subscription",
    ],
    stock: 18,
    badge: "New",
    rating: 4.5,
  },
  {
    id: "anpr-cam",
    slug: "circuvent-anpr-camera",
    name: "Circuvent ANPR Camera",
    tagline: "Reads number plates at your gate, and knows whose car it is",
    /*
     * Written from firmware/anpr-cam/anpr-cam.ino and platform/api/src/anpr/,
     * not from ambition — the rule in Docs/07-adding-a-new-device.md.
     *
     * Two claims are stated as limits rather than omitted, because both change
     * whether this is the right product for a buyer and neither is discoverable
     * before purchase:
     *
     *   1. Plate reading happens on the server, not the device. A customer
     *      running fully offline will get vehicle detection and capture but no
     *      plates, and needs to know that before the box arrives.
     *   2. It is designed for a stopping or slow vehicle. Sold as a general
     *      traffic camera it would be returned, because it is not one.
     */
    description:
      "Watches the lane at your gate, detects each vehicle that arrives, and reads its number plate. Known cars are recognised and let straight in; a plate on your block list raises an alert instead. Every arrival is logged with a photograph, so there is a record of who came and when. Plate reading runs on the Circuvent control plane rather than on the camera, and the camera is built for a vehicle that slows or stops at a gate, driveway or parking entry — not for open-road traffic.",
    price: 8999,
    compareAt: 10999,
    category: "Safety",
    image: "/img/product-anpr-cam.svg",
    accent: "#0ea5e9",
    icon: "🔢",
    specs: [
      "Reads Indian number plates",
      "Allow, block and watch lists",
      "Photograph kept with every arrival",
      "Loop detector or IR beam input",
      "Watches only the lane you mark",
      "Opens a barrier on a known plate",
    ],
    stock: 6,
    badge: "New",
    rating: 4.6,
  },
  {
    id: "drone-link",
    slug: "circuvent-drone-link",
    name: "Circuvent Drone Link",
    tagline: "Puts your drone's telemetry, flight log and safety limits online",
    /*
     * Written from firmware/drone-link/drone-link.ino and
     * platform/api/src/drone/, not from ambition — the rule in
     * Docs/07-adding-a-new-device.md.
     *
     * Three claims are stated as limits rather than omitted, because each one
     * decides whether this is the right product and none is discoverable
     * before purchase:
     *
     *   1. It is NOT a flight controller and does not fly anything. A buyer
     *      expecting an autopilot would be returning a box that cannot do the
     *      job, and — far worse — one who believed it could would fly a drone
     *      with nothing stabilising it.
     *   2. It needs an existing ArduPilot or PX4 aircraft with a free TELEM
     *      port. No autopilot, no product.
     *   3. There is no manual stick control, ever, and that is a design
     *      decision rather than a missing feature. Somebody buying it as a
     *      "fly my drone over the internet" device must know that up front.
     */
    description:
      "A companion computer for a drone that already has an ArduPilot or PX4 flight controller. It plugs into a spare TELEM port and puts the aircraft on your Circuvent account: live position, altitude, battery and GPS quality while it flies, a complete flight log afterwards, and a daily report by email. Take-off, landing, return-to-home and stored waypoint missions can be commanded from the console, and a preflight check refuses to arm on a poor GPS fix or a low pack. It does not fly the aircraft — your flight controller does that, and keeps doing it if this link drops. There is deliberately no manual stick control over the internet.",
    price: 6499,
    compareAt: 7999,
    category: "Safety",
    image: "/img/product-drone-link.svg",
    accent: "#6366f1",
    icon: "🚁",
    specs: [
      "For ArduPilot or PX4 aircraft",
      "MAVLink v2 over the TELEM port",
      "Live telemetry at up to 10 Hz",
      "Flight log book, exportable as CSV",
      "Preflight check before arming",
      "Altitude and range limits held on the aircraft",
    ],
    stock: 8,
    badge: "New",
    rating: 4.5,
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
