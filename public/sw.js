const REMINDERS_KEY = "orrin_reminders";

// Check every 60 seconds independently
setInterval(async () => {
  const now = Date.now();
  
  // Get all clients
  const clients = await self.clients.matchAll();
  
  if (clients.length > 0) {
    // Ask page for reminders
    clients[0].postMessage({ type: "GET_REMINDERS" });
  } else {
    // No page open — check via cache
    try {
      const cache = await caches.open("orrin-reminders");
      const response = await cache.match("reminders");
      if (response) {
        const reminders = await response.json();
        reminders.forEach(r => {
          if (!r.fired && r.time <= now) {
            self.registration.showNotification("Orrin", {
              body: r.text,
              icon: "/icons/orrin-192.png",
              badge: "/icons/orrin-192.png",
              tag: r.id,
              requireInteraction: true,
            });
          }
        });
      }
    } catch (err) {
      console.error("SW reminder check error:", err);
    }
  }
}, 60000);

// Also check on activation and claim clients
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Handle messages from the client
self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_REMINDERS") {
    // Page is responding with reminders data — no action needed here
  }
  
  if (event.data?.type === "REMINDERS_DATA") {
    const reminders = event.data.reminders || [];
    const now = Date.now();

    reminders.forEach((reminder) => {
      if (!reminder.fired && reminder.time <= now) {
        self.registration.showNotification("Orrin", {
          body: reminder.text,
          icon: "/icons/orrin-192.png",
          badge: "/icons/orrin-192.png",
          tag: reminder.id,
          requireInteraction: true,
          data: { reminderId: reminder.id },
        });

        // Tell client to mark as fired
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: "MARK_FIRED", reminderId: reminder.id });
          });
        });
      }
    });
  }
  
  if (event.data?.type === "MARK_FIRED") {
    markFired(event.data.reminderId);
  }
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        self.clients.openWindow("/");
      }
    })
  );
});

// Helper to mark reminder as fired (store in cache)
async function markFired(reminderId) {
  try {
    const cache = await caches.open("orrin-reminders");
    const response = await cache.match("reminders");
    if (response) {
      const reminders = await response.json();
      const reminder = reminders.find(r => r.id === reminderId);
      if (reminder) {
        reminder.fired = true;
        await cache.put("reminders", new Response(JSON.stringify(reminders)));
      }
    }
  } catch (err) {
    console.error("SW markFired error:", err);
  }
}
