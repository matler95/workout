import './data/exerciseIntegrityCheck';
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { registerServiceWorker } from "./utils/sw-register";
import { pruneAbandoned, flushPendingWorkouts } from "./utils/offlineQueue.ts";

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD) {
  registerServiceWorker();
}

// FIX #10: Prune stale in-progress / abandoned sessions (> 24 h old) before
// attempting to flush, so the index stays clean and getInProgressWorkout()
// never surfaces data from a previous app session.
pruneAbandoned();

flushPendingWorkouts().then(count => {
  if (count > 0) {
    console.log(`[offlineQueue] Auto-synced ${count} pending workout(s) on startup`);
  }
}).catch(() => {
  // Network still unavailable — CrashRecoveryBanner will show on Dashboard
});
