import { getContractSourceBlockscout } from './blockscout';
import { getContractSource } from './etherscan';
import { extractPermissionedFunctions } from './permission-extractor';
import { resolveProxy } from './proxy-resolver';
import { buildRedFlags, riskLevel, scorePermissions, summarizePermissions } from './risk-engine';
import type { AnalysisResult } from './types';

export type SupportedChain = 'ethereum' | 'base';

export interface ContractAnalysis extends AnalysisResult {
  hasSource: boolean;
  sourceLength: number;
  _status: string;
}

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
  const permissionedFunctions = extractPermissionedFunctions(analysisSource.sourceCode);
  const redFlags = buildRedFlags(permissionedFunctions, proxyInfo);
  const { riskScore, riskBreakdown } = scorePermissions(permissionedFunctions, proxyInfo);
  const summary = summarizePermissions(permissionedFunctions, redFlags, riskScore);

  return {
    address: normalizedAddress,
    name: analysisSource.contractName,
    proxyInfo,
    hasSource: true,
    sourceLength: analysisSource.sourceCode.length,
    analysisTimestamp: Date.now(),
    ownershipChain: null,
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
