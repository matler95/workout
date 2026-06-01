export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    console.log('Service Worker registered:', registration);
    
    /* Check for updates periodically */
    setInterval(async () => {
      try {
        await registration.update();
      } catch (e) {
        console.error('SW update check failed:', e);
      }
    }, 60000); /* Every minute */

    /* Notify user of updates */
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
          console.log('App updated! Please refresh.');
        }
      });
    });
  } catch (error) {
    console.error('Service Worker registration failed:', error);
  }
}
