import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AppV2 from "./AppV2.jsx";
import "./index.css";

// ?old=1 opens the original reader for comparison.
const useOld = new URLSearchParams(window.location.search).has("old");

// Remove the service worker an earlier v2 build installed.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>{useOld ? <App /> : <AppV2 />}</React.StrictMode>,
);
