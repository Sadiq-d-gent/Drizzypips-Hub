import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * The site's one theme provider, with the admin panel pinned to light.
 *
 * WHY THIS IS ONE PROVIDER AND NOT TWO
 * The obvious shape is a second `<ThemeProvider forcedTheme="light">` wrapped around the admin
 * routes. It does not work. next-themes 0.3.0 defines its provider as
 * `useContext(ThemeContext) ? children : <Theme {...props} />` — a provider nested inside another
 * one renders its children and nothing else, so every prop on it, `forcedTheme` included, is
 * discarded without a warning. The panel would have stayed dark and the reason would have been
 * invisible.
 *
 * WHY forcedTheme AND NOT setTheme
 * Calling `setTheme("light")` on entering /admin would work once and then be wrong: it writes to
 * localStorage, so it would also have changed the public site for that visitor, permanently, and
 * an administrator's own reading of the homepage is not ours to flip. `forcedTheme` overrides the
 * applied class without touching the stored preference, which is exactly the distinction wanted
 * here — leave /admin and the public site is however the visitor left it.
 *
 * It also fixes the class against the two things that would otherwise fight it. next-themes only
 * re-applies on a theme change or a `storage` event, and its system-preference listener is
 * already guarded with `!forcedTheme`, so an administrator whose OS flips to dark mid-review does
 * not watch the panel flip with it.
 *
 * WHY THE PROVIDER IS NOW INSIDE THE ROUTER
 * Because the decision is a function of the current path, and `useLocation` needs a Router above
 * it. Nothing else about the tree changed: the provider still wraps everything that renders.
 */

/**
 * True for the panel and for the login page.
 *
 * Login is included deliberately. It is outside AdminGuard, because guarding the page an
 * administrator needs in order to sign in would redirect them away from it, but it is visually
 * part of the panel and a dark login handing over to a light dashboard is a worse seam than no
 * seam at all.
 *
 * Tested as an exact match or a `/admin/` prefix rather than `startsWith("/admin")`, so a future
 * public route whose path merely begins with those characters does not silently inherit the
 * panel's theme.
 */
const isAdminPath = (pathname: string): boolean =>
  pathname === "/admin" || pathname.startsWith("/admin/");

const AppThemeProvider = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      /**
       * `undefined` rather than the visitor's theme on a public route. Passing a value here at
       * all would pin the public site too and make the header's own switch do nothing.
       */
      forcedTheme={isAdminPath(pathname) ? "light" : undefined}
    >
      {children}
    </ThemeProvider>
  );
};

export default AppThemeProvider;
