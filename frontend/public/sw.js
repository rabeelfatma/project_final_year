self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "QuickCheck Hub", body: event.data?.text() || "New notification" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "QuickCheck Hub", {
      body: data.body || "New notification",
      icon: data.icon || "/notification-icon.png",
      badge: data.badge || "/notification-icon.png",
      tag: data.tag || "quickcheck-notification",
      renotify: true,
      requireInteraction: false,
      silent: false,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return clients.openWindow(url);
    })
  );
});
