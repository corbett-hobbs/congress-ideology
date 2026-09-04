"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Lets a sub-page (member profile, committee page) tell the persistent
 * `SiteHeader` — a sibling in the layout tree, not an ancestor — where its
 * "← InsideGov" should go. The header itself only knows the current pathname;
 * the exact restore-context href (e.g. "back to the House chamber view") is
 * data only the page has. Wrap the whole tree once in `BackLinkProvider`
 * (see app/layout.tsx); pages register with `<SetBackLink href={...} />`.
 */
const BackLinkContext = createContext<{
  href: string;
  setHref: (href: string | null) => void;
} | null>(null);

export function BackLinkProvider({ children }: { children: ReactNode }) {
  const [href, setHref] = useState<string | null>(null);
  return (
    <BackLinkContext.Provider value={{ href: href ?? "/", setHref }}>
      {children}
    </BackLinkContext.Provider>
  );
}

/** The href SiteHeader's "← InsideGov" should use on a sub-page — "/" until
 *  the current page registers a more specific one. */
export function useBackLinkHref(): string {
  return useContext(BackLinkContext)?.href ?? "/";
}

/**
 * Registers this page's back-link destination for as long as it's mounted.
 * A fixed href, not `history.back()` — someone arriving via a shared link or
 * bookmark has no meaningful browser history to return to, so this always
 * resolves to a predictable URL regardless of how the page was reached.
 */
export function SetBackLink({ href }: { href: string }) {
  const ctx = useContext(BackLinkContext);
  const setHref = ctx?.setHref;
  useEffect(() => {
    setHref?.(href);
    return () => setHref?.(null);
  }, [setHref, href]);
  return null;
}
