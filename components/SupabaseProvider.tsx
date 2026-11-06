"use client";

import { useCallback, useEffect, useState } from "react";
import { initSupabaseClients } from "@/lib/supabase/client";

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const init = useCallback(() => {
    initSupabaseClients()
      .then(() => setReady(true))
      .catch((err: unknown) => {
        console.error("Failed to initialize Supabase clients:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to connect to the database."
        );
      });
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  const retry = () => {
    setError(null);
    init();
  };

  // --- Resolve missing-var hints so the user knows exactly what to fix ---
  const missingVarHint = (() => {
    if (!error) return null;
    const match = error.match(/Missing env var[s]?: (.+)/);
    return match ? match[1] : null;
  })();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fbf9f9] px-6">
        {error ? (
          <div className="text-center max-w-md">
            <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 text-2xl font-black">
              !
            </div>
            <h2 className="text-xl font-semibold text-[#1b1c1c] mb-2">
              Couldn&apos;t connect to the database
            </h2>
            {missingVarHint ? (
              <>
                <p className="text-sm text-[#4d4635] mb-1">
                  The following environment variable{missingVarHint.includes(',') ? 's are' : ' is'} not set:
                </p>
                <p className="text-xs font-mono text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
                  {missingVarHint}
                </p>
              </>
            ) : (
              <p className="text-sm text-[#4d4635] mb-1">
                {error}
              </p>
            )}
            <p className="text-xs text-[#4d4635]/70 mb-8">
              {missingVarHint
                ? 'Add the missing variable(s) in your hosting dashboard (e.g. Vercel → Settings → Environment Variables) and redeploy.'
                : 'This may be a temporary network issue. Click Try Again, or check your Supabase environment variables.'}
            </p>
            <button
              onClick={retry}
              className="px-8 py-3 bg-[#d4af37] text-[#241a00] rounded-full font-semibold text-xs uppercase tracking-wider hover:shadow-lg transition-all"
            >
              Try Again
            </button>
          </div>
        ) : (
          // id="afz-boot" is how the boot watchdog in app/layout.tsx recognises
          // that this screen is still up. Keep the two in sync.
          <div id="afz-boot" className="text-center">
            <div className="w-8 h-8 mx-auto mb-4 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
            <p className="text-xs text-[#4d4635]/60">Loading products…</p>
            {/* Rendered hidden, and revealed by the watchdog only after a single
                automatic reload has already failed to get the app running. It
                lives here rather than being injected so it picks up the page's
                own styling, and it deliberately carries no button: if we reach
                this point the page's JavaScript never arrived, so an onClick
                handler would never have been attached to one. */}
            <p
              id="afz-boot-stalled"
              hidden
              className="mt-4 max-w-[16rem] mx-auto text-xs leading-relaxed text-[#4d4635]/60"
            >
              Still loading. Please check your internet connection, then refresh
              the page.
            </p>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
