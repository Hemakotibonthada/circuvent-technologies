"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-200">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
              <svg className="h-10 w-10 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Something went wrong</h1>
            <p className="mt-3 max-w-md text-sm text-slate-400">
              An unexpected error occurred. This has been logged for investigation.
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-slate-600">Error ID: {error.digest}</p>
            )}
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={reset}
                className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-slate-900 dark:text-white hover:bg-brand-700 transition-colors"
              >
                Try Again
              </button>
              <a href="/" className="rounded-lg border border-slate-200 dark:border-slate-700 px-6 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:border-slate-600 transition-colors">
                Go Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
