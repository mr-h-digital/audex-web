import { useEffect } from "react";

export function StartupReady() {
  useEffect(() => {
    const boot = document.getElementById("boot");
    if (!boot) return;
    const frame = requestAnimationFrame(() => {
      boot.dataset.state = "exiting";
      boot.setAttribute("aria-hidden", "true");
      window.setTimeout(() => boot.remove(), 350);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
