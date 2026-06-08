const REMINDERS_KEY = "orrin_reminders";

// Check reminders every minute
setInterval(() => {
  checkReminders();
}, 60000);

// Also check on activation
self.addEventListener("activate", () => {
  checkReminders();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CHECK_REMINDERS") {
    checkReminders();
  }
});

async function checkReminders() {
  try {
    const clients = await self.clients.matchAll();
    
    // Get reminders from all clients
    if (clients.length > 0) {
      clients[0].postMessage({ type: "GET_REMINDERS" });
    }
  } catch (err) {
    console.error("SW check error:", err);
  }
}

self.addEventListener("message", (event) => {
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
});

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
