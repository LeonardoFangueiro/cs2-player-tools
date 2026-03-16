import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DevTools from "./DevTools";
import StatusBar from "./StatusBar";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg">
      {/* Top bar with logo + back — on sub-pages */}
      {!isHome && (
        <div className="flex items-center gap-3 px-6 py-3 shrink-0">
          <button onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-accent hover:bg-bg-hover transition">
            <ArrowLeft size={14} /> Back
          </button>
          <div className="flex-1 flex justify-center">
            <img src="/logo.png" alt="" className="h-10 w-auto" />
          </div>
          <div className="w-16" /> {/* spacer to center logo */}
        </div>
      )}

      {/* Page content */}
      <main className={`flex-1 overflow-y-auto ${isHome ? "" : "px-6 pb-4"}`}>
        <Outlet />
      </main>

      {/* Status bar — ALWAYS visible */}
      <StatusBar />

      <DevTools />
    </div>
  );
}
