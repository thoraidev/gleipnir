import type { AnalysisResult, PermissionedFunction, ProxyInfo, RedFlag, RiskBreakdown } from './types';

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function riskLevel(score: number): AnalysisResult['riskLevel'] {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'ELEVATED';
  if (score >= 20) return 'MODERATE';
  return 'LOW';
}

function categoryWeight(fn: PermissionedFunction): number {
  switch (fn.category) {
    case 'upgradeability':
      return 18;
    case 'funds':
      return 16;
    case 'permissions':
      return 14;
    case 'pausability':
      return 10;
    case 'parameters':
      return 8;
    default:
      return 5;
  }
}

function hasRiskFactor(fn: PermissionedFunction, factor: string): boolean {
  return fn.riskFactors?.includes(factor) ?? false;
}

function functionWeight(fn: PermissionedFunction): number {
  let weight = categoryWeight(fn);
  if (hasRiskFactor(fn, 'unprotected-anyone-callable')) weight += 8;
  if (hasRiskFactor(fn, 'low-level-call')) weight += 8;
  if (hasRiskFactor(fn, 'inline-assembly')) weight += 6;
  if (hasRiskFactor(fn, 'upgrade-path')) weight += 4;
  if (hasRiskFactor(fn, 'mitigated-by-timelock-or-guard')) weight -= 4;
  if (/\b(nonReentrant|whenNotPaused|whenPaused)\b/i.test(fn.modifier)) weight -= 2;
  return Math.max(1, weight);
}

export function buildRedFlags(
  permissionedFunctions: PermissionedFunction[],
  proxyInfo: ProxyInfo
): RedFlag[] {
  const flags: RedFlag[] = [];
  const hasUpgrade = permissionedFunctions.some((fn) => fn.category === 'upgradeability');
  const hasFunds = permissionedFunctions.some((fn) => fn.category === 'funds');
  const hasPause = permissionedFunctions.some((fn) => fn.category === 'pausability');
  const hasPermissionChanges = permissionedFunctions.some((fn) => fn.category === 'permissions');
  const hasOracleOrFees = permissionedFunctions.some(
    (fn) => fn.category === 'parameters' && /(oracle|price|fee|rate|limit)/i.test(fn.functionName)
  );

  if (proxyInfo.isProxy) {
    flags.push({
      severity: proxyInfo.adminAddress ? 'MEDIUM' : 'HIGH',
      title: 'Upgradeable proxy detected',
      description: proxyInfo.adminAddress
        ? `Contract logic can be changed through a ${proxyInfo.proxyType} proxy administered by ${proxyInfo.adminAddress}.`
        : `Contract logic can be changed through a ${proxyInfo.proxyType} proxy. The proxy admin could not be resolved from available metadata.`,
      recommendation: 'Verify the proxy admin is a timelock or sufficiently decentralized multisig before relying on the protocol.',
    });
  }

  if (hasUpgrade) {
    flags.push({
      severity: 'HIGH',
      title: 'Privileged upgrade path',
      description: 'One or more restricted functions can upgrade or redirect contract logic.',
      recommendation: 'Confirm upgrades are gated by a timelock and transparent governance process.',
    });
  }

  if (hasFunds) {
    flags.push({
      severity: 'HIGH',
      title: 'Privileged fund-moving function',
      description: 'A privileged caller can mint, burn, withdraw, rescue, or transfer assets.',
      recommendation: 'Inspect exact asset scope and verify controls around the privileged caller.',
    });
  }

  if (hasPause && hasFunds) {
    flags.push({
      severity: 'CRITICAL',
      title: 'Pause plus fund movement powers',
      description: 'The same contract exposes both emergency pause controls and restricted fund-moving actions.',
      recommendation: 'Treat this as a high-centralization pattern unless protected by timelock/multisig governance.',
    });
  }

  if (hasPermissionChanges) {
    flags.push({
      severity: 'MEDIUM',
      title: 'Permissions can be changed after deployment',
      description: 'Restricted functions can grant roles, revoke roles, transfer ownership, or change admins.',
      recommendation: 'Review recent admin history and role holders before integrating.',
    });
  }

  const unprotectedCritical = permissionedFunctions.filter(
    (fn) => fn.isCritical && hasRiskFactor(fn, 'unprotected-anyone-callable')
  );
  if (unprotectedCritical.length > 0) {
    flags.push({
      severity: 'CRITICAL',
      title: 'Unprotected critical function',
      description: `${unprotectedCritical.length} critical function${unprotectedCritical.length === 1 ? '' : 's'} appear callable by anyone, including ${unprotectedCritical
        .slice(0, 3)
        .map((fn) => fn.functionName)
        .join(', ')}.`,
      recommendation: 'Verify this is intentional. Sensitive functions should usually be role-gated, timelocked, or removed.',
    });
  }

  const dangerousInternals = permissionedFunctions.filter(
    (fn) => hasRiskFactor(fn, 'low-level-call') || hasRiskFactor(fn, 'inline-assembly')
  );
  if (dangerousInternals.length > 0) {
    flags.push({
      severity: 'HIGH',
      title: 'Dangerous low-level execution path',
      description: `${dangerousInternals.length} function${dangerousInternals.length === 1 ? '' : 's'} use delegatecall, low-level call, or inline assembly.`,
      recommendation: 'Review call targets, calldata control, reentrancy protection, and upgrade authorization.',
    });
  }

  if (hasOracleOrFees) {
    flags.push({
      severity: 'MEDIUM',
      title: 'Privileged economic parameter changes',
      description: 'A privileged caller can change oracle, fee, rate, limit, or related economic parameters.',
      recommendation: 'Confirm parameter changes are rate-limited, timelocked, or governance-controlled.',
    });
  }

  if (permissionedFunctions.length === 0) {
    flags.push({
      severity: 'INFO',
      title: 'No explicit privileged functions extracted',
      description: 'No access modifiers or sender-gated require statements were detected in verified source.',
      recommendation: 'This is not a formal audit. Review inheritance, delegatecall paths, and unverified linked contracts.',
    });
  }

  return flags;
}

export function scorePermissions(
  permissionedFunctions: PermissionedFunction[],
  proxyInfo: ProxyInfo
): { riskScore: number; riskBreakdown: RiskBreakdown } {
  const criticalCount = permissionedFunctions.filter((fn) => fn.isCritical).length;
  const rawFunctionScore = permissionedFunctions.reduce((sum, fn) => sum + functionWeight(fn), 0);
  const functions = Math.min(45, rawFunctionScore + criticalCount * 2);
  const proxy = proxyInfo.isProxy ? 20 : 0;
  const ownership = permissionedFunctions.some((fn) => fn.category === 'permissions') ? 15 : 4;
  const timelock = proxyInfo.isProxy ? 12 : 8; // Conservative until the ownership-chain analyzer lands.
  const activity = 0;

  const riskBreakdown: RiskBreakdown = {
    ownership,
    timelock,
    functions,
    proxy,
    activity,
  };

  return {
    riskScore: clampScore(ownership + timelock + functions + proxy + activity),
    riskBreakdown,
  };
}

export function summarizePermissions(
  permissionedFunctions: PermissionedFunction[],
  redFlags: RedFlag[],
  score: number
): { summary: string; riskAssessment: string } {
  const critical = permissionedFunctions.filter((fn) => fn.isCritical).length;
  const categories = Array.from(new Set(permissionedFunctions.map((fn) => fn.category))).join(', ') || 'none';
  const topFlag = redFlags.find((flag) => flag.severity !== 'INFO');

  return {
    summary:
      permissionedFunctions.length === 0
        ? 'No explicit access-controlled functions were extracted from verified source.'
        : `Extracted ${permissionedFunctions.length} privileged function${permissionedFunctions.length === 1 ? '' : 's'} across ${categories}; ${critical} marked critical.`,
    riskAssessment: topFlag
      ? `${riskLevel(score)} permission risk. Primary concern: ${topFlag.title}.`
      : `${riskLevel(score)} permission risk based on extracted privileged functions.`,
  };
}
