"use client";

import { CircleAlert } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fbf9f9] px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-50 flex items-center justify-center">
          <CircleAlert className="text-red-500 w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-[#1b1c1c] mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-[#4d4635] mb-8">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="px-8 py-3 bg-[#d4af37] text-[#241a00] rounded-full font-semibold text-xs uppercase tracking-wider hover:shadow-lg transition-all"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
