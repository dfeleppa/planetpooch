"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app/error.tsx]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
        <p className="text-sm text-gray-600 mt-2">
          The page couldn&apos;t be rendered. Try again, or contact an admin if it
          keeps happening.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-gray-500 font-mono break-all">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => unstable_retry()}>Try again</Button>
        </div>
      </div>
    </div>
  );
}
