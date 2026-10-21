/* Ensemble Node service worker: web push for approvals and "needs you" moments (docs/15 §4). */
self.addEventListener("push", (event) => {
  let data = { title: "Ensemble Node", body: "Something needs you.", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Keep the default text.
  }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: { url: data.url }, tag: data.url }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ("focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
