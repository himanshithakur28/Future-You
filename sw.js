// This runs in the background, separate from your main app.
// It's what lets notifications work even when the tab isn't open.

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Future You';
  const options = {
    body: data.body || 'Time to check in',
    icon: '/favicon.svg',
    data: { taskId: data.taskId, action: data.action }, // action: "record" or "checkin"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data?.taskId;
  const action = event.notification.data?.action;
  const url = taskId ? `/?task=${taskId}&action=${action}` : '/';
  event.waitUntil(clients.openWindow(url));
});