"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Never register in dev: Turbopack rotates /_next/static chunk URLs on every
    // rebuild, so a service worker there just accumulates entries for assets
    // that no longer exist. Tear down anything an earlier dev session left
    // registered, so a stale worker can't keep serving a stale shell.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline shell just won't be available; the rest of the app still works.
    });
  }, []);
  return null;
}
