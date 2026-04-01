self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "AfriTalent", body: event.data.text() };
  }

  const title = payload.title || "AfriTalent";
  const options = {
    body: payload.body || "You have a new update.",
    data: payload.metadata || {},
    badge: "/favicon.ico",
    icon: "/favicon.ico",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = "/";
  event.waitUntil(clients.openWindow(target));
});

