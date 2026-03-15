import { useState, useEffect } from "react";
import { Shield, Key, Loader, CheckCircle, XCircle } from "lucide-react";

const HQ_BASE = "https://cs2-player-tools.maltinha.club/api";

interface TokenGateProps {
  children: React.ReactNode;
}

export default function TokenGate({ children }: TokenGateProps) {
  const [token, setToken] = useState(localStorage.getItem("cs2pt_token") || "");
  const [validated, setValidated] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputToken, setInputToken] = useState("");

  useEffect(() => {
    // If we have a stored token, validate it silently
    if (token) {
      validateToken(token, true);
    }
  }, []);

  async function validateToken(t: string, silent = false) {
    if (!silent) setValidating(true);
    setError(null);
    try {
      const resp = await fetch(`${HQ_BASE}/tokens/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      const data = await resp.json();
      if (data.valid) {
        localStorage.setItem("cs2pt_token", t.toUpperCase().trim());
        setToken(t.toUpperCase().trim());
        setValidated(true);
      } else {
        if (!silent) setError(data.error || "Invalid token");
        if (silent) {
          // Stored token is invalid — clear it
          localStorage.removeItem("cs2pt_token");
          setToken("");
        }
      }
    } catch {
      // If HQ is unreachable, allow access with stored token (offline mode)
      if (token) {
        setValidated(true);
      } else if (!silent) {
        setError("Cannot connect to server. Check your internet connection.");
      }
    } finally {
      setValidating(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inputToken.trim()) {
      validateToken(inputToken.trim());
    }
  }

  // If validated, render children
  if (validated) {
    return <>{children}</>;
  }

  // Token entry screen
  return (
    <div className="h-screen bg-bg flex items-center justify-center">
      <div className="w-[420px] bg-bg-card border border-border rounded-2xl p-8 shadow-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/15 flex items-center justify-center">
            <Shield size={32} className="text-accent" />
          </div>
          <h1 className="text-xl font-bold">
            <span className="text-accent">CS2</span>{" "}
            <span className="text-text-muted">Player Tools</span>
          </h1>
          <p className="text-text-muted text-sm mt-1">Enter your access token to continue</p>
        </div>

        {/* Token Input */}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Key size={14} className="text-accent2" />
              <label className="text-xs text-text-muted uppercase tracking-wider">Access Token</label>
            </div>
            <input
              type="text"
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value.toUpperCase())}
              placeholder="CS2PT-XXXX-XXXX-XXXX-XXXX"
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text font-mono text-center tracking-widest focus:outline-none focus:border-accent placeholder:text-text-muted/40"
              autoFocus
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-danger text-sm mb-4 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
              <XCircle size={14} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={validating || !inputToken.trim()}
            className="w-full py-3 bg-accent text-white rounded-lg font-semibold text-sm hover:bg-accent/80 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {validating ? (
              <><Loader size={16} className="animate-spin" /> Validating...</>
            ) : (
              <><CheckCircle size={16} /> Activate</>
            )}
          </button>
        </form>

        <p className="text-[10px] text-text-muted text-center mt-6">
          Don't have a token? Contact the administrator.
        </p>
      </div>
    </div>
  );
}

// Export a hook to get the current token
export function useToken(): string {
  return localStorage.getItem("cs2pt_token") || "";
}
