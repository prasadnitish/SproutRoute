// React entry point: mount the App into #root.
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
// Self-hosted fonts (SIL Open Font License): served from our own origin, nothing is requested from Google.
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
