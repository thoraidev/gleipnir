import type { BlastRadius } from './types';

const PROTOCOLS_URL = 'https://api.llama.fi/protocols';
const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;
const NOTE = 'DeFiLlama TVL context only; this is not exact contract-controlled funds-at-risk.';

interface DeFiLlamaProtocol {
  name?: string;
  slug?: string;
  category?: string;
  tvl?: number;
  chains?: string[];
  chainTvls?: Record<string, number>;
  url?: string;
}

interface ProtocolMatch {
  slug: string;
  confidence: BlastRadius['matchConfidence'];
  role?: string;
}

let protocolsCache:
  | {
      expiresAt: number;
      value?: DeFiLlamaProtocol[];
      promise?: Promise<DeFiLlamaProtocol[]>;
    }
  | null = null;

const CHAIN_TO_DEFILLAMA: Record<string, string> = {
  ethereum: 'Ethereum',
  base: 'Base',
};

const MANUAL_PROTOCOL_MATCHES: Record<string, ProtocolMatch> = {
  // Aave V3 Ethereum Pool
  'ethereum:0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': {
    slug: 'aave-v3',
    confidence: 'manual-high',
    role: 'Aave V3 Pool',
  },

  // Lido stETH
  'ethereum:0xae7ab96520de3a18e5e111b5eaab095312d7fe84': {
    slug: 'lido',
    confidence: 'manual-high',
    role: 'Lido stETH token',
  },

  // Uniswap V3 Factory
  'ethereum:0x1f98431c8ad98523631ae4a59f267346ea31f984': {
    slug: 'uniswap-v3',
    confidence: 'manual-high',
    role: 'Uniswap V3 Factory',
  },

  // Kelp / rsETH demo contracts
  'ethereum:0xa1290d69c65a6fe4df752f95823fae25cb99e5a7': {
    slug: 'kelp',
    confidence: 'manual-high',
    role: 'rsETH token proxy',
  },
  'ethereum:0x2a1d74de3027cce18d31011518c571130a4cd513': {
    slug: 'kelp',
    confidence: 'manual-high',
    role: 'Kelp OFT adapter',
  },
};

const CONTRACT_NAME_MATCHES: Array<{ pattern: RegExp; match: ProtocolMatch }> = [
  { pattern: /aave|poolinstance/i, match: { slug: 'aave-v3', confidence: 'name-medium' } },
  { pattern: /lido|steth/i, match: { slug: 'lido', confidence: 'name-medium' } },
  { pattern: /uniswap|uniswapv3factory/i, match: { slug: 'uniswap-v3', confidence: 'name-medium' } },
  { pattern: /kelp|rseth|kernel_oftadapter/i, match: { slug: 'kelp', confidence: 'name-medium' } },
];

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function protocolKey(address: string, chain: string): string {
  return `${chain}:${normalizeAddress(address)}`;
}

function getManualProtocolMatch(address: string, chain: string): ProtocolMatch | null {
  return MANUAL_PROTOCOL_MATCHES[protocolKey(address, chain)] || null;
}

function getNameProtocolMatch(contractName: string): ProtocolMatch | null {
  return CONTRACT_NAME_MATCHES.find(({ pattern }) => pattern.test(contractName))?.match || null;
}

function findProtocolMatch(address: string, chain: string, contractName: string): ProtocolMatch | null {
  return getManualProtocolMatch(address, chain) || getNameProtocolMatch(contractName);
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`DeFiLlama request failed with ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function getProtocols(): Promise<DeFiLlamaProtocol[]> {
  const now = Date.now();

  if (protocolsCache && protocolsCache.expiresAt > now) {
    if (protocolsCache.value) return protocolsCache.value;
    if (protocolsCache.promise) return protocolsCache.promise;
  }

  const promise = fetchJsonWithTimeout<DeFiLlamaProtocol[]>(PROTOCOLS_URL).then((protocols) => {
    if (!Array.isArray(protocols)) return [];
    return protocols;
  });

  protocolsCache = { expiresAt: now + CACHE_TTL_MS, promise };

  try {
    const value = await promise;
    protocolsCache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  } catch (error) {
    protocolsCache = null;
    throw error;
  }
}

function getChainTvl(protocol: DeFiLlamaProtocol, chain: string): number | undefined {
  const llamaChain = CHAIN_TO_DEFILLAMA[chain];
  const value = llamaChain ? protocol.chainTvls?.[llamaChain] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isUsableTvl(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function buildBlastRadiusFromMatch(
  match: ProtocolMatch,
  chain: string,
  protocols: DeFiLlamaProtocol[],
  now: number
): BlastRadius | null {
  const protocol = protocols.find((item) => item.slug === match.slug);
  if (!protocol || !protocol.name || !protocol.slug || !isUsableTvl(protocol.tvl)) return null;

  return {
    protocolName: protocol.name,
    slug: protocol.slug,
    category: protocol.category,
    role: match.role,
    protocolTvlUsd: protocol.tvl,
    chainTvlUsd: getChainTvl(protocol, chain),
    chain: CHAIN_TO_DEFILLAMA[chain] || chain,
    chains: Array.isArray(protocol.chains) ? protocol.chains : [],
    matchConfidence: match.confidence,
    source: 'DeFiLlama',
    sourceUrl: `https://defillama.com/protocol/${protocol.slug}`,
    updatedAt: now,
    note: NOTE,
  };
}

export function resolveBlastRadiusFromProtocols(
  address: string,
  chain: string,
  contractName: string,
  protocols: DeFiLlamaProtocol[],
  now = Date.now()
): BlastRadius | null {
  const match = findProtocolMatch(address, chain, contractName);
  if (!match) return null;

  return buildBlastRadiusFromMatch(match, chain, protocols, now);
}

export async function resolveBlastRadius(
  address: string,
  chain: string,
  contractName: string
): Promise<BlastRadius | null> {
  const match = findProtocolMatch(address, chain, contractName);
  if (!match) return null;

  try {
    const protocols = await getProtocols();
    return buildBlastRadiusFromMatch(match, chain, protocols, Date.now());
  } catch {
    // External TVL context should never block deterministic contract analysis.
    return null;
  }
}
