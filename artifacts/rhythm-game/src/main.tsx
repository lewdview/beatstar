import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && typeof reason.message === 'string') {
      const msg = reason.message;
      if (
        msg.includes('JSON-RPC') ||
        msg.includes('disconnect') ||
        msg.includes('Coinbase') ||
        msg.includes('WalletLink') ||
        msg.includes('inapp')
      ) {
        console.warn('[System Override] Suppressed third-party wallet exception:', msg);
        event.preventDefault();
      }
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    const file = event.filename || '';
    if (file.includes('inapp') || file.includes('walletlink') || msg.includes('JSON-RPC') || msg.includes('disconnect')) {
      console.warn('[System Override] Suppressed third-party script error:', msg, 'in', file);
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
