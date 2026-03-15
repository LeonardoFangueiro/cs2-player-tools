import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { reportError, sendTelemetry } from "./lib/hq";
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
  reportError("unhandled_rejection", String(event.reason));
});

// Telemetry: app started
sendTelemetry("app_start");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
