import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Network,
  Settings2,
  Shield,
  Globe,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/network", icon: Network, label: "Network Diagnostics" },
  { to: "/optimizer", icon: Settings2, label: "Windows Optimizer" },
  { to: "/vpn", icon: Shield, label: "Smart VPN" },
  { to: "/servers", icon: Globe, label: "Server Picker" },
];

export default function Sidebar() {
  return (
    <aside className="w-[220px] h-screen flex flex-col border-r border-border bg-bg-card shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <h1 className="text-base font-bold tracking-wide">
          <span className="text-accent">CS2</span>{" "}
          <span className="text-text-muted">Player Tools</span>
        </h1>
        <p className="text-[11px] text-text-muted mt-0.5">Network & Performance</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 flex flex-col gap-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-[13px] transition-all border-l-3 ${
                isActive
                  ? "text-accent border-accent bg-accent/8"
                  : "text-text-muted border-transparent hover:text-text hover:bg-bg-hover hover:border-accent2"
              }`
            }
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[10px] text-text-muted">v0.1.0</p>
      </div>
    </aside>
  );
}
