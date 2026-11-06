"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Lock, Loader2, Eye, EyeOff, LogOut, Store } from "lucide-react";
import Link from "next/link";
import type { RepresentativePermissions } from "@/lib/representatives";

interface RepSession {
  id: string;
  name: string;
  outlet: string;
  permissions: RepresentativePermissions;
}

interface RepGateProps {
  children: (rep: RepSession) => ReactNode;
}

export function RepGate({ children }: RepGateProps) {
  const [rep, setRep] = useState<RepSession | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/rep/check-session");
        const data = await res.json();
        if (data.authenticated) {
          setRep(data.rep);
          setAuthenticated(true);
        } else {
          setAuthenticated(false);
        }
      } catch {
        setAuthenticated(false);
      }
    }
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/rep/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.valid) {
        setRep(data.rep);
        setAuthenticated(true);
        setUsername("");
        setPassword("");
      } else {
        setError(data.error || "Invalid credentials. Try again.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = useCallback(async () => {
    await fetch("/api/rep/logout", { method: "POST" });
    setAuthenticated(false);
    setRep(null);
    setUsername("");
    setPassword("");
  }, []);

  // Inactivity timeout — 10 minutes
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  useEffect(() => {
    if (!authenticated) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        handleLogout();
      }, INACTIVITY_TIMEOUT);
    };

    const events = ["mousemove", "keydown", "mousedown", "touchstart"];
    events.forEach((e) => document.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => document.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [authenticated, handleLogout]);

  // Loading
  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-brand-softGray flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-brand-gold animate-spin" />
          <p className="text-sm text-gray-400">Checking access...</p>
        </div>
      </div>
    );
  }

  // Login form
  if (!authenticated || !rep) {
    return (
      <div className="min-h-screen bg-brand-softGray flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-lg p-8">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <Store className="w-6 h-6 text-emerald-500" />
              </div>
              <h1 className="text-xl font-serif font-bold text-gray-900">
                Store Representative
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Sign in with your assigned credentials
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(null);
                  }}
                  placeholder="Username"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                />
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Password"
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && (
                <p className="text-xs text-red-500 font-medium text-center">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !username || !password}
                className="w-full py-3 rounded-xl bg-black text-white text-sm font-bold uppercase tracking-widest hover:bg-brand-gold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          </div>

          <p className="text-center mt-6">
            <Link
              href="/"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Back to store
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Authenticated — render dashboard with rep info
  return (
    <div className="relative">
      {/* Top bar with rep info and logout */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200 shadow-sm">
          <Store size={12} className="text-emerald-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
            {rep.name}
          </span>
          <span className="text-[9px] font-medium text-gray-400 capitalize">
            ({rep.outlet})
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
        >
          <LogOut size={12} />
          Logout
        </button>
      </div>
      {children(rep)}
    </div>
  );
}
