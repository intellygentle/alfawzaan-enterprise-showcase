"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Lock, Loader2, Eye, EyeOff, LogOut } from "lucide-react";
import Link from "next/link";

interface AdminGateProps {
  children: ReactNode;
}

const INACTIVITY_TIMEOUT = 10 * 60 * 1000;
const LAST_ACTIVITY_KEY = "admin_last_activity";

export function AdminGate({ children }: AdminGateProps) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);

  // Check session on mount — with a timeout so a hanging request can never
  // leave the page stuck on "Checking access..." forever.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    async function checkSession() {
      try {
        const lastActivity = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
        if (Number.isFinite(lastActivity) && Date.now() - lastActivity >= INACTIVITY_TIMEOUT) {
          window.localStorage.setItem(LAST_ACTIVITY_KEY, "0");
          await fetch("/api/admin/logout", { method: "POST", signal: controller.signal });
          if (!cancelled) setAuthenticated(false);
          return;
        }

        const res = await fetch("/api/admin/check-session", {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!cancelled) {
          setAuthenticated(data.authenticated);
          setSessionCheckFailed(false);
          if (data.authenticated) {
            window.localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
          }
        }
      } catch {
        // Timed out / failed — fall back to the login form rather than hang.
        if (!cancelled) {
          setAuthenticated(false);
          setSessionCheckFailed(true);
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    checkSession();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.valid) {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
        setAuthenticated(true);
        setPassword("");
        // Dashboard data hooks run before this gate renders its children. A
        // reload ensures their first authenticated request includes the new
        // session cookie instead of the pre-login anonymous state.
        window.location.reload();
      } else {
        setError("Incorrect password. Try again.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = useCallback(async () => {
    // Lock the UI immediately; the server cookie is cleared independently.
    setAuthenticated(false);
    setPassword("");
    window.localStorage.setItem(LAST_ACTIVITY_KEY, "0");
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // The local lock still protects the open page if the request fails.
    }
  }, []);

  // Inactivity timeout — 10 minutes
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!authenticated) return;

    const resetTimer = () => {
      window.localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void handleLogout();
      }, INACTIVITY_TIMEOUT);
    };

    const checkElapsedInactivity = () => {
      if (document.visibilityState !== "visible") return;
      const lastActivity = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
      if (Number.isFinite(lastActivity) && Date.now() - lastActivity >= INACTIVITY_TIMEOUT) {
        void handleLogout();
      } else {
        resetTimer();
      }
    };

    const events = ["mousemove", "keydown", "mousedown", "touchstart"];
    events.forEach((e) => document.addEventListener(e, resetTimer, { passive: true }));
    document.addEventListener("visibilitychange", checkElapsedInactivity);
    resetTimer();

    return () => {
      events.forEach((e) => document.removeEventListener(e, resetTimer));
      document.removeEventListener("visibilitychange", checkElapsedInactivity);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [authenticated, handleLogout]);

  // Loading state
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

  // Not authenticated — show password form
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-brand-softGray flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-lg p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-brand-gold/10 flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6 text-brand-gold" />
              </div>
              <h1 className="text-xl font-serif font-bold text-gray-900">
                Admin Access
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Enter the admin password to continue
              </p>
              {sessionCheckFailed && (
                <p className="text-[10px] text-amber-600 mt-2 text-center bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Couldn&apos;t verify an existing session — please log in again.
                </p>
              )}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Password"
                  autoFocus
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
                disabled={submitting || !password}
                className="w-full py-3 rounded-xl bg-black text-white text-sm font-bold uppercase tracking-widest hover:bg-brand-gold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Enter"
                )}
              </button>
            </form>
          </div>

          {/* Back to site link */}
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

  // Authenticated — render dashboard with logout button
  return (
    <div className="relative">
      {/* Floating logout button */}
      <button
        onClick={handleLogout}
        className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
      >
        <LogOut size={12} />
        Logout
      </button>
      {children}
    </div>
  );
}
