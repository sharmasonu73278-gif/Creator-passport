"use client";

import { useEffect } from "react";

// Registers a tiny service worker so the site can be installed as an app on Android.
// Once installed, "Resource Passport" shows up in Instagram's share sheet.
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installing is optional; ignore failures.
      });
    }
  }, []);
  return null;
}
