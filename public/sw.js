// public/sw.js

const REMINDERS_CACHE = "orrin-reminders";
const REMINDERS_KEY = "reminders";

// Check reminders every 60 seconds
setInterval(() => {
  checkReminders();
}, 60000);

// Also check when the SW is activated
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Handle messages from the client
self.addEventListener("message", event => {
  const data = event.data || {};

  // Page is sending reminders data
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

// When user clicks a notification, focus/open the app
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

// Core reminder check logic
async function checkReminders() {
  const now = Date.now();

  try {
    const clients = await self.clients.matchAll({ type: "window" });

    if (clients.length > 0) {
      // Page is open — ask it to send reminders
      clients[0].postMessage({ type: "GET_REMINDERS" });
    } else {
      // No page open — read reminders directly from Cache API
      if (!("caches" in self)) return;

      const cache = await caches.open(REMINDERS_CACHE);
      const response = await cache.match(REMINDERS_KEY);
      if (!response) return;

      const reminders = await response.json();
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
        }
      });
    }
  } catch (err) {
    console.error("SW reminder check error:", err);
  }
}
