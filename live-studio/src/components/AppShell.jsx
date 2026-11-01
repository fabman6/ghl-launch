import { NavLink, Outlet } from "react-router-dom";
import { Clapperboard, FolderOpen, LogOut, Radio, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Studios", icon: Clapperboard, end: true },
  { to: "/recordings", label: "Recordings", icon: FolderOpen },
  { to: "/destinations", label: "Destinations", icon: Radio },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Logo({ className = "" }) {
  return (
    <div className={`flex items-center ${className}`}>
      <img
        src="https://media.base44.com/images/public/6ae7392a088c187242bd1e07/6d92688eb_Raw-Live-Lab-Logo-White.png"
        alt="Raw Live Lab"
        className="h-8 w-auto"
      />
    </div>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <NavLink to="/">
            <Logo />
          </NavLink>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground md:inline">{user?.full_name || user?.email}</span>
            <Button variant="ghost" size="icon" onClick={() => logout()} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}