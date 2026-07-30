// Point the app at the self-hosted control plane (platform/).
// After DNS is live (api.circuvent.com -> VM IP) keep the domain form below.
// Before DNS, you can temporarily use the VM IP via Caddy is not possible
// (host-routed); set DNS first, or run the control plane locally for dev.
export const API_BASE = "https://api.circuvent.com";
export const WS_URL = "wss://api.circuvent.com/ws";

// The assistant and the home analysis are served by the website, not the
// control plane, because they need the product catalogue and order history as
// well as device state. Keeping one implementation there rather than porting
// the analysis engine into the app means the app and the web console can never
// disagree about what a reading means.
export const SITE_URL = "https://circuvent.com";
