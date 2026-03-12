import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <span className="text-4xl">🔍</span>
        </div>
        <h1 className="text-6xl font-bold text-white">404</h1>
        <h2 className="mt-2 text-xl font-semibold text-slate-600 dark:text-slate-300">Page Not Found</h2>
        <p className="mt-3 max-w-md text-sm text-slate-500">
          The page you're looking for doesn't exist or has been moved. Check the URL or navigate back.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/dashboard" className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-slate-900 dark:text-white hover:bg-brand-700 transition-colors">
            Go to Dashboard
          </Link>
          <Link href="/" className="rounded-lg border border-slate-200 dark:border-slate-700 px-6 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:border-slate-600 transition-colors">
            Home Page
          </Link>
        </div>
      </div>
    </div>
  );
}
