"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Opens each newly navigated page at the very top. The sticky site header is
 * always in view, so Next's own scroll-into-view treats it as already visible
 * and leaves the old scroll offset in place. Back/forward and `#hash` links
 * are left alone so the browser can restore or jump as usual.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const last = useRef(pathname);
  const popped = useRef(false);

  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    if (popped.current) {
      popped.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
