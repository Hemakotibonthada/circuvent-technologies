/**
 * Content-Security-Policy, shared by the edge proxy and next.config.ts.
 *
 * It is declared in both places on purpose: the proxy matcher excludes static
 * assets and could be bypassed by a routing change, so next.config.ts carries
 * the same policy as a floor that always ships.
 *
 * On 'unsafe-inline' in script-src: the App Router emits per-page inline
 * hydration payloads, and removing it requires a per-request nonce, which
 * opts every route out of static rendering. The two places user-controlled
 * text reached an HTML/script sink (JSON-LD in JsonLd.tsx / layout.tsx, and
 * the printed barcode labels in the admin) now escape at the source, so the
 * remaining directives — object-src 'none', base-uri 'self', form-action
 * 'self', frame-ancestors 'none' — carry the weight here.
 */

const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "https://checkout.razorpay.com",
    "https://va.vercel-scripts.com",
    "https://www.googletagmanager.com",
  ],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "connect-src": [
    "'self'",
    "https://api.circuvent.com",
    "wss://api.circuvent.com",
    "https://api.razorpay.com",
    "https://lumberjack.razorpay.com",
    "https://*.razorpay.com",
    "https://vitals.vercel-insights.com",
    "https://*.googleapis.com",
    "https://*.firebaseio.com",
    "https://*.google-analytics.com",
    "wss://*.firebaseio.com",
  ],
  "frame-src": [
    "'self'",
    "https://api.razorpay.com",
    "https://checkout.razorpay.com",
    "https://*.razorpay.com",
  ],
  "worker-src": ["'self'", "blob:"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

export const CSP: string = (() => {
  const parts = Object.entries(CSP_DIRECTIVES).map(([k, v]) => `${k} ${v.join(" ")}`);
  parts.push("upgrade-insecure-requests");
  return parts.join("; ");
})();
