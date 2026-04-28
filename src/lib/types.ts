export interface ContractSource {
  contractName: string;
  sourceCode: string;
  abi: any[];
  compilerVersion: string;
  isProxy: boolean;
  implementation?: string;
}

export interface ProxyInfo {
  isProxy: boolean;
  proxyType: 'EIP-1967' | 'UUPS' | 'Transparent' | 'Beacon' | 'EIP-1167' | 'Diamond' | 'Unknown' | 'None';
  implementationAddress?: string;
  adminAddress?: string;
  beaconAddress?: string;
}

export interface PermissionedFunction {
  functionName: string;
  functionSignature: string;
  modifier: string;
  roleOrAddress: string;
  visibility: string;
  mutability: string;
  isCritical: boolean;
  category: 'funds' | 'parameters' | 'permissions' | 'pausability' | 'upgradeability' | 'other';
  lineNumber?: number;
  parameters?: string[];
  returnValues?: string[];
  accessControl?: string[];
  riskFactors?: string[];
  plainEnglish?: string;
}

export type OwnerType = 'EOA' | 'GnosisSafe' | 'Timelock' | 'Governor' | 'UnknownContract';

export interface OwnerInfo {
  address: string;
  type: OwnerType;
  label?: string;
  threshold?: number;
  signerCount?: number;
  signers?: string[];
  delay?: number;
  votingPeriod?: number;
  quorum?: string;
  governanceToken?: string;
}

export interface OwnershipChain {
  contract: string;
  directOwner: OwnerInfo;
  chain: OwnerInfo[];
  ultimateControl: string;
}

export interface RedFlag {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  recommendation: string;
}

export interface RiskBreakdown {
  ownership: number;
  timelock: number;
  functions: number;
  proxy: number;
  activity: number;
}

export interface AdminAction {
  timestamp: number;
  txHash: string;
  from: string;
  functionName: string;
  functionSignature: string;
  decodedParams?: Record<string, any>;
  blockNumber: number;
}

export interface AnalysisResult {
  address: string;
  name: string;
  proxyInfo: ProxyInfo;
  ownershipChain: OwnershipChain | null;
  permissionedFunctions: PermissionedFunction[];
  redFlags: RedFlag[];
  riskScore: number;
  riskLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  riskBreakdown: RiskBreakdown;
  adminHistory: AdminAction[];
  summary: string;
  riskAssessment: string;
  analysisTimestamp: number;
  error?: string;
}

export interface AgentCheckResponse {
  address: string;
  name: string;
  riskScore: number;
  riskLevel: string;
  ultimateControl: string;
  redFlags: Array<{ severity: string; title: string; description: string }>;
  privilegedFunctions: Array<{ name: string; calledBy: string; plainEnglish: string; category: string }>;
  ownershipChain: OwnerInfo[];
  analysisTimestamp: number;
  gleipnirUrl: string;
}
