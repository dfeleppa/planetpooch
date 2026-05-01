"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error.tsx]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="min-h-screen flex items-center justify-center px-4 bg-white text-gray-900">
          <div className="max-w-md w-full text-center">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-gray-600 mt-2">
              The page couldn&apos;t be rendered. Try again, or contact an admin
              if it keeps happening.
            </p>
            {error.digest && (
              <p className="mt-3 text-xs text-gray-500 font-mono break-all">
                Reference: {error.digest}
              </p>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => unstable_retry()}
                className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
