const CACHE_NAME = "circuvent-v1";
const STATIC_ASSETS = [
  "/",
  "/projects",
  "/services",
  "/blog",
  "/about",
  "/contact",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

/* ------------------------------------------------------------------ */
/* Push                                                                */
/* ------------------------------------------------------------------ */

/*
 * A push arrives whether or not a tab is open — that is the entire point, and
 * it is why the payload has to carry everything the notification needs. There
 * is no application state here to look anything up in.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push that is not JSON is still a push worth showing. Silence would be
    // indistinguishable from the subscription being broken.
    payload = { title: "Circuvent", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Circuvent";
  const options = {
    body: payload.body || "",
    icon: "/logo-mark-160.png",
    badge: "/logo-mark-160.png",
    /*
     * A tag collapses repeats.
     *
     * Alerts re-notify on a schedule, and without this a hub that has been
     * offline all weekend leaves a column of identical notifications that the
     * user swipes away in one gesture — including whatever arrived underneath
     * them. One notification per problem, replaced in place.
     */
    tag: payload.tag || "circuvent",
    renotify: Boolean(payload.renotify),
    requireInteraction: payload.severity === "critical",
    data: { url: payload.url || "/smarthome", severity: payload.severity || "info" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/smarthome";

  /*
   * Focus an existing tab rather than opening another.
   *
   * Someone who taps three alerts should not end up with three copies of the
   * console. If a window is already open it is brought forward and navigated;
   * only when there is none is a new one opened.
   */
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

/*
 * A subscription can be replaced by the browser at any time. When that happens
 * the old endpoint stops working silently, so the new one has to be sent
 * before anything is pushed to it.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
      .then((subscription) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subscription, reason: "resubscribe" }),
        })
      )
      .catch(() => {
        /* Nothing useful to do offline; the app resubscribes on next load. */
      })
  );
});

  // Skip non-GET requests and API calls
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Network-first for navigation, cache-first for assets
      if (event.request.mode === "navigate") {
        return fetch(event.request)
          .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
          .catch(() => cached || caches.match("/"));
      }

      return cached || fetch(event.request).then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
