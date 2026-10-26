// Minimal service worker. It exists so browsers treat the site as an installable app.
// It does not cache anything, so pages always show fresh data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Pass-through: let the network handle every request.
});
