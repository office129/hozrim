"use client";

import { useEffect } from "react";

// Sets --app-vh (1% of the actual visible viewport) on <html>, matching
// the classic mobile-web workaround for CSS viewport units (svh/dvh)
// being recalculated inconsistently by real mobile browsers on a hard
// page reload. Runs once on mount and again on resize/orientation change.
export function useAppViewportHeight() {
  useEffect(() => {
    function setAppVh() {
      document.documentElement.style.setProperty("--app-vh", `${window.innerHeight * 0.01}px`);
    }
    setAppVh();
    window.addEventListener("resize", setAppVh);
    window.addEventListener("orientationchange", setAppVh);
    return () => {
      window.removeEventListener("resize", setAppVh);
      window.removeEventListener("orientationchange", setAppVh);
    };
  }, []);
}
