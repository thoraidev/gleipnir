import Link from 'next/link';
import { AnalyzeContractError, analyzeContract, normalizeChain } from '@/lib/analyze-contract';
import { blockscoutUrl } from '@/lib/blockscout';
import type { ContractAnalysis } from '@/lib/analyze-contract';
import type { PermissionedFunction, RedFlag, RiskBreakdown } from '@/lib/types';

interface Props {
  params: Promise<{ address: string }>;
  searchParams?: Promise<{ chain?: string }>;
}

function severityClass(severity: RedFlag['severity']) {
  switch (severity) {
    case 'CRITICAL':
      return 'border-red-500/50 bg-red-950/30 text-red-200';
    case 'HIGH':
      return 'border-orange-500/50 bg-orange-950/30 text-orange-200';
    case 'MEDIUM':
      return 'border-yellow-500/50 bg-yellow-950/30 text-yellow-100';
    case 'LOW':
      return 'border-blue-500/50 bg-blue-950/30 text-blue-100';
    default:
      return 'border-gray-700 bg-gray-900/70 text-gray-300';
  }
}

function riskClass(level: ContractAnalysis['riskLevel']) {
  switch (level) {
    case 'CRITICAL':
      return 'from-red-500 to-rose-400 text-red-100 border-red-500/40';
    case 'HIGH':
      return 'from-orange-500 to-red-400 text-orange-100 border-orange-500/40';
    case 'ELEVATED':
      return 'from-yellow-500 to-orange-400 text-yellow-100 border-yellow-500/40';
    case 'MODERATE':
      return 'from-blue-500 to-cyan-400 text-blue-100 border-blue-500/40';
    default:
      return 'from-emerald-500 to-green-400 text-emerald-100 border-emerald-500/40';
  }
}

function categoryClass(category: PermissionedFunction['category']) {
  switch (category) {
    case 'funds':
      return 'bg-red-500/10 text-red-200 border-red-500/30';
    case 'upgradeability':
      return 'bg-purple-500/10 text-purple-200 border-purple-500/30';
    case 'permissions':
      return 'bg-orange-500/10 text-orange-200 border-orange-500/30';
    case 'pausability':
      return 'bg-yellow-500/10 text-yellow-200 border-yellow-500/30';
    case 'parameters':
      return 'bg-blue-500/10 text-blue-200 border-blue-500/30';
    default:
      return 'bg-gray-800 text-gray-300 border-gray-700';
  }
}

function formatAddress(address?: string) {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function RiskMeter({ analysis }: { analysis: ContractAnalysis }) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${riskClass(analysis.riskLevel)} p-[1px]`}>
      <div className="rounded-2xl bg-gray-950/95 p-6 h-full">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-400">Permission risk score</p>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-6xl font-bold text-white tracking-tight">{analysis.riskScore}</span>
              <span className="pb-2 text-gray-500">/100</span>
            </div>
          </div>
          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskClass(analysis.riskLevel)}`}>
            {analysis.riskLevel}
          </div>
        </div>
        <div className="mt-5 h-3 rounded-full bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${riskClass(analysis.riskLevel)}`}
            style={{ width: `${Math.min(100, Math.max(0, analysis.riskScore))}%` }}
          />
        </div>
        <p className="mt-4 text-sm text-gray-300 leading-relaxed">{analysis.riskAssessment}</p>
      </div>
    </div>
  );
}

function Breakdown({ breakdown }: { breakdown: RiskBreakdown }) {
  const rows = [
    ['Ownership', breakdown.ownership, 20],
    ['Timelock', breakdown.timelock, 15],
    ['Functions', breakdown.functions, 45],
    ['Proxy', breakdown.proxy, 20],
    ['Activity', breakdown.activity, 10],
  ] as const;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
      <h2 className="text-lg font-semibold text-white">Risk breakdown</h2>
      <div className="mt-4 space-y-3">
        {rows.map(([label, value, max]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-xs text-gray-400">
              <span>{label}</span>
              <span>{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-blue-400"
                style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RedFlags({ flags }: { flags: RedFlag[] }) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Red flags</h2>
        <span className="text-xs text-gray-500">{flags.length} detected</span>
      </div>
      <div className="mt-4 space-y-3">
        {flags.map((flag) => (
          <div key={`${flag.severity}-${flag.title}`} className={`rounded-xl border p-4 ${severityClass(flag.severity)}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-bold tracking-wide">
                {flag.severity}
              </span>
              <h3 className="font-semibold">{flag.title}</h3>
            </div>
            <p className="mt-2 text-sm opacity-90">{flag.description}</p>
            <p className="mt-2 text-xs opacity-75">Recommendation: {flag.recommendation}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProxyCard({ analysis }: { analysis: ContractAnalysis }) {
  const proxy = analysis.proxyInfo;
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
      <h2 className="text-lg font-semibold text-white">Proxy / implementation</h2>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Proxy detected</span>
          <span className={proxy.isProxy ? 'text-yellow-200' : 'text-emerald-300'}>{proxy.isProxy ? 'Yes' : 'No'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Type</span>
          <span className="text-gray-200">{proxy.proxyType}</span>
        </div>
        {proxy.implementationAddress && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Implementation</span>
            <span className="font-mono text-gray-200">{formatAddress(proxy.implementationAddress)}</span>
          </div>
        )}
        {proxy.adminAddress && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Admin</span>
            <span className="font-mono text-gray-200">{formatAddress(proxy.adminAddress)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FunctionList({ functions }: { functions: PermissionedFunction[] }) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Privileged functions</h2>
        <span className="text-xs text-gray-500">{functions.length} extracted</span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-800">
        {functions.length === 0 ? (
          <div className="p-5 text-sm text-gray-400">No explicit privileged functions were extracted.</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {functions.slice(0, 30).map((fn) => (
              <div key={`${fn.functionSignature}-${fn.lineNumber}`} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-gray-950 px-2 py-1 text-sm text-gray-100">{fn.functionSignature}</code>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${categoryClass(fn.category)}`}>
                    {fn.category}
                  </span>
                  {fn.isCritical && (
                    <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200">
                      critical
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-300">{fn.plainEnglish}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>Caller: {fn.roleOrAddress}</span>
                  <span>Visibility: {fn.visibility}</span>
                  <span>Mutability: {fn.mutability}</span>
                  {fn.lineNumber && <span>Line: {fn.lineNumber}</span>}
                </div>
                {fn.riskFactors && fn.riskFactors.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {fn.riskFactors.map((factor) => (
                      <span key={factor} className="rounded bg-gray-800 px-2 py-0.5 text-[11px] text-gray-400">
                        {factor}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {functions.length > 30 && (
              <div className="p-4 text-center text-xs text-gray-500">
                Showing first 30 of {functions.length} privileged functions.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ErrorReport({ address, message, status }: { address: string; message: string; status?: number }) {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">
            ⛓️ Gleipnir
          </Link>
          <span className="text-gray-700">/</span>
          <span className="font-mono text-xs text-gray-300">{address}</span>
        </div>
        <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-8 text-center">
          <div className="text-5xl">⚠️</div>
          <h1 className="mt-4 text-2xl font-semibold">Analysis failed{status ? ` (${status})` : ''}</h1>
          <p className="mt-3 text-gray-300">{message}</p>
          <Link href="/" className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
            Analyze another contract
          </Link>
        </div>
      </div>
    </main>
  );
}

export default async function ReportPage({ params, searchParams }: Props) {
  const { address } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const chain = normalizeChain(resolvedSearchParams.chain);

  let analysis: ContractAnalysis;
  try {
    analysis = await analyzeContract(address, chain);
  } catch (err: unknown) {
    if (err instanceof AnalyzeContractError) {
      return <ErrorReport address={address} message={err.message} status={err.status} />;
    }
    const message = err instanceof Error ? err.message : 'Unknown analysis error';
    return <ErrorReport address={address} message={message} />;
  }

  const scannedAt = new Date(analysis.analysisTimestamp).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors">
              ⛓️ Gleipnir
            </Link>
            <span className="text-gray-700">/</span>
            <a
              href={blockscoutUrl(analysis.address, chain)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-blue-400 font-mono transition-colors text-xs"
            >
              {analysis.address}
            </a>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="rounded-full border border-gray-800 px-2 py-1 uppercase">{chain}</span>
            <span>Scanned {scannedAt} UTC</span>
          </div>
        </div>

        <section className="rounded-3xl border border-gray-800 bg-gray-900/30 p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm text-blue-300">Permission analysis report</p>
              <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight">{analysis.name}</h1>
              <p className="mt-3 max-w-3xl text-gray-300 leading-relaxed">{analysis.summary}</p>
            </div>
            <a
              href={blockscoutUrl(analysis.address, chain)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-blue-500 hover:text-blue-300"
            >
              View on Blockscout ↗
            </a>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <RiskMeter analysis={analysis} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
            <ProxyCard analysis={analysis} />
            <Breakdown breakdown={analysis.riskBreakdown} />
          </div>
        </div>

        <RedFlags flags={analysis.redFlags} />
        <FunctionList functions={analysis.permissionedFunctions} />

        <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-5 text-sm text-gray-400">
          <p>
            Deterministic MVP analysis. This is not a formal audit. Inheritance/import resolution,
            ownership-chain detection, multisig/timelock labels, and LLM explanations are next.
          </p>
          <p className="mt-2 font-mono text-xs text-gray-600">
            Source bytes analyzed: {analysis.sourceLength.toLocaleString()} · API status: {analysis._status}
          </p>
        </div>
      </div>
    </main>
  );
}
