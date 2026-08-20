import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Entry point. The App component decides whether to render the Dashboard
// (settings window) or the Overlay (mobile-style folder popup) based on
// the URL query string and Tauri events emitted by the Rust backend.
//
// Routing convention:
//   ?mode=dashboard   → settings window
//   ?mode=overlay     → pop-up folder
//   (none)            → defaults to dashboard; Rust will redirect as needed
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
