// public/sw.js

const REMINDERS_CACHE = "orrin-reminders";
const REMINDERS_KEY = "reminders";

// Check every 60 seconds
setInterval(async () => {
  const now = Date.now();

  try {
    const clients = await self.clients.matchAll({ type: "window" });

    if (clients.length > 0) {
      // Page is open — ask it to send reminders
      clients[0].postMessage({ type: "GET_REMINDERS" });
    } else {
      // No page open — read reminders directly from Cache API
      const cache = await caches.open(REMINDERS_CACHE);
      const response = await cache.match(REMINDERS_KEY);
      if (!response) return;

      const reminders = await response.json();
      reminders.forEach(r => {
        if (!r.fired && r.time <= now) {
          self.registration.showNotification("Orrin", {
            body: r.text,
            icon: "/icons/orrin-192.png,
            badge: "/icons/orrin-192.png",
            tag: r.id,
            requireInteraction: true,
            data: { reminderId: r.id },
          });
        }
      });
    }
  } catch (err) {
    console.error("SW interval reminder error:", err);
  }
}, 60000);

// Claim clients on activate so we can talk to open tabs immediately
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Handle messages from the page
self.addEventListener("message", event => {
  const data = event.data || {};

  // Page is sending its current reminders
  if (data.type === "REMINDERS_DATA") {
    const reminders = data.reminders || [];
    const now = Date.now();

    reminders.forEach(r => {
      if (!r.fired && r.time <= now) {
        self.registration.showNotification("Orrin", {
          body: r.text,
          icon: "/icons/orrin-192.png",
          badge: "/icons/orrin-192.png",
          tag: r.id,
          requireInteraction: true,
          data: { reminderId: r.id },
        });

        // Ask all clients to mark this reminder as fired
        self.clients.matchAll({ type: "window" }).then(clients => {
          clients.forEach(c =>
            c.postMessage({ type: "MARK_FIRED", reminderId: r.id })
          );
        });
      }
    });
  }
});

// Focus or open the app when a notification is clicked
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then(clients => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
