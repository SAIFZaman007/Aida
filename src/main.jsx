import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

/*
  Two screens, one bundle:
    /      the landing page (web)
    /app   the assistant itself
  The desktop app (Electron) opens the assistant directly. Each screen is its own chunk, so
  visiting the landing page never downloads the assistant, and the other way round.
  (Assets are page-relative, so the assistant lives at exactly "/app" — nginx redirects "/app/".)
*/
const desktop = typeof window !== "undefined" && !!window.avatar;
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const showApp = desktop || path === "/app";

const Screen = showApp ? lazy(() => import("./App.jsx")) : lazy(() => import("./landing/Landing.jsx"));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={<div className="h-screen w-screen bg-void-900" />}>
      <Screen />
    </Suspense>
  </React.StrictMode>,
);
