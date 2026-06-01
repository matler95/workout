  import './data/exerciseIntegrityCheck';
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { registerServiceWorker } from "./utils/sw-register";

  createRoot(document.getElementById("root")!).render(<App />);

  /* Register service worker for PWA support */
  if (import.meta.env.PROD) {
    registerServiceWorker();
  }
  