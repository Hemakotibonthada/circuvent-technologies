export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <p className="mt-4 text-sm text-slate-500">Loading Circuvent Platform...</p>
      </div>
    </div>
  );
}
