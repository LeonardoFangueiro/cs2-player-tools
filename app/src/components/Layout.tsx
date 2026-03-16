import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DevTools from "./DevTools";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg">
      {/* Top bar — only on sub-pages */}
      {!isHome && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-card shrink-0">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-accent hover:bg-bg-hover transition"
          >
            <ArrowLeft size={14} />
            Home
          </button>
        </div>
      )}
      <main className={`flex-1 overflow-y-auto ${isHome ? "" : "p-5"}`}>
        <Outlet />
      </main>
      <DevTools />
    </div>
  );
}
