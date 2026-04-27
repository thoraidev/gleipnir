import SearchBar from '@/components/SearchBar';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        {/* Logo + name */}
        <div className="space-y-3">
          <div className="text-6xl select-none">⛓️</div>
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Gleipnir
          </h1>
          <p className="text-xl text-gray-400">Who can rug this protocol?</p>
        </div>

        {/* Search bar */}
        <SearchBar />

        {/* Quick examples */}
        <div className="text-sm text-gray-500 space-x-1">
          <span>Try:</span>
          {[
            { addr: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', label: 'Aave V3' },
            { addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', label: 'USDC' },
            { addr: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', label: 'Lido' },
          ].map(({ addr, label }) => (
            <Link
              key={addr}
              href={`/report/${addr.toLowerCase()}`}
              className="text-blue-400 hover:text-blue-300 transition-colors mx-1"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Context quote */}
        <div className="border border-gray-800 rounded-xl p-5 text-sm text-gray-400 italic text-left leading-relaxed">
          &ldquo;Five days ago, Kelp DAO lost $292M to a bridge exploit. The code was
          fine — but the cascade took $6.4B out of Aave in 48 hours. Nobody could
          see the dependency chain. Gleipnir makes the invisible bindings visible.&rdquo;
        </div>

        {/* Agent API hint */}
        <p className="text-xs text-gray-600">
          Built for humans and agents alike ·{' '}
          <code className="text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded text-xs">
            GET /api/v1/check?address=0x…
          </code>
        </p>
      </div>
    </main>
  );
}
