const REMINDERS_CACHE = "orrin-reminders";

// Recursive setTimeout is more reliable than setInterval in SW
function scheduleCheck() {
  setTimeout(() => {
    checkReminders();
    scheduleCheck();
  }, 30000);
}

scheduleCheck();

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("message", event => {
  const data = event.data || {};

  if (data.type === "REMINDERS_DATA") {
    processReminders(data.reminders || []);
  }
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow("/");
    })
  );
});

async function checkReminders() {
  const now = Date.now();
  try {
    const clients = await self.clients.matchAll({ type: "window" });
    if (clients.length > 0) {
      clients[0].postMessage({ type: "GET_REMINDERS" });
    } else {
      if (!("caches" in self)) return;
      const cache = await caches.open(REMINDERS_CACHE);
      const response = await cache.match("reminders");
      if (!response) return;
      const reminders = await response.json();
      processReminders(reminders);
    }
  } catch (err) {
    console.error("SW check error:", err);
  }
}

function processReminders(reminders) {
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
      self.clients.matchAll({ type: "window" }).then(clients => {
        clients.forEach(c => c.postMessage({ type: "MARK_FIRED", reminderId: r.id }));
      });
    }
  });
}
