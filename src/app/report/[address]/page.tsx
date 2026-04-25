import Link from 'next/link';
import { blockscoutUrl } from '@/lib/blockscout';

interface Props {
  params: Promise<{ address: string }>;
}

export default async function ReportPage({ params }: Props) {
  const { address } = await params;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Nav */}
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">
            ⛓️ Gleipnir
          </Link>
          <span className="text-gray-700">/</span>
          <a
            href={blockscoutUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-300 hover:text-blue-400 font-mono transition-colors text-xs"
          >
            {address}
          </a>
        </div>

        {/* Analysis placeholder — full engine Days 2–4 */}
        <div className="border border-gray-800 rounded-xl p-10 text-center space-y-4">
          <div className="text-5xl select-none">⛓️</div>
          <div>
            <h2 className="text-xl font-semibold text-gray-200">
              Analyzing permission structure…
            </h2>
            <p className="text-gray-500 text-xs mt-1 font-mono">{address}</p>
          </div>
          <p className="text-gray-600 text-sm">
            Full analysis engine arrives Day 2–4. View on{' '}
            <a
              href={blockscoutUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Blockscout
            </a>{' '}
            in the meantime.
          </p>
        </div>
      </div>
    </main>
  );
}
