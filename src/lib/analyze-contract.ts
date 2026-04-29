import { getAddressInfoBlockscout, getContractSourceBlockscout } from './blockscout';
import { getContractSource } from './etherscan';
import { extractPermissionedFunctions } from './permission-extractor';
import { enrichPlainEnglishDescriptions } from './llm-translator';
import { resolveOwnershipChain } from './ownership-resolver';
import { resolveProxy } from './proxy-resolver';
import { buildRedFlags, riskLevel, scorePermissions, summarizePermissions } from './risk-engine';
import type { AnalysisResult } from './types';

export type SupportedChain = 'ethereum' | 'base';

export interface ContractAnalysis extends AnalysisResult {
  hasSource: boolean;
  sourceLength: number;
  _status: string;
}

const ANALYSIS_CACHE_TTL_MS = 5 * 60 * 1000;

const analysisCache = new Map<
  string,
  {
    expiresAt: number;
    value?: ContractAnalysis;
    promise?: Promise<ContractAnalysis>;
  }
>();

export class AnalyzeContractError extends Error {
  status: number;
  address?: string;

  constructor(message: string, status = 500, address?: string) {
    super(message);
    this.name = 'AnalyzeContractError';
    this.status = status;
    this.address = address;
  }
}

export function normalizeChain(chain?: string | null): SupportedChain {
  return chain === 'base' ? 'base' : 'ethereum';
}

export function normalizeAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/i.test(normalized)) {
    throw new AnalyzeContractError('Invalid address', 400, normalized);
  }
  return normalized;
}

export async function analyzeContract(
  address: string,
  chain: SupportedChain = 'ethereum'
): Promise<ContractAnalysis> {
  const normalizedAddress = normalizeAddress(address);
  const cacheKey = `${chain}:${normalizedAddress}`;
  const now = Date.now();
  const cached = analysisCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    if (cached.value) return cached.value;
    if (cached.promise) return cached.promise;
  }

  const promise = analyzeContractUncached(normalizedAddress, chain);
  analysisCache.set(cacheKey, { expiresAt: now + ANALYSIS_CACHE_TTL_MS, promise });

  try {
    const value = await promise;
    analysisCache.set(cacheKey, { expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS, value });
    return value;
  } catch (error) {
    analysisCache.delete(cacheKey);
    throw error;
  }
}

async function analyzeContractUncached(
  normalizedAddress: string,
  chain: SupportedChain
): Promise<ContractAnalysis> {
  const addressInfo = await getAddressInfoBlockscout(normalizedAddress, chain);
  if (addressInfo?.is_contract === false) {
    throw new AnalyzeContractError(
      'This address is not a smart contract (EOA/wallet). Gleipnir analyzes smart contract permissions.',
      422,
      normalizedAddress
    );
  }

  let source = await getContractSourceBlockscout(normalizedAddress, chain);
  if (!source) source = await getContractSource(normalizedAddress, chain);

  if (!source) {
    throw new AnalyzeContractError(
      'Contract source not verified on Blockscout or Etherscan. Cannot analyze permissions.',
      422,
      normalizedAddress
    );
  }

  const proxyInfo = await resolveProxy(normalizedAddress, source.implementation);

  let implementationSource = null;
  if (proxyInfo.isProxy && proxyInfo.implementationAddress) {
    const implAddr = proxyInfo.implementationAddress;
    implementationSource =
      (await getContractSourceBlockscout(implAddr, chain)) ||
      (await getContractSource(implAddr, chain));
  }

  const analysisSource = implementationSource || source;
  let permissionedFunctions = extractPermissionedFunctions(analysisSource.sourceCode, {
    targetContractName: analysisSource.contractName,
  });
  permissionedFunctions = await enrichPlainEnglishDescriptions(permissionedFunctions);
  const ownershipChain = await resolveOwnershipChain(normalizedAddress, chain, proxyInfo);
  const redFlags = buildRedFlags(permissionedFunctions, proxyInfo, ownershipChain);
  const { riskScore, riskBreakdown } = scorePermissions(permissionedFunctions, proxyInfo, ownershipChain);
  const summary = summarizePermissions(permissionedFunctions, redFlags, riskScore);

  return {
    address: normalizedAddress,
    name: analysisSource.contractName,
    proxyInfo,
    hasSource: true,
    sourceLength: analysisSource.sourceCode.length,
    analysisTimestamp: Date.now(),
    ownershipChain,
    permissionedFunctions,
    redFlags,
    riskScore,
    riskLevel: riskLevel(riskScore),
    riskBreakdown,
    adminHistory: [],
    ...summary,
    _status: 'permission_extractor_complete',
  };
}
