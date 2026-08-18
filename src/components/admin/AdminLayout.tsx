import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAdminSession } from "@/hooks/useAdminSession";
import {
  ADMIN_ACCOUNT_PATH,
  ADMIN_COURSES_PATH,
  ADMIN_ENROLLMENTS_PATH,
  ADMIN_ROOT_PATH,
  ADMIN_SETTINGS_PATH,
} from "@/lib/admin/routes";
import { cn } from "@/lib/utils";
import type { AdminProfile } from "@/types/admin";

const NAV_ITEMS = [
  { to: ADMIN_ROOT_PATH, label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: ADMIN_ENROLLMENTS_PATH, label: "Enrollments", icon: ClipboardList, end: false },
  { to: ADMIN_COURSES_PATH, label: "Courses", icon: BookOpen, end: false },
  { to: ADMIN_SETTINGS_PATH, label: "Settings", icon: Settings, end: false },
] as const;

const navLinkClasses = (isActive: boolean) =>
  cn(
    "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

/**
 * Navigation, shared by the desktop sidebar and the mobile sheet.
 *
 * `end` on the dashboard link so it is not marked active for every /admin/* route.
 * `onNavigate` lets the mobile sheet close itself on selection.
 */
const AdminNav = ({ onNavigate }: { onNavigate?: () => void }) => (
  <nav className="flex flex-col gap-1" aria-label="Admin sections">
    {NAV_ITEMS.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) => navLinkClasses(isActive)}
      >
        <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {item.label}
      </NavLink>
    ))}
  </nav>
);

/**
 * The signed-in administrator, linking to their own account page.
 *
 * One component for two call sites — the desktop sidebar and the mobile sheet — because this
 * block was duplicated in both, and a link present in only one of them is the sort of
 * difference nobody notices until they are on a phone and cannot find it.
 *
 * The name and email are the link's own text, so a screen reader reads who you are as well as
 * where the link goes; the purpose is prefixed for that reason, since "Ada Lovelace" on its
 * own does not sound like a destination.
 */
const AdminIdentity = ({
  admin,
  onNavigate,
}: {
  admin: AdminProfile;
  onNavigate?: () => void;
}) => (
  <NavLink
    to={ADMIN_ACCOUNT_PATH}
    onClick={onNavigate}
    className={({ isActive }) =>
      cn(
        "mb-2 block min-w-0 rounded-xl px-3 py-2 transition-colors",
        isActive ? "bg-primary/10" : "hover:bg-muted",
      )
    }
  >
    {({ isActive }) => (
      <>
        <p
          className={cn(
            "truncate text-sm font-medium",
            isActive ? "text-primary" : "text-foreground",
          )}
        >
          <span className="sr-only">Your account: </span>
          {admin.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
      </>
    )}
  </NavLink>
);

/**
 * Admin shell: a fixed sidebar on desktop, a sheet on mobile.
 *
 * Rendered as a layout route, so the pages beneath it mount into `<Outlet />` and the
 * shell is not rebuilt on navigation. This is the one structural change to the app's
 * routing; the public routes stay flat exactly as they were.
 *
 * The student-facing site is untouched by this — no shared header or footer is imported
 * here, and nothing in this component is reachable from a public page.
 *
 * `min-w-0` on the content column is what keeps a wide table from forcing the page to
 * scroll sideways: without it a flex child refuses to shrink below its content width, and
 * the table's own `overflow-x-auto` never engages.
 */
const AdminLayout = () => {
  const location = useLocation();
  const { admin, signOut } = useAdminSession();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const handleSignOut = () => {
    setIsMobileNavOpen(false);
    void signOut();
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">Drizzypips</p>
            <p className="truncate text-xs text-muted-foreground">Admin panel</p>
          </div>
        </div>

        <div className="flex-1 px-4 py-5">
          <AdminNav />
        </div>

        <div className="border-t border-border px-4 py-4">
          {admin ? <AdminIdentity admin={admin} /> : null}
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="min-h-11 w-full justify-start gap-3 rounded-xl px-3 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
          <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label="Open admin menu"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            {/* flex-col so the sign-out block can sit at the bottom with mt-auto. */}
            <SheetContent
              side="left"
              className="flex w-72 flex-col gap-0 border-border bg-card p-0"
            >
              <SheetTitle className="flex items-center gap-3 border-b border-border px-5 py-4 text-base">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                Admin panel
              </SheetTitle>

              <div className="px-3 py-4">
                <AdminNav onNavigate={() => setIsMobileNavOpen(false)} />
              </div>

              <div className="mt-auto border-t border-border px-3 py-4">
                {admin ? (
                  <AdminIdentity admin={admin} onNavigate={() => setIsMobileNavOpen(false)} />
                ) : null}
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  className="min-h-11 w-full justify-start gap-3 rounded-xl px-3 text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <p className="min-w-0 truncate text-sm font-semibold text-foreground">
            Drizzypips admin
          </p>
        </header>

        {/* Keyed on pathname so each page starts with a fresh scroll position. */}
        <main key={location.pathname} className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
