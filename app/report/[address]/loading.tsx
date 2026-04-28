import Link from 'next/link';

export default function LoadingReport() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">
            ⛓️ Gleipnir
          </Link>
          <span className="text-gray-700">/</span>
          <span className="text-gray-500">analyzing…</span>
        </div>

        <section className="rounded-3xl border border-gray-800 bg-gray-900/30 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-48 rounded bg-gray-800" />
            <div className="h-10 w-80 max-w-full rounded bg-gray-800" />
            <div className="h-4 w-full max-w-2xl rounded bg-gray-800" />
            <div className="h-4 w-2/3 rounded bg-gray-800" />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="h-64 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/40" />
          <div className="grid gap-6">
            <div className="h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/40" />
            <div className="h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/40" />
          </div>
        </div>
      </div>
    </main>
  );
}
