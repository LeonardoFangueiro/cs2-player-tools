import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import TokenGate from "./components/TokenGate";
import { reportError, sendTelemetry, sendHeartbeat, reportCrash } from "./lib/hq";
import { invoke } from "./lib/tauri";
import "./index.css";

// Global error handler — reports uncaught errors to HQ
window.addEventListener("error", (event) => {
  reportError("uncaught_error", event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason);
  reportError("unhandled_rejection", msg);
  reportCrash(msg, { type: "unhandled_rejection" });
});

// Telemetry: app started
sendTelemetry("app_start");

// Heartbeat: every 30 seconds
setInterval(() => {
  sendHeartbeat(invoke);
}, 30000);
// Send first heartbeat immediately
sendHeartbeat(invoke);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TokenGate>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TokenGate>
  </React.StrictMode>
);
