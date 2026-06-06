import './data/exerciseIntegrityCheck';
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { registerServiceWorker } from "./utils/sw-register";
import { flushPendingWorkouts } from "./utils/offlineQueue.ts";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker for PWA support
if (import.meta.env.PROD) {
  registerServiceWorker();
}

// On every app load, attempt to flush any workouts that were completed
// while offline (network failure, app killed mid-save, etc).
// Runs silently in background — the Dashboard CrashRecoveryBanner provides
// the visible UI if any workouts are still pending after this attempt.
flushPendingWorkouts().then(count => {
  if (count > 0) {
    console.log(`[offlineQueue] Auto-synced ${count} pending workout(s) on startup`);
  }
}).catch(() => {
  // Network still unavailable — CrashRecoveryBanner will show on Dashboard
});
